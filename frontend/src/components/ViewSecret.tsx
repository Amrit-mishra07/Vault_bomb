import { useState } from 'react';
import { decryptKey, buildACC } from '../services/lit';
import { importKey, decryptText } from '../services/crypto';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export function ViewSecret({ switchId, irysTxId }: { switchId: string, irysTxId: string }) {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  const [loading, setLoading] = useState(false);
  const [rateLimitPending, setRateLimitPending] = useState(false);
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');

  const handleDecrypt = async () => {
    if (!irysTxId) {
      setError("No Irys TX ID available");
      return;
    }
    
    if (isRateLimited) setRateLimitPending(true);
    await acquireRateLimit();
    setRateLimitPending(false);

    setLoading(true);
    setError('');
    
    try {
      // 1. Fetch payload from Irys gateway (devnet)
      const res = await fetch(`https://devnet.irys.xyz/${irysTxId}`);
      if (!res.ok) throw new Error("Failed to fetch payload from Irys");
      const { secretCiphertext, iv, litCiphertext, litHash } = await res.json();

      if (!secretCiphertext || !litCiphertext) throw new Error("Invalid payload format");

      // 2. Decrypt AES key with Lit Protocol
      const acc = buildACC(CONTRACT_ADDRESS, switchId);
      const exportedKeyStr = await decryptKey(litCiphertext, litHash, acc, switchId);

      // 3. Local AES Decryption
      const key = await importKey(exportedKeyStr);
      const plaintext = await decryptText(secretCiphertext, iv, key);
      
      setSecret(plaintext);
    } catch (e: any) {
      console.error(e);
      reportError(e);
      setError(e.message);
    } finally {
      setLoading(false);
      setRateLimitPending(false);
    }
  };

  if (secret) {
    return (
      <div style={{ marginTop: '10px', padding: '10px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '4px' }}>
        <strong style={{ color: '#00e676' }}>Revealed Secret:</strong>
        <pre style={{ whiteSpace: 'pre-wrap', margin: '5px 0 0 0', fontFamily: 'monospace' }}>{secret}</pre>
      </div>
    );
  }

  return (
    <div style={{ marginTop: '10px' }}>
      <button onClick={handleDecrypt} disabled={loading || rateLimitPending} style={{ background: '#00e676', color: '#000', padding: '5px 10px', fontSize: '0.8rem' }}>
        {rateLimitPending ? 'Hit Rate Limit…' : loading ? 'Fetching from Lit...' : 'Read Secret'}
      </button>
      {error && <div style={{ color: '#ff5252', fontSize: '0.8rem', marginTop: '5px' }}>{error}</div>}
    </div>
  );
}
