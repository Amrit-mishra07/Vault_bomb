import { useState, useEffect } from 'react';
import { generateAESKey, encryptText, exportKey } from '../services/crypto';
import { uploadToIrys } from '../services/irys';
import { buildACC, encryptKey } from '../services/lit';
import { ethers } from 'ethers';
import { registerSwitch, getProvider } from '../contracts/VaultBomb';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

import { simplifyError } from '../utils/errors';

type SavedSwitch = {
  id: string;
  timestamp: number;
};

function SavedSwitchList({ switches }: { switches: SavedSwitch[] }) {
  if (switches.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <h3>Your Armed Switches</h3>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {switches.map((sw) => (
          <li key={sw.id} style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', wordBreak: 'break-all', color: '#00e676' }}>{sw.id}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(sw.id)}
                style={{ marginLeft: '1rem', background: '#333', border: 'none', color: '#fff', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}
              >
                Copy
              </button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#8a8a9d', marginTop: '0.5rem' }}>
              Created: {new Date(sw.timestamp).toLocaleString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Publisher() {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  const [secret, setSecret] = useState('');
  const [bounty, setBounty] = useState('0.000001');
  const [heartbeatBlocks, setHeartbeatBlocks] = useState('7200');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [rateLimitPending, setRateLimitPending] = useState(false);
  const [savedSwitches, setSavedSwitches] = useState<SavedSwitch[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('vaultBombSwitches');
      if (stored) {
        setSavedSwitches(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load saved switches", e);
    }
  }, []);

  const handleArmBomb = async () => {
    setStatus('Generating encryption keys...');
    setError('');

    let currentStep = 'Initialization';
    try {
      if (!window.ethereum) throw new Error("Please install MetaMask!");
      
      // Acquire a global rate-limit slot before hitting the chain / Lit Simulator.
      // If the budget is exhausted this will block asynchronously for up to 60s.
      if (isRateLimited) setRateLimitPending(true);
      await acquireRateLimit();
      setRateLimitPending(false);

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
      
      const newSwitch: SavedSwitch = { id: switchId, timestamp: Date.now() };
      const updated = [newSwitch, ...savedSwitches];
      setSavedSwitches(updated);
      try {
        localStorage.setItem('vaultBombSwitches', JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save switch to localStorage", e);
      }
    } catch (err: any) {
      // Log the complete error object — full stack trace visible in DevTools (F12 → Console).
      console.error(`[Vault Bomb] Arm failed at step "${currentStep}":`, err);

      reportError(err);
      setRateLimitPending(false);
      setError(simplifyError(err));
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
        <div style={{ color: 'var(--success)', marginTop: '1rem', fontWeight: 'bold', textAlign: 'center', padding: '0.75rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
          ✅ Vault Bomb is Armed! The secret will be released if you fail to check in.
        </div>
      ) : (
        <button
          onClick={handleArmBomb}
          className="primary-btn"
          style={{ width: '100%', marginTop: '1rem' }}
          disabled={!!status || rateLimitPending}
        >
          {rateLimitPending ? 'Hit Rate Limit…' : status ? status : 'Arm Vault Bomb'}
        </button>
      )}

      {error && (
        <div role="alert" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.35)', borderRadius: '8px', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text)' }}>
            {error}
          </p>
        </div>
      )}

      <SavedSwitchList switches={savedSwitches} />
    </div>
  );
}
