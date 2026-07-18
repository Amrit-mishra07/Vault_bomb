import { useState, useEffect } from 'react'
import { ethers } from 'ethers'

// Dummy contract address and ABI for demo
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with deployed
const ABI = [
  "function register_switch(uint256 heartbeat_window_blocks, string arweave_tx_id, address tee_endpoint, bytes32 evidence_hash, address duress_wallet, bytes tee_signature) external",
  "function heartbeat() external",
  "function is_triggered(address journalist) external view returns (bool)",
  "function get_switch_info(address journalist) external view returns (bool is_active, bool is_triggered, uint256 heartbeat_window_blocks, uint256 last_heartbeat_block)",
  "function check_upkeep(bytes check_data) external view returns (bool, bytes)",
  "function perform_upkeep(bytes perform_data) external"
];

function App() {
  const [account, setAccount] = useState<string>('');
  const [status, setStatus] = useState<string>('Unregistered');
  const [windowBlocks, setWindowBlocks] = useState<string>('50');
  const [arweaveTxId, setArweaveTxId] = useState<string>('arweave_tx_demo123');

  const connectWallet = async () => {
    if (window.ethereum) {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum as any);
        const accounts = await provider.send("eth_requestAccounts", []);
        setAccount(accounts[0]);
      } catch (err) {
        console.error("User rejected request", err);
      }
    } else {
      alert("Please install MetaMask!");
    }
  };

  const handleRegister = async () => {
    if (!account) return alert("Connect wallet first!");
    
    // Simulate uploading to Arweave and hitting TEE endpoint
    alert("Simulating: Uploading to Arweave...");
    alert("Simulating: Sending AES Key to Mock TEE (port 3000)...");
    
    // In a real app, we would wait for the TEE signature. We mock it here.
    const mockTeeSignature = "0xdeadbeef";
    const dummyEvidenceHash = ethers.id("secret_evidence_hash");
    
    const provider = new ethers.BrowserProvider(window.ethereum as any);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    
    try {
      const tx = await contract.register_switch(
        windowBlocks,
        arweaveTxId,
        "0x0000000000000000000000000000000000000001", // Dummy TEE endpoint
        dummyEvidenceHash,
        ethers.ZeroAddress, // No duress wallet for basic demo
        mockTeeSignature
      );
      setStatus("Registering (tx pending)...");
      await tx.wait();
      setStatus("Active");
      alert("Switch successfully registered!");
    } catch (e: any) {
      console.error(e);
      alert("Transaction failed: " + e.message);
    }
  };

  const handleHeartbeat = async () => {
    if (!account) return alert("Connect wallet first!");
    const provider = new ethers.BrowserProvider(window.ethereum as any);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      const tx = await contract.heartbeat();
      await tx.wait();
      alert("Heartbeat successfully sent!");
    } catch (e: any) {
      console.error(e);
      alert("Heartbeat failed: " + e.message);
    }
  };

  const handleTriggerDemo = async () => {
    // This is for demo purposes to manually call performUpkeep
    if (!account) return;
    const provider = new ethers.BrowserProvider(window.ethereum as any);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      const checkData = ethers.zeroPadValue(account, 32);
      const tx = await contract.perform_upkeep(checkData);
      await tx.wait();
      setStatus("Triggered");
      alert("Demo: perform_upkeep called successfully!");
    } catch (e: any) {
      console.error(e);
      alert("Not eligible for trigger yet (window hasn't expired).");
    }
  };

  return (
    <div className="container">
      <h1>Vault Bomb 💣</h1>
      <p style={{textAlign: "center", color: "#aaa"}}>Unstoppable Dead-Man's Switch</p>
      
      {!account ? (
        <div style={{textAlign: "center", marginTop: "2rem"}}>
          <button onClick={connectWallet}>Connect Wallet</button>
        </div>
      ) : (
        <div>
          <div className="card">
            <h3>Wallet: {account}</h3>
            <div className={`status ${status.toLowerCase()}`}>
              Status: <strong>{status}</strong>
            </div>
          </div>

          <div className="card">
            <h2>1. Setup New Switch</h2>
            <label>Heartbeat Window (Blocks):</label>
            <input 
              type="number" 
              value={windowBlocks} 
              onChange={e => setWindowBlocks(e.target.value)} 
            />
            <label>Simulated Arweave TxID:</label>
            <input 
              type="text" 
              value={arweaveTxId} 
              onChange={e => setArweaveTxId(e.target.value)} 
            />
            <button onClick={handleRegister}>Upload & Register Switch</button>
            <p style={{fontSize: "0.8rem", color: "#888"}}>
              * Registers the contract and locks the key in the simulated TEE enclave.
            </p>
          </div>

          <div className="card">
            <h2>2. Normal Operation</h2>
            <button onClick={handleHeartbeat} style={{backgroundColor: "#2e7d32"}}>Send Heartbeat</button>
            <p style={{fontSize: "0.8rem", color: "#888"}}>
              * Check in to prove you are safe and reset the window timer.
            </p>
          </div>

          <div className="card">
            <h2>3. Demo Trigger (Simulate Chainlink Upkeep)</h2>
            <button onClick={handleTriggerDemo} style={{backgroundColor: "#b71c1c"}}>Call performUpkeep()</button>
            <p style={{fontSize: "0.8rem", color: "#888"}}>
              * Chainlink automatically calls this when the window expires. For the live demo, you can call it manually to watch the release happen.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
