import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

// Dummy contract address and ABI for demo
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with deployed
const ABI = [
  "function register_switch(uint256 heartbeat_window_blocks, string arweave_tx_id, bytes32 evidence_hash, address duress_wallet) external payable",
  "function heartbeat() external",
  "function trigger_release(address journalist) external",
  "function claim_bounty(address journalist, bytes lit_proof) external",
  "function get_registered_journalists_count() external view returns (uint256)",
  "function get_registered_journalist(uint256 index) external view returns (address)",
  "function get_switch_info(address journalist) external view returns (bool is_active, bool is_triggered, uint256 heartbeat_window_blocks, uint256 last_heartbeat_block, uint256 bounty_amount, bool bounty_claimed)"
];

function App() {
  const [activeTab, setActiveTab] = useState<'setup' | 'watcher'>('setup');
  
  // Setup State
  const [account, setAccount] = useState<string>('');
  const [status, setStatus] = useState<string>('Unregistered');
  const [windowBlocks, setWindowBlocks] = useState<string>('50');
  const [evidenceText, setEvidenceText] = useState<string>('');
  const [bountyEth, setBountyEth] = useState<string>('0.01');
  const [isProcessing, setIsProcessing] = useState(false);

  // Watcher State
  const [switches, setSwitches] = useState<any[]>([]);

  const connectWallet = async () => {
    if ((window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
      } catch (err) {
        console.error("User rejected request", err);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const handleRegister = async () => {
    if (!account) return alert("Connect wallet first!");
    if (!evidenceText) return alert("Please enter some evidence!");
    if (!bountyEth) return alert("Please enter a bounty amount!");
    
    setIsProcessing(true);
    setStatus("Encrypting Evidence...");
    
    try {
      const key = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      const rawKeyBuffer = await window.crypto.subtle.exportKey("raw", key);
      const aesKeyBase64 = arrayBufferToBase64(rawKeyBuffer);

      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedEvidence = encoder.encode(evidenceText);
      
      const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encodedEvidence);
      const combinedBuffer = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
      combinedBuffer.set(iv, 0);
      combinedBuffer.set(new Uint8Array(ciphertextBuffer), iv.length);
      const ciphertextBase64 = arrayBufferToBase64(combinedBuffer.buffer);

      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encodedEvidence);
      const evidenceHashHex = "0x" + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      setStatus("Sending to Lit Protocol Simulator...");
      
      const litRes = await fetch("http://localhost:3000/store-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistAddress: account,
          aesKey: aesKeyBase64,
          evidenceHash: evidenceHashHex,
          ciphertext: ciphertextBase64
        })
      });
      
      const litData = await litRes.json();
      if (!litData.success) throw new Error("Lit nodes rejected the payload");

      setStatus("Registering Smart Contract...");
      
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      
      const value = ethers.parseEther(bountyEth);
      const tx = await contract.register_switch(
        windowBlocks,
        "arweave_mock_tx_123",
        evidenceHashHex,
        ethers.ZeroAddress,
        { value }
      );
      
      setStatus("Waiting for confirmation...");
      await tx.wait();
      
      setStatus("Armed");
      setIsProcessing(false);
      alert("Switch successfully armed! Bounty deposited.");
      
    } catch (e: any) {
      console.error(e);
      setStatus("Unregistered");
      setIsProcessing(false);
      alert("Failed: " + e.message);
    }
  };

  const handleHeartbeat = async () => {
    if (!account) return alert("Connect wallet first!");
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      setIsProcessing(true);
      const tx = await contract.heartbeat();
      await tx.wait();
      alert("Heartbeat successfully sent! Timer reset.");
      setIsProcessing(false);
    } catch (e: any) {
      console.error(e);
      alert("Heartbeat failed: " + e.message);
      setIsProcessing(false);
    }
  };

  // Watcher Functions
  const fetchSwitches = async () => {
    try {
      const provider = new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc"); // Or window.ethereum
      // If no contract deployed yet, mock data for the UI
      if (CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
        setSwitches([
          { address: "0x1234...abcd", active: true, triggered: false, bounty: "0.01 ETH" },
          { address: "0xdead...beef", active: true, triggered: true, bounty: "0.05 ETH (Claimed)" }
        ]);
        return;
      }
      
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const count = await contract.get_registered_journalists_count();
      
      let loadedSwitches = [];
      for (let i = 0; i < count; i++) {
        const addr = await contract.get_registered_journalist(i);
        const info = await contract.get_switch_info(addr);
        loadedSwitches.push({
          address: addr,
          active: info.is_active,
          triggered: info.is_triggered,
          bounty: ethers.formatEther(info.bounty_amount) + " ETH" + (info.bounty_claimed ? " (Claimed)" : "")
        });
      }
      setSwitches(loadedSwitches);
    } catch (e) {
      console.error("Failed to fetch switches", e);
    }
  };

  useEffect(() => {
    if (activeTab === 'watcher') {
      fetchSwitches();
    }
  }, [activeTab]);

  const handleBotTrigger = async (journalistAddr: string) => {
    if (!account) return alert("Connect wallet to act as a bot!");
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      setIsProcessing(true);
      const tx = await contract.trigger_release(journalistAddr);
      await tx.wait();
      setIsProcessing(false);
      alert("Trigger fired! The Lit Action is now decrypting and publishing the evidence.");
      fetchSwitches();
    } catch (e: any) {
      console.error(e);
      setIsProcessing(false);
      alert("Trigger failed: " + e.message);
    }
  };

  const handleBotClaim = async (journalistAddr: string) => {
    if (!account) return alert("Connect wallet first!");
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      setIsProcessing(true);
      // In a real scenario, this proof comes from the Lit Action response.
      const mockProof = "0xdeadbeef"; 
      const tx = await contract.claim_bounty(journalistAddr, mockProof);
      await tx.wait();
      setIsProcessing(false);
      alert("Bounty claimed successfully!");
      fetchSwitches();
    } catch (e: any) {
      console.error(e);
      setIsProcessing(false);
      alert("Claim failed: " + e.message);
    }
  };

  return (
    <div className="container">
      <h1>Vault Bomb</h1>
      <div className="subtitle">Unstoppable Dead-Man's Switch (Powered by Lit Protocol)</div>
      
      <div style={{display: 'flex', gap: '10px', marginBottom: '2rem'}}>
        <button 
          style={{background: activeTab === 'setup' ? '#ff3366' : '#222', flex: 1}}
          onClick={() => setActiveTab('setup')}>Journalist Setup</button>
        <button 
          style={{background: activeTab === 'watcher' ? '#00b09b' : '#222', flex: 1}}
          onClick={() => setActiveTab('watcher')}>Public Watcher Dashboard</button>
      </div>

      {activeTab === 'setup' && (
        <>
          {!account ? (
            <div style={{textAlign: "center", marginTop: "3rem"}}>
              <button onClick={connectWallet} style={{width: 'auto'}}>Connect MetaMask Wallet</button>
            </div>
          ) : (
            <div>
              <div className="card" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div>
                  <div style={{fontSize: '0.8rem', color: '#8a8a9d', marginBottom: '4px'}}>Connected Wallet</div>
                  <div style={{fontFamily: 'monospace', fontSize: '1rem'}}>{account.substring(0,6)}...{account.substring(account.length-4)}</div>
                </div>
                <div className={`status ${status.toLowerCase()}`}>
                  Status: {status}
                </div>
              </div>

              <div className="card">
                <h2>1. Secure Your Evidence</h2>
                
                <label>The Truth (Text to Encrypt & Publish on Trigger)</label>
                <textarea 
                  rows={4}
                  value={evidenceText}
                  onChange={(e) => setEvidenceText(e.target.value)}
                  placeholder="Enter the sensitive information here..."
                  disabled={status !== 'Unregistered' || isProcessing}
                />

                <div style={{display: 'flex', gap: '20px'}}>
                  <div style={{flex: 1}}>
                    <label>Heartbeat Window (Blocks)</label>
                    <input 
                      type="number" 
                      value={windowBlocks} 
                      onChange={e => setWindowBlocks(e.target.value)}
                      disabled={status !== 'Unregistered' || isProcessing} 
                    />
                  </div>
                  <div style={{flex: 1}}>
                    <label>Bounty (ETH)</label>
                    <input 
                      type="text" 
                      value={bountyEth} 
                      onChange={e => setBountyEth(e.target.value)}
                      disabled={status !== 'Unregistered' || isProcessing} 
                    />
                  </div>
                </div>
                
                {status === 'Unregistered' && (
                  <div style={{marginTop: '1rem'}}>
                    <button onClick={handleRegister} disabled={isProcessing}>
                      {isProcessing ? (<span><span className="loader"></span>Processing...</span>) : "Encrypt & Arm Switch"}
                    </button>
                    <div className="help-text">
                      Local encryption -> Lit Protocol Access Control setup -> Smart Contract Registration + Bounty Deposit.
                    </div>
                  </div>
                )}
              </div>

              <div className="card">
                <h2>2. Proof of Life</h2>
                <button className="btn-success" onClick={handleHeartbeat} disabled={status !== 'Armed' || isProcessing}>
                  Send Heartbeat (I am safe)
                </button>
                <div className="help-text">
                  Reset the countdown timer. If you fail to do this, anyone can claim your bounty and trigger the release.
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {activeTab === 'watcher' && (
        <div>
          <h2>Watcher Dashboard</h2>
          <p style={{color: '#8a8a9d'}}>Publicly monitoring active dead-man's switches.</p>
          
          <button onClick={connectWallet} style={{width: 'auto', marginBottom: '20px', background: '#333'}}>
            {account ? `Connected as Bot: ${account.substring(0,6)}...` : "Connect Wallet (To act as MEV Bot)"}
          </button>

          {switches.length === 0 ? (
            <div className="card">No switches active on this network.</div>
          ) : (
            switches.map((sw, idx) => (
              <div key={idx} className="card" style={{borderLeft: sw.triggered ? '4px solid #ff5252' : '4px solid #00e676'}}>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <div>
                    <strong>Journalist:</strong> <span style={{fontFamily: 'monospace'}}>{sw.address}</span>
                  </div>
                  <div style={{color: sw.triggered ? '#ff5252' : '#00e676'}}>
                    {sw.triggered ? 'RELEASED' : 'ARMED'}
                  </div>
                </div>
                <div style={{marginTop: '10px', fontSize: '0.9rem', color: '#8a8a9d'}}>
                  Bounty Pool: {sw.bounty}
                </div>
                
                {account && !sw.triggered && (
                  <button className="btn-danger" style={{marginTop: '15px'}} onClick={() => handleBotTrigger(sw.address)} disabled={isProcessing}>
                    triggerRelease()
                  </button>
                )}
                
                {account && sw.triggered && !sw.bounty.includes("Claimed") && (
                  <button className="btn-success" style={{marginTop: '15px'}} onClick={() => handleBotClaim(sw.address)} disabled={isProcessing}>
                    claimBounty(lit_proof)
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default App
