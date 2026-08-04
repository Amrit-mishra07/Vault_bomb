import { useState } from 'react';
import { claimBounty } from '../contracts/VaultBomb';

type ClaimBountyButtonProps = {
  switchId: string;
  /** Called after the claim tx is confirmed so the parent can mark the bounty as claimed. */
  onClaimed: (switchId: string) => void;
};

/**
 * Allows a bounty hunter to claim their ETH reward after triggering a switch release.
 *
 * MOCK NOTE: In a production Lit Protocol integration, the `lit_proof` would be a
 * cryptographic ECDSA signature produced by the Lit Action during the decryption
 * and publishing step. It would be fetched automatically from the Lit network via
 * the Lit SDK.
 *
 * In the CURRENT MOCK SETUP (lit-simulator), the simulator logs a hex proof string
 * to its backend terminal after a successful detonation. The user must manually
 * copy-paste it into the prompt below.
 *
 * TODO (Production): Replace the window.prompt with a Lit SDK call to retrieve the
 * proof automatically before any mainnet or production deployment.
 */
export function ClaimBountyButton({ switchId, onClaimed }: ClaimBountyButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClaim = async () => {
    // MOCK: Prompt user to paste the proof from the lit-simulator backend terminal.
    // In production, replace this with an automated Lit SDK proof retrieval.
    const litProof = window.prompt(
      '[MOCK] Paste the Lit Proof hex string from the lit-simulator backend terminal.\n\n' +
      '(In production this would be fetched automatically from the Lit Protocol network.)'
    );

    if (!litProof) return; // User cancelled or left empty

    if (!litProof.startsWith('0x')) {
      alert('Invalid proof: must start with 0x');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await claimBounty(switchId, litProof);
      onClaimed(switchId);
    } catch (err: any) {
      console.error(err);
      setError(err?.reason ?? err?.message ?? 'Claim bounty transaction failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        id={`claim-bounty-btn-${switchId}`}
        onClick={handleClaim}
        disabled={loading}
        style={{
          background: '#b388ff',
          color: '#000',
          padding: '5px 12px',
          fontSize: '0.8rem',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.7 : 1,
        }}
        aria-busy={loading}
      >
        {loading ? 'Claiming…' : '💰 Claim Bounty'}
      </button>
      {error && (
        <div style={{ color: '#ff5252', fontSize: '0.75rem', marginTop: '4px' }}>
          {error}
        </div>
      )}
    </div>
  );
}
