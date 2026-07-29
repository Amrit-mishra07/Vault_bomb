import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';
const CONTRACT_CONFIGURED = ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ethers.ZeroAddress;
const SWITCH_PAGE_SIZE = 25;
const ABI = [
  "function get_switch_info(bytes32 switch_id) external view returns (address owner, bool is_active, bool is_triggered, uint256 heartbeat_window_blocks, uint256 grace_period_blocks, uint256 last_heartbeat_block, uint256 bounty_amount, bool bounty_claimed, uint256 last_nonce)",
  "event SwitchRegistered(bytes32 indexed switchId, address indexed journalist, uint256 heartbeatWindowBlocks, uint256 bountyAmount)",
  "event Triggered(bytes32 indexed switchId, address indexed journalist, address indexed triggerer, string arweaveTxId)",
  "event PlaintextPublished(bytes32 indexed switchId, string arweaveTxId)"
];

type SwitchStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'TRIGGERED' | 'PUBLISHED';

type SwitchInfo = {
  id: string;
  owner: string;
  status: SwitchStatus;
  bounty: string;
  bountyClaimed: boolean;
};

const providerForReads = () => new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");

function App() {
  const [switches, setSwitches] = useState<SwitchInfo[]>([]);
  const [watcherOffset, setWatcherOffset] = useState(0);
  const [watcherHasMore, setWatcherHasMore] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0n);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCurrentBlock = async () => {
    try {
      const block = await providerForReads().getBlockNumber();
      setCurrentBlock(BigInt(block));
    } catch (e) {
      console.error("Failed to fetch block number", e);
    }
  };

  const loadSwitch = async (contract: ethers.Contract, id: string, blockNow: bigint): Promise<SwitchInfo> => {
    const info = await contract.get_switch_info(id);
    
    let status: SwitchStatus = 'ACTIVE';
    if (info.is_triggered) {
      status = 'TRIGGERED';
      // In a real app we would check for PlaintextPublished event here to set 'PUBLISHED'
    } else {
      const windowBlocks = info.heartbeat_window_blocks;
      const lastHeartbeat = info.last_heartbeat_block;
      if (blockNow > lastHeartbeat + windowBlocks) {
        status = 'GRACE_PERIOD';
      }
    }

    return {
      id,
      owner: info.owner,
      status,
      bounty: ethers.formatEther(info.bounty_amount),
      bountyClaimed: info.bounty_claimed,
    };
  };

  const fetchSwitches = async (offset = 0, append = false) => {
    if (!CONTRACT_CONFIGURED) return;
    setIsLoading(true);
    try {
      const provider = providerForReads();
      const blockNow = BigInt(await provider.getBlockNumber());
      setCurrentBlock(blockNow);

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const filter = contract.filters.SwitchRegistered();
      const events = await contract.queryFilter(filter);
      const ids = [...new Set(events.map(e => (e as any).args[0]))].reverse();
      const pageIds = ids.slice(offset, offset + SWITCH_PAGE_SIZE);
      const loaded = await Promise.all(pageIds.map(id => loadSwitch(contract, id, blockNow)));
      
      setSwitches(current => append ? [...current, ...loaded] : loaded);
      setWatcherOffset(offset + pageIds.length);
      setWatcherHasMore(offset + pageIds.length < ids.length);
    } catch (error) {
      console.error("Failed to fetch switches", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentBlock();
    fetchSwitches();
    
    // Listen for PlaintextPublished
    if (CONTRACT_CONFIGURED) {
       const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, providerForReads());
       const onPublished = (switchId: string) => {
          setSwitches(current => current.map(sw => sw.id === switchId ? { ...sw, status: 'PUBLISHED' } : sw));
       };
       contract.on("PlaintextPublished", onPublished);
       return () => {
         contract.off("PlaintextPublished", onPublished);
       };
    }
  }, []);

  return <div className="container">
    <h1>Vault Bomb</h1>
    <div className="subtitle">Unstoppable Dead-Man's Switch (Public Watcher)</div>

    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2>Watcher Dashboard</h2>
          <div style={{ fontSize: '0.9rem', color: '#8a8a9d' }}>Current Block: {currentBlock.toString()}</div>
      </div>
      
      {!CONTRACT_CONFIGURED ? <div className="card">Set <code>VITE_CONTRACT_ADDRESS</code> to a deployed contract address.</div> : 
       switches.length === 0 && !isLoading ? <div className="card">No switches active on this network.</div> : 
       switches.map(sw => <div key={sw.id} className="card" style={{ 
          borderLeft: sw.status === 'ACTIVE' ? '4px solid #00e676' : 
                      sw.status === 'GRACE_PERIOD' ? '4px solid #ffb300' : 
                      sw.status === 'TRIGGERED' ? '4px solid #ff5252' : '4px solid #b388ff' 
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
                <strong>Owner:</strong> <span style={{ fontFamily: 'monospace' }}>{sw.owner}</span><br />
                <strong>Switch:</strong> <span style={{ fontFamily: 'monospace' }}>{sw.id}</span>
            </div>
            <div style={{ 
                color: sw.status === 'ACTIVE' ? '#00e676' : 
                       sw.status === 'GRACE_PERIOD' ? '#ffb300' : 
                       sw.status === 'TRIGGERED' ? '#ff5252' : '#b388ff',
                fontWeight: 'bold'
            }}>
                {sw.status.replace('_', ' ')}
            </div>
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#8a8a9d' }}>Bounty Pool: {sw.bounty} ETH{sw.bountyClaimed ? ' (Claimed)' : ''}</div>
      </div>)}
      {isLoading && <div style={{ textAlign: 'center', marginTop: '20px' }}>Loading...</div>}
      {watcherHasMore && !isLoading && <button onClick={() => fetchSwitches(watcherOffset, true)}>Load more switches</button>}
    </div>
  </div>;
}

export default App
