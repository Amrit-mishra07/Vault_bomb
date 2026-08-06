import { useEffect, useState, useCallback, useRef } from 'react';
import { ethers } from 'ethers';
import { getProvider, getContract } from '../contracts/VaultBomb';
import { TriggerButton } from './TriggerButton';
import { ViewSecret } from './ViewSecret';
import { HeartbeatButton } from './HeartbeatButton';
import { ClaimBountyButton } from './ClaimBountyButton';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';
const CONTRACT_CONFIGURED = ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ethers.ZeroAddress;
const SWITCH_PAGE_SIZE = 25;

// ~100k blocks ≈ ~6 hours on Arbitrum Sepolia (~250ms/block)
// We reduce this from 2M to 100k to prevent "block range too large" and 429 rate limit errors on public RPCs.
const DEFAULT_SCAN_BLOCKS = 100_000;

/** Max concurrent RPC requests per batch to stay within public endpoint limits. */
const RPC_BATCH_SIZE = 5;
/** Delay (ms) between sequential batches to allow
 * the RPC rate-limit bucket to refill. */
const RPC_BATCH_DELAY_MS = 300;
/** Maximum number of retries on a retriable RPC error (e.g. HTTP 429). */
const RPC_MAX_RETRIES = 3;
/** Initial backoff duration (ms); doubles on each consecutive retry. */
const RPC_INITIAL_BACKOFF_MS = 1_000;

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps an async RPC call with exponential-backoff retry logic.
 * Retries on HTTP 429 (rate limited) and generic network errors.
 * Re-throws immediately for contract revert errors so callers can
 * inspect the revert reason without waiting for retries.
 * Accepts an optional onError callback to forward errors externally.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  onError?: (err: unknown) => void,
  maxRetries = RPC_MAX_RETRIES,
  initialBackoffMs = RPC_INITIAL_BACKOFF_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      onError?.(err);
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      const isRevert =
        (err as any)?.code === 'CALL_EXCEPTION' ||
        (err as any)?.info?.error?.code === 3;
      if (isRevert) throw err; // surface contract reverts immediately
      const isRetriable =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('network error') ||
        message.includes('failed to fetch');
      if (!isRetriable || attempt === maxRetries) break;
      const backoff = initialBackoffMs * 2 ** attempt;
      console.warn(`[RPC] Attempt ${attempt + 1} failed, retrying in ${backoff}ms…`, message);
      await sleep(backoff);
    }
  }
  throw lastError;
}

/**
 * Executes an array of async tasks in sequential batches of `batchSize`,
 * inserting `delayMs` between each batch to reduce RPC burst traffic.
 */
async function batchedMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = RPC_BATCH_SIZE,
  delayMs = RPC_BATCH_DELAY_MS,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  return results;
}

type SwitchStatus = 'ARMED' | 'GRACE_PERIOD' | 'VULNERABLE' | 'TRIGGERED' | 'PUBLISHED';

type SwitchInfo = {
  id: string;
  owner: string;
  status: SwitchStatus;
  bounty: string;
  bountyClaimed: boolean;
  lastNonce: number;
  irysTxId?: string;
};

type WatcherDashboardProps = {
  /** The currently connected wallet address, used to gate the HeartbeatButton to owners only. */
  wallet: string;
};

