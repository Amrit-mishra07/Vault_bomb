import { useState } from 'react';
import { ethers } from 'ethers';
import { getProvider, getContract, getRobustGasOverrides } from '../contracts/VaultBomb';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';
import { decodeRevertReason } from '../contracts/decodeRevertReason';
import { simplifyError } from '../utils/errors';

type TriggerButtonProps = {
  switchId: string;
  onTriggered?: (switchId: string, arweaveTxId?: string) => void;
};

export function TriggerButton({ switchId, onTriggered }: TriggerButtonProps) {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  const [loading, setLoading] = useState(false);
  const [rateLimitPending, setRateLimitPending] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      if (provider instanceof ethers.BrowserProvider) {
        await import('../contracts/VaultBomb').then(m => m.ensureCorrectNetwork(provider));
      }
      const signer = await provider.getSigner();
      const contract = await getContract(signer);
      
      if (isRateLimited) setRateLimitPending(true);
      await acquireRateLimit();
      setRateLimitPending(false);

      try {
        await contract.triggerRelease.staticCall(switchId);
      } catch (preflight: any) {
        const reason = decodeRevertReason(preflight);
        if (reason === 'Window not expired') {
          alert("The heartbeat window hasn't fully expired yet.");
        } else if (reason === 'Already triggered') {
          alert("This switch has already been triggered.");
        } else if (reason) {
          alert(`Cannot trigger: ${reason}`);
        } else {
          alert("Cannot trigger this switch right now.");
        }
        return;
      }

      const overrides = await getRobustGasOverrides(provider);
      const estimatedGas = await contract.triggerRelease.estimateGas(switchId);
      const tx = await contract.triggerRelease(switchId, {
        ...overrides,
        gasLimit: (estimatedGas * 120n) / 100n
      });
      const receipt = await tx.wait();

      let arweaveTxId: string | undefined;
      if (receipt && receipt.logs) {
        const iface = contract.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed && parsed.name === 'Triggered') {
              arweaveTxId = parsed.args[3];
              break;
            }
          } catch { /* not our event */ }
        }
      }

      onTriggered?.(switchId, arweaveTxId);
      
      try {
        const API_URL = import.meta.env.VITE_LIT_SIMULATOR_URL || "http://localhost:3000";
        await fetch(`${API_URL}/simulate-trigger`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            switchId,
            journalist: "Unknown",
            triggerer: await signer.getAddress(),
            arweaveTxId: arweaveTxId || ""
          })
        });
      } catch (e) {
        console.error("Failed to notify Lit Simulator:", e);
      }
    } catch (e: any) {
      console.error(e);
      reportError(e);
      const reason = decodeRevertReason(e);
      if (reason) alert(`Trigger failed: ${reason}`);
      else alert(`Failed to trigger: ${simplifyError(e)}`);
    } finally {
      setLoading(false);
      setRateLimitPending(false);
    }
  };

  return (
    <button 
      onClick={handleTrigger} 
      disabled={loading || rateLimitPending} 
      className="px-4 py-2 bg-accent hover:bg-accent-hover text-white font-medium text-xs tracking-widest uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {rateLimitPending ? 'Rate Limit...' : loading ? 'Triggering...' : 'Trigger Release'}
    </button>
  );
}
