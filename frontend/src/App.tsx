import { useState } from 'react'
import { ethers } from 'ethers'

// Dummy contract address and ABI for demo
const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // Replace with deployed
const ABI = [
  "function register_switch(uint256 heartbeat_window_blocks, string arweave_tx_id, address tee_endpoint, bytes32 evidence_hash, address duress_wallet, bytes tee_signature) external",
  "function heartbeat() external",
  "function is_triggered(address journalist) external view returns (bool)",
  "function perform_upkeep(bytes perform_data) external"
];

function App() {
  const [account, setAccount] = useState<string>('');
  const [status, setStatus] = useState<string>('Unregistered');
  const [windowBlocks, setWindowBlocks] = useState<string>('50');
  const [evidenceText, setEvidenceText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

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

  // Helper to convert ArrayBuffer to Base64
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
    
    setIsProcessing(true);
    setStatus("Encrypting Evidence...");
    
    try {
      // 1. Generate AES-GCM Key locally
      const key = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
      
      // Export key to raw to send to TEE
      const rawKeyBuffer = await window.crypto.subtle.exportKey("raw", key);
      const aesKeyBase64 = arrayBufferToBase64(rawKeyBuffer);

      // 2. Encrypt the Evidence
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedEvidence = encoder.encode(evidenceText);
      
      const ciphertextBuffer = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encodedEvidence
      );
      
      // Combine IV + Ciphertext for easy transport
      const combinedBuffer = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
      combinedBuffer.set(iv, 0);
      combinedBuffer.set(new Uint8Array(ciphertextBuffer), iv.length);
      const ciphertextBase64 = arrayBufferToBase64(combinedBuffer.buffer);

      // 3. Hash the Plaintext Evidence (SHA-256)
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", encodedEvidence);
      const evidenceHashHex = "0x" + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      setStatus("Securing key in TEE Enclave...");
      
      // 4. Send Key & Evidence to TEE Simulator
      const teeRes = await fetch("http://localhost:3000/store-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          journalistAddress: account,
          aesKey: aesKeyBase64,
          evidenceHash: evidenceHashHex,
          ciphertext: ciphertextBase64
        })
      });
      
      const teeData = await teeRes.json();
      if (!teeData.success) throw new Error("TEE rejected the key handshake");

      setStatus("Registering Smart Contract...");
      
      // 5. Register on-chain via Arbitrum Stylus
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
      
      const tx = await contract.register_switch(
        windowBlocks,
        "arweave_mock_tx_123",
        "0x0000000000000000000000000000000000000001", // Dummy TEE endpoint
        evidenceHashHex,
        ethers.ZeroAddress, // No duress wallet for UI demo
        teeData.teeSignature
      );
      
      setStatus("Waiting for confirmation...");
      await tx.wait();
      
      setStatus("Active");
      setIsProcessing(false);
      alert("Switch successfully registered and key secured in enclave!");
      
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

  const handleTriggerDemo = async () => {
    if (!account) return;
    const provider = new ethers.BrowserProvider((window as any).ethereum);
    const signer = await provider.getSigner();
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    try {
      setIsProcessing(true);
      const checkData = ethers.zeroPadValue(account, 32);
      const tx = await contract.perform_upkeep(checkData);
      await tx.wait();
      setStatus("Triggered");
      setIsProcessing(false);
      alert("Trigger fired! Check TEE server logs for the unstoppably released evidence.");
    } catch (e: any) {
      console.error(e);
      setIsProcessing(false);
      alert("Not eligible for trigger yet (window hasn't expired or already triggered).");
    }
  };

  return (
    <div className="container">
      <h1>Vault Bomb</h1>
      <div className="subtitle">Unstoppable Dead-Man's Switch</div>
      
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
              {status}
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

            <label>Heartbeat Window (Arbitrum Blocks)</label>
            <input 
              type="number" 
              value={windowBlocks} 
              onChange={e => setWindowBlocks(e.target.value)}
              disabled={status !== 'Unregistered' || isProcessing} 
            />
            
            {status === 'Unregistered' && (
              <div style={{marginTop: '1rem'}}>
                <button onClick={handleRegister} disabled={isProcessing}>
                  {isProcessing ? (<span><span className="loader"></span>Processing...</span>) : "Encrypt & Register Switch"}
                </button>
                <div className="help-text">
                  Your browser will locally generate an AES-GCM key, encrypt the payload, send the payload to Arweave, and lock the key inside the secure TEE enclave before registering the contract.
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <h2>2. Proof of Life</h2>
            <button className="btn-success" onClick={handleHeartbeat} disabled={status !== 'Active' || isProcessing}>
              Send Heartbeat (I am safe)
            </button>
            <div className="help-text">
              Check in periodically to prove you are safe. This resets the countdown timer on the blockchain.
            </div>
          </div>

          <div className="card" style={{border: '1px solid rgba(229, 45, 39, 0.3)'}}>
            <h2>3. Force Trigger (Demo Only)</h2>
            <button className="btn-danger" onClick={handleTriggerDemo} disabled={status !== 'Active' || isProcessing}>
              Simulate Chainlink Upkeep (performUpkeep)
            </button>
            <div className="help-text">
              In reality, Chainlink Automation nodes call this when your window expires. For the demo, this manually fires the trigger so you can see the TEE publish the decrypted evidence.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