export function WatcherDashboard({ wallet }: WatcherDashboardProps) {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  // Keep a stable ref so async callbacks always call the latest acquireRateLimit
  const acquireRef = useRef(acquireRateLimit);
  acquireRef.current = acquireRateLimit;
  const reportRef = useRef(reportError);
  reportRef.current = reportError;

  /**
   * Wraps an async RPC call with both global rate-limiting and
   * exponential-backoff retry logic, in that order.
   *
   * Rate limit is acquired first, then the call is attempted with retries.
   * 429 errors are forwarded to reportError() to trigger the global cooldown.
   */
  async function rpcCall<T>(fn: () => Promise<T>): Promise<T> {
    await acquireRef.current();
    return withRetry(fn, (err) => reportRef.current(err));
  }
  const [switches, setSwitches] = useState<SwitchInfo[]>([]);
  const [watcherOffset, setWatcherOffset] = useState(0);
  const [watcherHasMore, setWatcherHasMore] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0n);
  const [isLoading, setIsLoading] = useState(false);

  const loadSwitch = async (contract: ethers.Contract, id: string, blockNow: bigint): Promise<SwitchInfo> => {
    const info = await rpcCall(() => contract.getSwitchInfo(id));
    
    let status: SwitchStatus = 'ARMED';
    let irysTxId = '';

    if (info[2]) { // info.is_triggered
      status = 'TRIGGERED';
      
      // Fetch the irysTxId emitted in the Triggered event
      const triggeredFilter = contract.filters.Triggered(id);
      const fromBlock = Number(info[5]) || 0; // info.last_heartbeat_block
      const triggeredEvents = await rpcCall(() => contract.queryFilter(triggeredFilter, fromBlock));
      if (triggeredEvents.length > 0) {
        irysTxId = (triggeredEvents[0] as any).args[3];
      }
    } else {
      const windowBlocks = info[3]; // info.heartbeat_window_blocks
      const graceBlocks = info[4]; // info.grace_period_blocks
      const lastHeartbeat = info[5]; // info.last_heartbeat_block
      // Trust the frontend block math; the staticCall pre-flight is deferred to TriggerButton click.
      if (blockNow > lastHeartbeat + windowBlocks + graceBlocks) {
        status = 'VULNERABLE';
      } else if (blockNow > lastHeartbeat + windowBlocks) {
        status = 'GRACE_PERIOD';
      }
    }

    return {
      id,
      owner: info[0], // info.owner
      status,
      bounty: ethers.formatEther(info[6]), // info.bounty_amount
      bountyClaimed: info[7], // info.bounty_claimed
      lastNonce: Number(info[8]), // info.last_nonce
      irysTxId,
    };
  };

  const fetchSwitches = async (offset = 0, append = false) => {
    if (!CONTRACT_CONFIGURED) return;
    setIsLoading(true);
    try {
      const provider = getProvider();
      // Both block fetches go through rpcCall so they consume rate-limit tokens correctly.
      const l2BlockNow = BigInt(await rpcCall(() => provider.getBlockNumber()));
      const rawBlock = await rpcCall(() => provider.send("eth_getBlockByNumber", ["latest", false]));
      const l1BlockNow = BigInt(rawBlock.l1BlockNumber);
      setCurrentBlock(l1BlockNow);

      const contract = await getContract(provider);
      const filter = contract.filters.SwitchRegistered();

      // Arbitrum blocks are ~250ms, so scan last 10k blocks (~41 minutes).
      // We must use the L2 block number for querying events!
      const fromBlock = Number(l2BlockNow) > DEFAULT_SCAN_BLOCKS ? Number(l2BlockNow) - DEFAULT_SCAN_BLOCKS : 0;
      const events = await rpcCall(() => contract.queryFilter(filter, fromBlock));

      const ids = [...new Set(events.map(e => (e as any).args[0]))].reverse();
      const pageIds = ids.slice(offset, offset + SWITCH_PAGE_SIZE);

      // Process switch loads in rate-limited batches to avoid bursting the RPC endpoint.
      // Each switch can make up to 3 RPC calls; batching 5 at a time with a 300ms delay
      // keeps total concurrent requests well within public endpoint limits.
      const loaded = (await batchedMap(pageIds, async id => {
        try {
          return await loadSwitch(contract, id, l1BlockNow);
        } catch (e) {
          console.error("Failed to load switch", id, e);
          return null;
        }
      })).filter(Boolean) as SwitchInfo[];
      
      setSwitches(current => append ? [...current, ...loaded] : loaded);
      setWatcherOffset(offset + pageIds.length);
      setWatcherHasMore(offset + pageIds.length < ids.length);
    } catch (error) {
      console.error("Failed to fetch switches", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Callback for TriggerButton: after a successful trigger, reload that switch's data
  const handleSwitchTriggered = useCallback(async (switchId: string, arweaveTxId?: string) => {
    setSwitches(current => current.map(sw => 
      sw.id === switchId 
        ? { ...sw, status: 'TRIGGERED' as SwitchStatus, irysTxId: arweaveTxId || sw.irysTxId } 
        : sw
    ));
  }, []);

  // Callback for HeartbeatButton: refresh full switch data after a successful heartbeat
  const handleHeartbeat = useCallback((switchId: string) => {
    // Re-fetch this switch's info from chain so status and nonce are up-to-date
    fetchSwitches();
    console.log(`[Heartbeat] Switch ${switchId} reset. Re-fetching dashboard state.`);
  }, []);

  // Callback for ClaimBountyButton: mark bounty as claimed immediately in local state
  const handleBountyClaimed = useCallback((switchId: string) => {
    setSwitches(current => current.map(sw =>
      sw.id === switchId ? { ...sw, bountyClaimed: true } : sw
    ));
  }, []);

  useEffect(() => {
    fetchSwitches();
    
    // Poll every 30s to detect status transitions and new switches.
    // contract.on() is intentionally avoided — it polls eth_getLogs every 4s and
    // rapidly burns through the public RPC rate limit budget.
    const pollInterval = CONTRACT_CONFIGURED
      ? setInterval(() => { fetchSwitches(); }, 30_000)
      : undefined;

    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Watcher Dashboard</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {isRateLimited && (
              <span style={{ fontSize: '0.75rem', color: '#ffb300', background: 'rgba(255,179,0,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,179,0,0.3)' }}>
                ⏳ Hit Rate Limit
              </span>
            )}
            <div style={{ fontSize: '0.9rem', color: '#8a8a9d' }}>Current Block: {currentBlock.toString()}</div>
          </div>
      </div>
      
      {!CONTRACT_CONFIGURED ? <div className="panel">Set <code>VITE_CONTRACT_ADDRESS</code> to a deployed contract address.</div> : 
       switches.length === 0 && !isLoading ? <div className="panel">No switches active on this network.</div> : 
       switches.map(sw => <div key={sw.id} className="panel" style={{ 
          marginBottom: '1rem',
          borderLeft: sw.status === 'ARMED' ? '4px solid #00e676' : 
                      sw.status === 'GRACE_PERIOD' ? '4px solid #ffb300' : 
                      sw.status === 'VULNERABLE' ? '4px solid #ff1744' :
                      sw.status === 'TRIGGERED' ? '4px solid #ff5252' : '4px solid #b388ff' 
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ paddingRight: '1rem' }}>
                <strong>Owner:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sw.owner}</span> {wallet.toLowerCase() === sw.owner.toLowerCase() && <span style={{ color: '#00e676', fontWeight: 'bold' }}>(You)</span>}<br />
                <strong>Switch:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sw.id}</span>
            </div>
            <div style={{ 
                color: sw.status === 'ARMED' ? '#00e676' : 
                       sw.status === 'GRACE_PERIOD' ? '#ffb300' : 
                       sw.status === 'VULNERABLE' ? '#ff1744' :
                       sw.status === 'TRIGGERED' ? '#ff5252' : '#b388ff',
                fontWeight: 'bold',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '10px'
            }}>
                {sw.status.replace('_', ' ')}
                {sw.status === 'VULNERABLE' && <TriggerButton switchId={sw.id} onTriggered={handleSwitchTriggered} />}
                {(sw.status === 'ARMED' || sw.status === 'GRACE_PERIOD') && wallet.toLowerCase() === sw.owner.toLowerCase() && (
                  <HeartbeatButton switchId={sw.id} onHeartbeat={handleHeartbeat} />
                )}
            </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#8a8a9d' }}>Bounty Pool: {sw.bounty} ETH{sw.bountyClaimed ? ' (Claimed)' : ''}</div>

        {(sw.status === 'TRIGGERED' || sw.status === 'PUBLISHED') && !sw.bountyClaimed && (
          <div style={{ marginTop: '10px' }}>
            <ClaimBountyButton switchId={sw.id} onClaimed={handleBountyClaimed} />
          </div>
        )}

        {sw.status === 'TRIGGERED' && sw.irysTxId && (
            <ViewSecret switchId={sw.id} irysTxId={sw.irysTxId} />
        )}
      </div>)}
      {isLoading && <div style={{ textAlign: 'center', marginTop: '20px' }}>Loading...</div>}
      {watcherHasMore && !isLoading && <button onClick={() => fetchSwitches(watcherOffset, true)}>Load more switches</button>}
    </div>
  );
}
