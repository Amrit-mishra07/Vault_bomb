import { useEffect, useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { getProvider, getContract, CONTRACT_ADDRESS } from '../contracts/VaultBomb';
import { useRpcCall } from '../hooks/useRpcCall';
import { SwitchCard, SwitchInfo, SwitchStatus } from '../components/SwitchCard';

const CONTRACT_CONFIGURED = ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ethers.ZeroAddress;
const SWITCH_PAGE_SIZE = 25;
const DEFAULT_SCAN_BLOCKS = 100_000;

export default function Dashboard({ wallet }: { wallet: string | null }) {
  const { rpcCall, isRateLimited } = useRpcCall();
  const [switches, setSwitches] = useState<SwitchInfo[]>([]);
  const [watcherOffset, setWatcherOffset] = useState(0);
  const [watcherHasMore, setWatcherHasMore] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0n);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'my' | 'all'>('my');

  const loadSwitch = async (contract: ethers.Contract, id: string, blockNow: bigint): Promise<SwitchInfo> => {
    const info = await rpcCall(() => contract.getSwitchInfo(id));
    
    let status: SwitchStatus = 'ARMED';
    let irysTxId = '';
    let remainingBlocks: number | undefined;

    if (info[2]) {
      status = 'TRIGGERED';
      const triggeredFilter = contract.filters.Triggered(id);
      const fromBlock = Number(info[5]) || 0;
      const triggeredEvents = await rpcCall(() => contract.queryFilter(triggeredFilter, fromBlock));
      if (triggeredEvents.length > 0) {
        irysTxId = (triggeredEvents[0] as any).args[3];
      }
    } else {
      const windowBlocks = info[3];
      const graceBlocks = info[4];
      const lastHeartbeat = info[5];
      const expiryBlock = lastHeartbeat + windowBlocks;
      const graceExpiryBlock = expiryBlock + graceBlocks;
      
      remainingBlocks = Number(expiryBlock - blockNow);

      if (blockNow > graceExpiryBlock) {
        status = 'VULNERABLE';
        remainingBlocks = 0;
      } else if (blockNow > expiryBlock) {
        status = 'GRACE_PERIOD';
        remainingBlocks = Number(graceExpiryBlock - blockNow);
      }
    }

    return {
      id,
      owner: info[0],
      status,
      bounty: ethers.formatEther(info[6]),
      bountyClaimed: info[7],
      lastNonce: Number(info[8]),
      irysTxId,
      remainingBlocks
    };
  };

  const fetchSwitches = async (offset = 0, append = false) => {
    if (!CONTRACT_CONFIGURED) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const provider = getProvider();
      const l2BlockNow = BigInt(await rpcCall(() => provider.getBlockNumber()));
      const rawBlock = await rpcCall(() => provider.send("eth_getBlockByNumber", ["latest", false]));
      const l1BlockNow = BigInt(rawBlock.l1BlockNumber);
      setCurrentBlock(l1BlockNow);

      const contract = await getContract(provider);
      const eventFilter = contract.filters.SwitchRegistered();

      let targetIds: string[] = [];

      if (filter === 'my' && wallet) {
        // Option 1: Scan for events specifically by this owner
        const myFilter = contract.filters.SwitchRegistered(null, wallet);
        const fromBlock = Number(l2BlockNow) > DEFAULT_SCAN_BLOCKS ? Number(l2BlockNow) - DEFAULT_SCAN_BLOCKS : 0;
        const events = await rpcCall(() => contract.queryFilter(myFilter, fromBlock));
        targetIds = [...new Set(events.map(e => (e as any).args[0]))].reverse();
        
        // Also fallback to localStorage if they just created it but RPC is lagging
        try {
          const stored = localStorage.getItem('vaultBombSwitches');
          if (stored) {
            const parsed = JSON.parse(stored);
            for (const s of parsed) {
              if (!targetIds.includes(s.id)) targetIds.push(s.id);
            }
          }
        } catch(e) {}
      } else {
        // All switches
        const fromBlock = Number(l2BlockNow) > DEFAULT_SCAN_BLOCKS ? Number(l2BlockNow) - DEFAULT_SCAN_BLOCKS : 0;
        const events = await rpcCall(() => contract.queryFilter(eventFilter, fromBlock));
        targetIds = [...new Set(events.map(e => (e as any).args[0]))].reverse();
      }

      const pageIds = targetIds.slice(offset, offset + SWITCH_PAGE_SIZE);

      // Using the batchedMap logic implicitly inside WatcherDashboard (which we ported to rpc.ts)
      // We need to import batchedMap. Wait, it's in rpc.ts!
      const { batchedMap } = await import('../utils/rpc');
      
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
      setWatcherHasMore(offset + pageIds.length < targetIds.length);
    } catch (error) {
      console.error("Failed to fetch switches", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchTriggered = useCallback(async (switchId: string, arweaveTxId?: string) => {
    setSwitches(current => current.map(sw => 
      sw.id === switchId 
        ? { ...sw, status: 'TRIGGERED' as SwitchStatus, irysTxId: arweaveTxId || sw.irysTxId } 
        : sw
    ));
  }, []);

  const handleHeartbeat = useCallback((_switchId: string) => {
    fetchSwitches();
  }, [filter, wallet]);

  const handleBountyClaimed = useCallback((switchId: string) => {
    setSwitches(current => current.map(sw =>
      sw.id === switchId ? { ...sw, bountyClaimed: true } : sw
    ));
  }, []);

  useEffect(() => {
    setSwitches([]);
    setWatcherOffset(0);
    fetchSwitches(0, false);
    
    const pollInterval = CONTRACT_CONFIGURED
      ? setInterval(() => { fetchSwitches(0, false); }, 30_000)
      : undefined;

    return () => { if (pollInterval) clearInterval(pollInterval); };
  }, [filter, wallet]);

  return (
    <div className="py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 border-b border-white/10 pb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-4">Dashboard</h1>
          <div className="flex gap-4 border border-white/10 p-1 bg-white/5 inline-flex">
            <button 
              onClick={() => setFilter('my')}
              className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${filter === 'my' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
            >
              My Switches
            </button>
            <button 
              onClick={() => setFilter('all')}
              className={`px-6 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${filter === 'all' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'}`}
            >
              All Switches
            </button>
          </div>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          {isRateLimited && (
            <span className="text-xs text-yellow-500 font-mono bg-yellow-500/10 px-2 py-1 border border-yellow-500/20">
              ⏳ RPC Rate Limit Delay
            </span>
          )}
          <div className="text-xs text-gray-500 font-mono">
            L1 Block: {currentBlock > 0n ? currentBlock.toString() : '---'}
          </div>
        </div>
      </div>

      {!CONTRACT_CONFIGURED ? (
        <div className="p-6 border border-red-500/30 bg-red-950/20 text-red-400 font-mono text-sm">
          Set VITE_CONTRACT_ADDRESS to a deployed contract address.
        </div>
      ) : switches.length === 0 && !isLoading ? (
        <div className="p-12 border border-white/10 text-center text-gray-500 font-mono text-sm">
          {filter === 'my' && !wallet ? "Connect your wallet to see your switches." : "No switches found."}
        </div>
      ) : (
        <div className="space-y-4">
          {switches.map(sw => (
            <SwitchCard 
              key={sw.id} 
              sw={sw} 
              wallet={wallet} 
              onTriggered={handleSwitchTriggered}
              onHeartbeat={handleHeartbeat}
              onClaimed={handleBountyClaimed}
            />
          ))}
          
          {isLoading && (
            <div className="p-6 border border-white/10 bg-white/5 animate-pulse flex items-center justify-center">
              <span className="text-xs font-mono text-gray-500 tracking-widest uppercase">Fetching state...</span>
            </div>
          )}

          {watcherHasMore && !isLoading && (
            <button 
              onClick={() => fetchSwitches(watcherOffset, true)}
              className="w-full py-4 border border-white/10 text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-colors text-gray-400"
            >
              Load More
            </button>
          )}
        </div>
      )}
    </div>
  );
}
