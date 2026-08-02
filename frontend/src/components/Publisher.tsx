import { useState } from 'react';
import { generateAESKey, encryptText, exportKey } from '../services/crypto';
import { uploadToIrys } from '../services/irys';
import { buildACC, encryptKey } from '../services/lit';
import { ethers } from 'ethers';
import { registerSwitch, getProvider } from '../contracts/VaultBomb';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export function Publisher() {
  const [secret, setSecret] = useState('');
  const [bounty, setBounty] = useState('0.000001');
  const [heartbeatBlocks, setHeartbeatBlocks] = useState('7200');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);

  const handleArmBomb = async () => {
    setStatus('Generating encryption keys...');
    setError('');
    
    let currentStep = 'Initialization';
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask!");
      
      currentStep = 'Connecting MetaMask';
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      currentStep = 'Local Crypto';
      const key = await generateAESKey();
      const { ciphertext: secretCiphertext, iv } = await encryptText(secret, key);
      
      currentStep = 'Ethers v6 Provider setup';
      const provider = getProvider();
      const signer = await provider.getSigner();
      
      const switchId = ethers.id(Math.random().toString());
      const acc = buildACC(CONTRACT_ADDRESS, switchId);
      
      // Calculate evidence hash for the simulator
      const encoder = new TextEncoder();
      const data = encoder.encode(secret);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const evidenceHash = "0x" + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Format ciphertext for the simulator (iv + ciphertext)
      const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
      const ciphertextBuffer = Uint8Array.from(atob(secretCiphertext), c => c.charCodeAt(0));
      const combined = new Uint8Array(12 + ciphertextBuffer.byteLength);
      combined.set(ivBuffer, 0);
      combined.set(ciphertextBuffer, 12);
      const fullCiphertext = btoa(String.fromCharCode(...combined));
      
      currentStep = 'Lit Protocol Encryption';
      setStatus('Securing key with Lit Protocol...');
      const exportedKeyStr = await exportKey(key);
      const litData = await encryptKey(
        exportedKeyStr, 
        acc, 
        switchId, 
        await signer.getAddress(), 
        evidenceHash, 
        fullCiphertext
      );

      currentStep = 'Irys Upload';
      setStatus('Uploading bundle to Irys...');
      const payload = JSON.stringify({
        secretCiphertext,
        iv,
        litCiphertext: litData.ciphertext,
        litHash: litData.dataToEncryptHash,
      });
      const irysTxId = await uploadToIrys(payload);

      currentStep = 'Smart Contract TX';
      setStatus('Registering switch on-chain...');
      const bountyValue = bounty;
      
      const hbBlocks = parseInt(heartbeatBlocks);
      if (isNaN(hbBlocks) || hbBlocks <= 0) throw new Error("Invalid heartbeat window");
      
      await registerSwitch(
        switchId, 
        hbBlocks, 
        20, 
        irysTxId, 
        evidenceHash,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        bountyValue
      );
      
      setStatus('Vault Bomb Armed successfully!');
      setIsRegistered(true);
      setSecret('');
    } catch (err: any) {
      console.error(err);
      setError(`[Failed at: ${currentStep}] ${err.stack || err.message}`);
      setStatus('');
    }
  };

  return (
    <div className="panel">
      <h2>Arm Vault Bomb (Publisher)</h2>
      <div className="input-group">
        <label>Secret Message</label>
        <textarea 
          className="input-field"
          value={secret} 
          onChange={e => setSecret(e.target.value)} 
          placeholder="This message will only be revealed if you fail to check in..."
        />
      </div>
      
      <div className="input-group">
        <label>Heartbeat Window (Blocks) — ~12s per L1 block on Arbitrum</label>
        <input 
          className="input-field"
          type="number"
          value={heartbeatBlocks}
          onChange={e => setHeartbeatBlocks(e.target.value)}
          placeholder="7200"
        />
      </div>

      <div className="input-group">
        <label>Bounty Amount (ETH) — Given to the triggerer</label>
        <input 
          className="input-field"
          type="number"
          step="0.000001"
          value={bounty} 
          onChange={e => setBounty(e.target.value)} 
          placeholder="0.000001"
        />
      </div>
      
      {isRegistered ? (
        <div style={{ color: 'var(--accent)', marginTop: '1rem', fontWeight: 'bold', textAlign: 'center' }}>
          Vault Bomb is Armed! The secret will be released if you fail to check in.
        </div>
      ) : (
        <button 
          onClick={handleArmBomb} 
          className="primary-btn"
          style={{ width: '100%', marginTop: '1rem' }}
          disabled={!!status}
        >
          {status ? status : 'Arm Vault Bomb'}
        </button>
      )}

      {error && <div style={{ color: 'var(--accent)', marginTop: '1rem', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>Error: {error}</div>}
    </div>
  );
}
