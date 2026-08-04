import { useState } from 'react';
import { generateAESKey, encryptText, exportKey } from '../services/crypto';
import { uploadToIrys } from '../services/irys';
import { buildACC, encryptKey } from '../services/lit';
import { ethers } from 'ethers';
import { registerSwitch, getProvider } from '../contracts/VaultBomb';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

/**
 * Converts any thrown error into a concise, plain-English sentence that
 * describes *what actually went wrong* rather than a generic step description.
 *
 * Checks error shapes in priority order:
 * 1. MetaMask / EIP-1193 error codes
 * 2. ethers v6 error codes
 * 3. HTTP fetch errors from the Lit Simulator or Irys
 * 4. DOMException names (Web Crypto API)
 * 5. Known plain-message patterns
 * 6. Fallback to the raw message
 */
function simplifyError(err: any): string {
  const code: number | string | undefined = err?.code ?? err?.error?.code;
  const msg: string = (err?.message ?? String(err)).toLowerCase();

  // ── MetaMask / EIP-1193 numeric codes ──────────────────────────────────────
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return 'You rejected the request in MetaMask. Re-open MetaMask and approve when prompted.';
  }
  if (code === -32002) {
    return 'MetaMask already has a pending connection request. Open MetaMask and approve or reject it, then try again.';
  }
  if (code === -32603) {
    return 'MetaMask encountered an internal error. Try unlocking your wallet or restarting MetaMask.';
  }
  if (code === 4902) {
    return 'The required network is not added to MetaMask. Add Arbitrum Sepolia and switch to it.';
  }
  if (code === 4100) {
    return 'MetaMask is locked or the account is not authorised. Unlock MetaMask and try again.';
  }

  // ── ethers v6 error codes ──────────────────────────────────────────────────
  if (code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds')) {
    return 'Your wallet does not have enough ETH to cover gas fees plus the bounty amount. Top up and retry.';
  }
  if (code === 'CALL_EXCEPTION') {
    const reason: string = err?.reason ?? err?.revert?.name ?? '';
    if (reason) return `Contract reverted: "${reason}". Check the switch parameters and your wallet balance.`;
    return 'The contract call was reverted. The switch may already exist, the bounty may be zero, or the network may be wrong.';
  }
  if (code === 'NETWORK_ERROR' || msg.includes('network')) {
    return 'Cannot reach the Arbitrum Sepolia network. Check your internet connection and try again.';
  }
  if (code === 'TIMEOUT') {
    return 'The network request timed out. The RPC node may be under load — wait a moment and retry.';
  }
  if (code === 'UNPREDICTABLE_GAS_LIMIT' || msg.includes('gas')) {
    return 'Gas estimation failed. This usually means the transaction would revert on-chain. Check your inputs and wallet balance.';
  }
  if (code === 'NONCE_EXPIRED' || msg.includes('nonce')) {
    return 'Transaction nonce mismatch. Reset your MetaMask account activity (Settings → Advanced → Reset Account) and try again.';
  }
  if (code === 'REPLACEMENT_UNDERPRICED' || msg.includes('replacement')) {
    return 'A pending transaction with the same nonce is already in the mempool. Wait for it to confirm or speed it up in MetaMask.';
  }

  // ── Lit Simulator HTTP errors ──────────────────────────────────────────────
  if (msg.includes('failed to store key in lit simulator')) {
    return 'The Lit Simulator backend rejected the key. The simulator service may be down or unreachable — check its status and try again.';
  }
  if (msg.includes('failed to retrieve key')) {
    return 'The Lit Simulator could not return the key. Make sure the switch has been triggered on-chain before trying to read the secret.';
  }
  if (msg.includes('store-key') || msg.includes('get-key')) {
    return 'A request to the Lit Simulator failed. The simulator service may be temporarily unavailable.';
  }

  // ── Irys / Arweave upload errors ───────────────────────────────────────────
  if (msg.includes('irys') || msg.includes('arweave') || msg.includes('upload')) {
    return 'The Irys upload failed. The Irys devnet may be temporarily unavailable — try again in a moment.';
  }
  if (msg.includes('failed to fetch') || err?.name === 'TypeError') {
    return 'A network request failed. Check your internet connection. If the problem persists, the remote service may be down.';
  }

  // ── Web Crypto / DOMException ──────────────────────────────────────────────
  if (err?.name === 'NotSupportedError') {
    return 'Your browser does not support the required cryptographic operation. Try an up-to-date version of Chrome or Firefox.';
  }
  if (err?.name === 'InvalidAccessError' || err?.name === 'DataError') {
    return 'The cryptographic key or data is invalid. This is likely a bug — please report it.';
  }
  if (err?.name === 'OperationError') {
    return 'The browser crypto operation failed. The ciphertext or IV may be malformed.';
  }

  // ── MetaMask install check (thrown explicitly above) ──────────────────────
  if (msg.includes('install metamask') || msg.includes('no ethereum wallet')) {
    return 'MetaMask is not installed. Install the MetaMask browser extension and refresh the page.';
  }

  // ── Invalid user inputs ────────────────────────────────────────────────────
  if (msg.includes('invalid heartbeat window')) {
    return 'The heartbeat window must be a positive integer (number of blocks). Enter a valid value and try again.';
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return err?.message ?? String(err);
}

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
      // Log the complete error object — full stack trace visible in DevTools (F12 → Console).
      console.error(`[Vault Bomb] Arm failed at step "${currentStep}":`, err);

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
          disabled={!!status}
        >
          {status ? status : 'Arm Vault Bomb'}
        </button>
      )}

      {error && (
        <div role="alert" style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.35)', borderRadius: '8px', fontSize: '0.9rem', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text)' }}>
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
