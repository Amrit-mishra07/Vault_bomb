import { useState } from 'react';
import { ethers } from 'ethers';
import { getProvider, getContract } from '../contracts/VaultBomb';

// Decode Stylus raw revert bytes into a readable string
function decodeRevertReason(error: any): string {
  // Stylus contracts return raw bytes (not ABI-encoded Error(string))
  // Check for the data field which contains the hex-encoded ASCII error
  const data = error?.data ?? error?.error?.data ?? error?.info?.error?.data;
  if (typeof data === 'string' && data.startsWith('0x') && data.length > 2) {
    try {
      const bytes = ethers.getBytes(data);
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (decoded && /^[\x20-\x7E]+$/.test(decoded)) return decoded;
    } catch { /* not valid UTF-8 */ }
  }
  return '';
}

type TriggerButtonProps = {
  switchId: string;
  onTriggered?: (switchId: string, arweaveTxId?: string) => void;
};

export function TriggerButton({ switchId, onTriggered }: TriggerButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleTrigger = async () => {
    setLoading(true);
    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const contract = await getContract(signer);
      
      // Pre-flight check: verify the contract will accept this trigger
      try {
        await contract.triggerRelease.staticCall(switchId);
      } catch (preflight: any) {
        const reason = decodeRevertReason(preflight);
        if (reason === 'Window not expired') {
          alert("The heartbeat window hasn't fully expired yet. Please wait a bit longer and try again.");
        } else if (reason === 'Already triggered') {
          alert("This switch has already been triggered.");
        } else if (reason) {
          alert(`Cannot trigger: ${reason}`);
        } else {
          alert("Cannot trigger this switch right now. The window may not have expired yet.");
        }
        return;
      }

      const overrides: any = {
        gasPrice: ethers.parseUnits("0.2", "gwei")
      };
      const tx = await contract.triggerRelease(switchId, overrides);
      const receipt = await tx.wait();

      // Extract the arweaveTxId from the Triggered event in the receipt
      let arweaveTxId: string | undefined;
      if (receipt && receipt.logs) {
        const iface = contract.interface;
        for (const log of receipt.logs) {
          try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (parsed && parsed.name === 'Triggered') {
              arweaveTxId = parsed.args[3]; // arweaveTxId is the 4th arg
              break;
            }
          } catch { /* not our event */ }
        }
      }

      // Notify parent immediately so dashboard updates without waiting for event polling
      onTriggered?.(switchId, arweaveTxId);

      alert("Trigger executed on-chain! Lit Protocol will now allow decryption.");
    } catch (e: any) {
      console.error(e);
      const reason = decodeRevertReason(e);
      if (reason) {
        alert(`Trigger failed: ${reason}`);
      } else {
        alert("Failed to trigger. Please check the console for details.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handleTrigger} disabled={loading} style={{ background: '#ff5252', padding: '5px 10px', fontSize: '0.8rem' }}>
        {loading ? 'Triggering...' : 'Execute Trigger (On-Chain)'}
      </button>
    </div>
  );
}
