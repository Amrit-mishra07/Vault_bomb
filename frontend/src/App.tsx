import { useEffect, useState } from 'react'
import { ethers } from 'ethers'

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';
const CONTRACT_CONFIGURED = ethers.isAddress(CONTRACT_ADDRESS) && CONTRACT_ADDRESS !== ethers.ZeroAddress;
const SWITCH_PAGE_SIZE = 25;
const ABI = [
  "function register_switch(bytes32 switch_id, uint256 heartbeat_window_blocks, uint256 grace_period_blocks, string arweave_tx_id, bytes32 evidence_hash, address duress_wallet, address backup_wallet) external payable",
  "function heartbeat(bytes32 switch_id, uint256 nonce) external",
  "function trigger_release(bytes32 switch_id) external",
  "function claim_bounty(bytes32 switch_id, bytes lit_proof) external",
  "function get_switch_info(bytes32 switch_id) external view returns (address owner, bool is_active, bool is_triggered, uint256 heartbeat_window_blocks, uint256 last_heartbeat_block, uint256 bounty_amount, bool bounty_claimed, uint256 last_nonce)",
  "event SwitchRegistered(bytes32 indexed switchId, address indexed journalist, uint256 heartbeatWindowBlocks, uint256 bountyAmount)"
];

type SwitchInfo = {
  id: string;
  owner: string;
  active: boolean;
  triggered: boolean;
  bounty: string;
  bountyClaimed: boolean;
  lastNonce: bigint;
};

const providerForReads = () => new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");

