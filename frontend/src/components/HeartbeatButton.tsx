import { useState } from 'react';
import { getProvider, getContract, heartbeat } from '../contracts/VaultBomb';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';

type HeartbeatButtonProps = {
  switchId: string;
  /** Called after the heartbeat tx is confirmed so the parent can refresh state. */
  onHeartbeat: (switchId: string) => void;
};

/**
 * Allows the switch owner to reset the countdown timer by sending a heartbeat
 * transaction on-chain.
 *
 * The nonce is fetched from the contract immediately before submission so that
 * the contract's state is always the source of truth for replay protection,
 * regardless of any stale values held in local component state.
 */
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

      // Fetch the latest nonce directly from the contract to guarantee correctness.
      // Using local state here would risk a stale value causing the tx to revert.
      const provider = getProvider();
      const contract = await getContract(provider);
      const info = await contract.getSwitchInfo(switchId);
      const nextNonce = Number(info.last_nonce) + 1;

      await heartbeat(switchId, nextNonce);
      onHeartbeat(switchId);
    } catch (err: any) {
      console.error(err);
      reportError(err);
      setError(err?.reason ?? err?.message ?? 'Heartbeat transaction failed.');
    } finally {
      setLoading(false);
      setRateLimitPending(false);
    }
  };

  return (
    <div>
      <button
        id={`heartbeat-btn-${switchId}`}
        onClick={handleHeartbeat}
        disabled={loading || rateLimitPending}
        style={{
          background: '#00e676',
          color: '#000',
          padding: '5px 12px',
          fontSize: '0.8rem',
          border: 'none',
          borderRadius: '4px',
          cursor: (loading || rateLimitPending) ? 'not-allowed' : 'pointer',
          opacity: (loading || rateLimitPending) ? 0.7 : 1,
        }}
        aria-busy={loading || rateLimitPending}
      >
        {rateLimitPending ? 'Hit Rate Limit…' : loading ? 'Sending…' : '💓 Send Heartbeat'}
      </button>
      {error && (
        <div style={{ color: '#ff5252', fontSize: '0.75rem', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
