import { useState } from 'react';
import { getProvider, getContract, heartbeat } from '../contracts/VaultBomb';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';

type HeartbeatButtonProps = {
  switchId: string;
  onHeartbeat: (switchId: string) => void;
};

export function HeartbeatButton({ switchId, onHeartbeat }: HeartbeatButtonProps) {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  const [loading, setLoading] = useState(false);
  const [rateLimitPending, setRateLimitPending] = useState(false);
  const [error, setError] = useState('');

  const handleHeartbeat = async () => {
    setLoading(true);
    setError('');
    try {
      if (isRateLimited) setRateLimitPending(true);
      await acquireRateLimit();
      setRateLimitPending(false);

      const provider = getProvider();
      const contract = await getContract(provider);
      const info = await contract.getSwitchInfo(switchId);
      const nextNonce = Number(info.last_nonce) + 1;

      await heartbeat(switchId, nextNonce);
      onHeartbeat(switchId);
    } catch (err: any) {
      console.error(err);
      reportError(err);
      setError(err?.reason ?? err?.message ?? 'Heartbeat failed.');
    } finally {
      setLoading(false);
      setRateLimitPending(false);
    }
  };

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={handleHeartbeat}
        disabled={loading || rateLimitPending}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-medium text-xs tracking-widest uppercase border border-white/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {rateLimitPending ? 'Rate Limit...' : loading ? 'Sending...' : 'Send Heartbeat'}
      </button>
      {error && <div className="text-red-500 text-xs mt-2">{error}</div>}
    </div>
  );
}