function App() {
  const [activeTab, setActiveTab] = useState<'setup' | 'watcher'>('setup');
  const [account, setAccount] = useState('');
  const [status, setStatus] = useState('Ready to arm another switch');
  const [windowBlocks, setWindowBlocks] = useState('50');
  const [evidenceText, setEvidenceText] = useState('');
  const [bountyEth, setBountyEth] = useState('0.01');
  const [isProcessing, setIsProcessing] = useState(false);
  const [switches, setSwitches] = useState<SwitchInfo[]>([]);
  const [ownedSwitches, setOwnedSwitches] = useState<SwitchInfo[]>([]);
  const [selectedSwitchId, setSelectedSwitchId] = useState('');
  const [watcherOffset, setWatcherOffset] = useState(0);
  const [watcherHasMore, setWatcherHasMore] = useState(false);

  const connectWallet = async () => {
    if (!(window as any).ethereum) return alert("Please install MetaMask!");
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
    } catch (err) {
      console.error("User rejected request", err);
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
    return window.btoa(binary);
  };

  const loadSwitch = async (contract: ethers.Contract, id: string): Promise<SwitchInfo> => {
    const info = await contract.get_switch_info(id);
    return {
      id,
      owner: info.owner,
      active: info.is_active,
      triggered: info.is_triggered,
      bounty: ethers.formatEther(info.bounty_amount),
      bountyClaimed: info.bounty_claimed,
      lastNonce: info.last_nonce,
    };
  };

  const refreshOwnedSwitches = async (owner = account) => {
    if (!owner || !CONTRACT_CONFIGURED) return;
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, providerForReads());
      const filter = contract.filters.SwitchRegistered(null, owner);
      const events = await contract.queryFilter(filter);
      const ids = [...new Set(events.map(e => (e as any).args[0]))];
      const loaded = await Promise.all(ids.map(id => loadSwitch(contract, id)));
      setOwnedSwitches(loaded);
      setSelectedSwitchId(current => current || loaded[0]?.id || '');
    } catch (error) {
      console.error("Failed to load owned switches", error);
    }
  };

  const fetchSwitches = async (offset = 0, append = false) => {
    if (!CONTRACT_CONFIGURED) {
      setSwitches([]);
      setWatcherHasMore(false);
      return;
    }
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, providerForReads());
      const filter = contract.filters.SwitchRegistered();
      const events = await contract.queryFilter(filter);
      const ids = [...new Set(events.map(e => (e as any).args[0]))].reverse();
      const pageIds = ids.slice(offset, offset + SWITCH_PAGE_SIZE);
      const loaded = await Promise.all(pageIds.map(id => loadSwitch(contract, id)));
      setSwitches(current => append ? [...current, ...loaded] : loaded);
      setWatcherOffset(offset + pageIds.length);
      setWatcherHasMore(offset + pageIds.length < ids.length);
    } catch (error) {
      console.error("Failed to fetch switches", error);
    }
  };

  const handleRegister = async () => {
    if (!account) return alert("Connect wallet first!");
    if (!CONTRACT_CONFIGURED) return alert("Set VITE_CONTRACT_ADDRESS to a deployed contract address first.");
    if (!evidenceText || !bountyEth) return alert("Enter evidence and a bounty amount first!");

    setIsProcessing(true);
    setStatus("Encrypting evidence...");
    try {
      const switchId = ethers.hexlify(window.crypto.getRandomValues(new Uint8Array(32)));
      const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const aesKey = arrayBufferToBase64(await window.crypto.subtle.exportKey("raw", key));
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const evidence = new TextEncoder().encode(evidenceText);
      const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, evidence);
      const combined = new Uint8Array(iv.length + ciphertext.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(ciphertext), iv.length);
      const evidenceHash = "0x" + Array.from(new Uint8Array(await window.crypto.subtle.digest("SHA-256", evidence))).map(byte => byte.toString(16).padStart(2, '0')).join('');

      setStatus("Securing key with Lit simulator...");
      const litResponse = await fetch("http://localhost:3000/store-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ switchId, journalistAddress: account, aesKey, evidenceHash, ciphertext: arrayBufferToBase64(combined.buffer) })
      });
      if (!litResponse.ok || !(await litResponse.json()).success) throw new Error("Lit nodes rejected the payload");

      setStatus("Registering switch...");
      const signer = await new ethers.BrowserProvider((window as any).ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = await contract.register_switch(switchId, windowBlocks, 10, "arweave_mock_tx_123", evidenceHash, ethers.ZeroAddress, ethers.ZeroAddress, { value: ethers.parseEther(bountyEth) });
      await tx.wait();
      setSelectedSwitchId(switchId);
      setEvidenceText('');
      setStatus("Switch armed");
      await refreshOwnedSwitches();
      alert("Switch successfully armed! You can create another one with this wallet.");
    } catch (error: any) {
      console.error(error);
      setStatus("Ready to arm another switch");
      alert("Failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHeartbeat = async () => {
    if (!CONTRACT_CONFIGURED) return alert("Set VITE_CONTRACT_ADDRESS to a deployed contract address first.");
    const selected = ownedSwitches.find(sw => sw.id === selectedSwitchId);
    if (!selected) return alert("Choose one of your switches first.");
    try {
      setIsProcessing(true);
      const signer = await new ethers.BrowserProvider((window as any).ethereum).getSigner();
      await (await new ethers.Contract(CONTRACT_ADDRESS, ABI, signer).heartbeat(selected.id, selected.lastNonce + 1n)).wait();
      await refreshOwnedSwitches();
      alert("Heartbeat successfully sent!");
    } catch (error: any) {
      console.error(error);
      alert("Heartbeat failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBotAction = async (method: 'trigger_release' | 'claim_bounty', switchId: string) => {
    if (!account) return alert("Connect wallet first!");
    if (!CONTRACT_CONFIGURED) return alert("Set VITE_CONTRACT_ADDRESS to a deployed contract address first.");
    try {
      setIsProcessing(true);
      const signer = await new ethers.BrowserProvider((window as any).ethereum).getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      const tx = method === 'trigger_release'
        ? await contract.trigger_release(switchId)
        : await contract.claim_bounty(switchId, "0xdeadbeef");
      await tx.wait();
      await fetchSwitches();
    } catch (error: any) {
      console.error(error);
      alert(`${method} failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    setOwnedSwitches([]);
    setSelectedSwitchId('');
    refreshOwnedSwitches();
  }, [account]);
  useEffect(() => {
    if (activeTab === 'watcher') fetchSwitches();
  }, [activeTab]);

  return <div className="container">
    <h1>Vault Bomb</h1>
    <div className="subtitle">Unstoppable Dead-Man's Switch (Powered by Lit Protocol)</div>
    <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
      <button style={{ background: activeTab === 'setup' ? '#ff3366' : '#222', flex: 1 }} onClick={() => setActiveTab('setup')}>Journalist Setup</button>
      <button style={{ background: activeTab === 'watcher' ? '#00b09b' : '#222', flex: 1 }} onClick={() => setActiveTab('watcher')}>Public Watcher Dashboard</button>
    </div>

    {activeTab === 'setup' && (!account ? <div style={{ textAlign: 'center', marginTop: '3rem' }}><button onClick={connectWallet} style={{ width: 'auto' }}>Connect MetaMask Wallet</button></div> : <div>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><div style={{ fontSize: '0.8rem', color: '#8a8a9d', marginBottom: '4px' }}>Connected Wallet</div><div style={{ fontFamily: 'monospace' }}>{account.substring(0, 6)}...{account.substring(account.length - 4)}</div></div>
        <div className="status">Status: {status}</div>
      </div>
      <div className="card">
        <h2>Secure New Evidence</h2>
        <label>The Truth (Text to Encrypt & Publish on Trigger)</label>
        <textarea rows={4} value={evidenceText} onChange={event => setEvidenceText(event.target.value)} placeholder="Enter sensitive information here..." disabled={isProcessing} />
        <div style={{ display: 'flex', gap: '20px' }}>
          <div style={{ flex: 1 }}><label>Heartbeat Window (Blocks)</label><input type="number" value={windowBlocks} onChange={event => setWindowBlocks(event.target.value)} disabled={isProcessing} /></div>
          <div style={{ flex: 1 }}><label>Bounty (ETH)</label><input type="text" value={bountyEth} onChange={event => setBountyEth(event.target.value)} disabled={isProcessing} /></div>
        </div>
        <button onClick={handleRegister} disabled={!CONTRACT_CONFIGURED || isProcessing}>{isProcessing ? 'Processing...' : 'Encrypt & Arm Switch'}</button>
      </div>
      <div className="card">
        <h2>Proof of Life</h2>
        {ownedSwitches.length > 0 && <select value={selectedSwitchId} onChange={event => setSelectedSwitchId(event.target.value)} disabled={isProcessing}>
          {ownedSwitches.map(sw => <option key={sw.id} value={sw.id}>{sw.id.slice(0, 12)}... — {sw.triggered ? 'Released' : 'Armed'}</option>)}
        </select>}
        <button className="btn-success" onClick={handleHeartbeat} disabled={!selectedSwitchId || isProcessing}>Send Heartbeat (I am safe)</button>
      </div>
    </div>)}

    {activeTab === 'watcher' && <div>
      <h2>Watcher Dashboard</h2>
      <button onClick={connectWallet} style={{ width: 'auto', marginBottom: '20px', background: '#333' }}>{account ? `Connected as Bot: ${account.substring(0, 6)}...` : 'Connect Wallet (To act as MEV Bot)'}</button>
      {!CONTRACT_CONFIGURED ? <div className="card">Set <code>VITE_CONTRACT_ADDRESS</code> to a deployed contract address.</div> : switches.length === 0 ? <div className="card">No switches active on this network.</div> : switches.map(sw => <div key={sw.id} className="card" style={{ borderLeft: sw.triggered ? '4px solid #ff5252' : '4px solid #00e676' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}><div><strong>Owner:</strong> <span style={{ fontFamily: 'monospace' }}>{sw.owner}</span><br /><strong>Switch:</strong> <span style={{ fontFamily: 'monospace' }}>{sw.id}</span></div><div style={{ color: sw.triggered ? '#ff5252' : '#00e676' }}>{sw.triggered ? 'RELEASED' : 'ARMED'}</div></div>
        <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#8a8a9d' }}>Bounty Pool: {sw.bounty} ETH{sw.bountyClaimed ? ' (Claimed)' : ''}</div>
        {account && !sw.triggered && <button className="btn-danger" style={{ marginTop: '15px' }} onClick={() => handleBotAction('trigger_release', sw.id)} disabled={isProcessing}>triggerRelease()</button>}
        {account && sw.triggered && !sw.bountyClaimed && <button className="btn-success" style={{ marginTop: '15px' }} onClick={() => handleBotAction('claim_bounty', sw.id)} disabled={isProcessing}>claimBounty(lit_proof)</button>}
      </div>)}
      {watcherHasMore && <button onClick={() => fetchSwitches(watcherOffset, true)} disabled={isProcessing}>Load more switches</button>}
    </div>}
  </div>;
}

export default App
