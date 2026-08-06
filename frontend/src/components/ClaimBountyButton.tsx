import { useState } from 'react';
import { claimBounty } from '../contracts/VaultBomb';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';
import { decodeRevertReason } from '../contracts/decodeRevertReason';
import { simplifyError } from '../utils/errors';

type ClaimBountyButtonProps = {
  switchId: string;
  onClaimed: (switchId: string) => void;
};

export function ClaimBountyButton({ switchId, onClaimed }: ClaimBountyButtonProps) {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  const [loading, setLoading] = useState(false);
  const [rateLimitPending, setRateLimitPending] = useState(false);
  const [error, setError] = useState('');

  const handleClaim = async () => {
    setLoading(true);
    setError('');
    
    let litProof = "";
    try {
      // Fetch proof from the lit-simulator API instead of manual window.prompt
      const API_URL = import.meta.env.VITE_LIT_SIMULATOR_URL || "http://localhost:3000";
      const res = await fetch(`${API_URL}/get-proof/${switchId}`);
      if (!res.ok) throw new Error("Failed to fetch proof from custody node");
      const data = await res.json();
      litProof = data.proof;
      
      if (!litProof || litProof.length !== 132 || !litProof.startsWith('0x')) {
        throw new Error("Received invalid proof format from custody node.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch proof");
      setLoading(false);
      return;
    }

    if (isRateLimited) setRateLimitPending(true);
    await acquireRateLimit();
    setRateLimitPending(false);

    try {
      await claimBounty(switchId, litProof);
      onClaimed(switchId);
    } catch (err: any) {
      console.error(err);
      reportError(err);
      const revertReason = decodeRevertReason(err);
      setError(revertReason || simplifyError(err));
    } finally {
      setLoading(false);
      setRateLimitPending(false);
    }
  };

  return (
    <div className="flex flex-col items-start mt-4">
      <button
        onClick={handleClaim}
        disabled={loading || rateLimitPending}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {rateLimitPending ? 'Rate Limit...' : loading ? 'Claiming...' : 'Claim Bounty'}
      </button>
      {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
    </div>
  );
}
