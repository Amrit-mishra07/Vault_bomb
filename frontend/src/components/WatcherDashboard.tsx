import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { getProvider, getContract } from '../contracts/VaultBomb';
import { TriggerButton } from './TriggerButton';
import { ViewSecret } from './ViewSecret';
import { HeartbeatButton } from './HeartbeatButton';
import { ClaimBountyButton } from './ClaimBountyButton';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';
const CONTRACT_CONFIGURED = ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ethers.ZeroAddress;
const SWITCH_PAGE_SIZE = 25;

// ~2M blocks ≈ ~6 days on Arbitrum Sepolia (~250ms/block)
const DEFAULT_SCAN_BLOCKS = 2_000_000;

type SwitchStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'VULNERABLE' | 'TRIGGERED' | 'PUBLISHED';

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
  const [switches, setSwitches] = useState<SwitchInfo[]>([]);
  const [watcherOffset, setWatcherOffset] = useState(0);
  const [watcherHasMore, setWatcherHasMore] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0n);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCurrentBlock = async () => {
    try {
      const provider = getProvider();
      // Arbitrum EVM block.number returns the L1 block number.
      // provider.getBlockNumber() returns the L2 block number.
      // We must fetch the L1 block number to match the contract's block math!
      const rawBlock = await provider.send("eth_getBlockByNumber", ["latest", false]);
      setCurrentBlock(BigInt(rawBlock.l1BlockNumber));
    } catch (e) {
      console.error("Failed to fetch block number", e);
    }
  };

  const loadSwitch = async (contract: ethers.Contract, id: string, blockNow: bigint): Promise<SwitchInfo> => {
    const info = await contract.getSwitchInfo(id);
    
    let status: SwitchStatus = 'ACTIVE';
    let irysTxId = '';

    if (info.is_triggered) {
      status = 'TRIGGERED';
      
      // Fetch the irysTxId emitted in the Triggered event using fromBlock to prevent RPC timeouts
      const triggeredFilter = contract.filters.Triggered(id);
      const fromBlock = Number(info.last_heartbeat_block) || 0;
      const triggeredEvents = await contract.queryFilter(triggeredFilter, fromBlock);
      if (triggeredEvents.length > 0) {
        irysTxId = (triggeredEvents[0] as any).args[3];
      }
    } else {
      const windowBlocks = info.heartbeat_window_blocks;
      const graceBlocks = info.grace_period_blocks;
      const lastHeartbeat = info.last_heartbeat_block;
      if (blockNow > lastHeartbeat + windowBlocks + graceBlocks) {
        // Frontend thinks it's vulnerable — verify with a staticCall to the contract
        // to avoid showing the trigger button when the contract would actually reject it
        try {
          await contract.triggerRelease.staticCall(id);
          status = 'VULNERABLE';
        } catch (err: any) {
          // Only fall back to GRACE_PERIOD if the contract specifically says the window
          // hasn't expired. Any other error (network, provider, etc.) should trust the
          // frontend's block-based math and show VULNERABLE.
          const data = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
          let revertReason = '';
          if (typeof data === 'string' && data.startsWith('0x') && data.length > 2) {
            try {
              revertReason = new TextDecoder('utf-8', { fatal: true }).decode(ethers.getBytes(data));
            } catch { /* not valid UTF-8 */ }
          }
          if (revertReason === 'Window not expired') {
            status = 'GRACE_PERIOD';
          } else {
            // Network error, provider issue, or unknown revert — trust frontend math
            status = 'VULNERABLE';
          }
        }
      } else if (blockNow > lastHeartbeat + windowBlocks) {
        status = 'GRACE_PERIOD';
      }
    }

    return {
      id,
      owner: info.owner,
      status,
      bounty: ethers.formatEther(info.bounty_amount),
      bountyClaimed: info.bounty_claimed,
      lastNonce: Number(info.last_nonce),
      irysTxId,
    };
  };

  const fetchSwitches = async (offset = 0, append = false) => {
    if (!CONTRACT_CONFIGURED) return;
    setIsLoading(true);
    try {
      const provider = getProvider();
      const l2BlockNow = BigInt(await provider.getBlockNumber());
      const rawBlock = await provider.send("eth_getBlockByNumber", ["latest", false]);
      const l1BlockNow = BigInt(rawBlock.l1BlockNumber);
      setCurrentBlock(l1BlockNow);

      const contract = await getContract(provider);
      const filter = contract.filters.SwitchRegistered();

      // Arbitrum blocks are ~250ms, so scan last ~2M blocks (~6 days).
      // We must use the L2 block number for querying events!
      let fromBlock = Number(l2BlockNow) > DEFAULT_SCAN_BLOCKS ? Number(l2BlockNow) - DEFAULT_SCAN_BLOCKS : 0;
      let events = await contract.queryFilter(filter, fromBlock);

      // Fallback: if no events found and we didn't already scan from 0, retry from genesis
      if (events.length === 0 && fromBlock > 0) {
        console.log("No switches found in recent blocks, scanning from genesis...");
        events = await contract.queryFilter(filter, 0);
      }

      const ids = [...new Set(events.map(e => (e as any).args[0]))].reverse();
      const pageIds = ids.slice(offset, offset + SWITCH_PAGE_SIZE);
      const loaded = (await Promise.all(pageIds.map(async id => {
        try {
          return await loadSwitch(contract, id, l1BlockNow);
        } catch (e) {
          console.error("Failed to load switch", id, e);
          return null;
        }
      }))).filter(Boolean) as SwitchInfo[];
      
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
    fetchCurrentBlock();
    fetchSwitches();
    
    // Poll every 30s to detect status transitions (ACTIVE → GRACE_PERIOD → VULNERABLE)
    // These transitions don't emit on-chain events, so polling is required.
    const pollInterval = CONTRACT_CONFIGURED
      ? setInterval(() => { fetchSwitches(); }, 30_000)
      : undefined;

    if (CONTRACT_CONFIGURED) {
       let contract: ethers.Contract;
       const setupListener = async () => {
           contract = await getContract(getProvider());

           // Listen for Triggered events to auto-update switch status
           contract.on("Triggered", onTriggered);
           contract.on("PlaintextPublished", onPublished);
       }

       const onTriggered = (switchId: string, _journalist: string, _triggerer: string, arweaveTxId: string) => {
         setSwitches(current => current.map(sw => 
           sw.id === switchId 
             ? { ...sw, status: 'TRIGGERED', irysTxId: arweaveTxId } 
             : sw
         ));
       };

       const onPublished = (switchId: string) => {
          setSwitches(current => current.map(sw => sw.id === switchId ? { ...sw, status: 'PUBLISHED' } : sw));
       };
       setupListener();
       return () => {
         if (pollInterval) clearInterval(pollInterval);
         if (contract) {
           contract.off("Triggered", onTriggered);
           contract.off("PlaintextPublished", onPublished);
         }
       };
    }

    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Watcher Dashboard</h2>
          <div style={{ fontSize: '0.9rem', color: '#8a8a9d' }}>Current Block: {currentBlock.toString()}</div>
      </div>
      
      {!CONTRACT_CONFIGURED ? <div className="panel">Set <code>VITE_CONTRACT_ADDRESS</code> to a deployed contract address.</div> : 
       switches.length === 0 && !isLoading ? <div className="panel">No switches active on this network.</div> : 
       switches.map(sw => <div key={sw.id} className="panel" style={{ 
          marginBottom: '1rem',
          borderLeft: sw.status === 'ACTIVE' ? '4px solid #00e676' : 
                      sw.status === 'GRACE_PERIOD' ? '4px solid #ffb300' : 
                      sw.status === 'VULNERABLE' ? '4px solid #ff1744' :
                      sw.status === 'TRIGGERED' ? '4px solid #ff5252' : '4px solid #b388ff' 
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ paddingRight: '1rem' }}>
                <strong>Owner:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sw.owner}</span><br />
                <strong>Switch:</strong> <span style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{sw.id}</span>
            </div>
            <div style={{ 
                color: sw.status === 'ACTIVE' ? '#00e676' : 
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
                {sw.status !== 'TRIGGERED' && sw.status !== 'PUBLISHED' && wallet.toLowerCase() === sw.owner.toLowerCase() && (
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
