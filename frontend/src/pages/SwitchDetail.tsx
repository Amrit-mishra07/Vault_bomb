import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ethers } from 'ethers';
import { motion } from 'framer-motion';
import { getProvider, getContract, CONTRACT_ADDRESS } from '../contracts/VaultBomb';
import { useRpcCall } from '../hooks/useRpcCall';
import { SwitchStatus } from '../components/SwitchCard';
import { TriggerButton } from '../components/TriggerButton';
import { ClaimBountyButton } from '../components/ClaimBountyButton';
import { decryptKey, buildACC } from '../services/lit';
import { importKey, decryptData } from '../services/crypto';

type SwitchDetailInfo = {
  id: string;
  owner: string;
  status: SwitchStatus;
  bounty: string;
  bountyClaimed: boolean;
  irysTxId?: string;
  triggerer: string;
};

export default function SwitchDetail({ wallet }: { wallet: string | null }) {
  const { id } = useParams<{ id: string }>();
  const { rpcCall } = useRpcCall();
  const [sw, setSw] = useState<SwitchDetailInfo | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState('');
  const [decryptedFile, setDecryptedFile] = useState<{ url: string, type: string, name: string, text?: string } | null>(null);

  const fetchSwitch = async () => {
    if (!id) return;
    try {
      const provider = getProvider();
      const contract = await getContract(provider);
      const rawBlock = await rpcCall(() => provider.send("eth_getBlockByNumber", ["latest", false]));
      const l1BlockNow = BigInt(rawBlock.l1BlockNumber);
      
      const info = await rpcCall(() => contract.getSwitchInfo(id));
      
      let status: SwitchStatus = 'ARMED';
      let irysTxId = '';

      if (info[2]) {
        status = 'TRIGGERED';
        const triggeredFilter = contract.filters.Triggered(id);
        const fromBlock = Number(info[5]) || 0;
        const triggeredEvents = await rpcCall(() => contract.queryFilter(triggeredFilter, fromBlock));
        if (triggeredEvents.length > 0) {
          irysTxId = (triggeredEvents[0] as any).args[3];
        }
      } else {
        const windowBlocks = info[3];
        const graceBlocks = info[4];
        const lastHeartbeat = info[5];
        const expiryBlock = lastHeartbeat + windowBlocks;
        const graceExpiryBlock = expiryBlock + graceBlocks;
        
        if (l1BlockNow > graceExpiryBlock) {
          status = 'VULNERABLE';
        } else if (l1BlockNow > expiryBlock) {
          status = 'GRACE_PERIOD';
        }
      }

      setSw({
        id,
        owner: info[0],
        status,
        bounty: ethers.formatEther(info[6]),
        bountyClaimed: info[7],
        irysTxId,
        triggerer: info[9]
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSwitch();
  }, [id]);

  const handleDecrypt = async () => {
    if (!sw?.irysTxId || !id) return;
    setDecrypting(true);
    setDecryptError('');
    
    try {
      const res = await fetch(`https://devnet.irys.xyz/${sw.irysTxId}`);
      if (!res.ok) throw new Error("Failed to fetch payload from permanent storage (Irys). It may take a minute to index.");
      const { secretCiphertext, iv, litCiphertext, litHash, mimeType = "text/plain", fileName = "secret.txt" } = await res.json();

      if (!secretCiphertext || !litCiphertext) throw new Error("Invalid payload format");

      const acc = buildACC(CONTRACT_ADDRESS, id);
      const exportedKeyStr = await decryptKey(litCiphertext, litHash, acc, id);

      const key = await importKey(exportedKeyStr);
      const decryptedBuffer = await decryptData(secretCiphertext, iv, key);
      
      const blob = new Blob([decryptedBuffer.buffer as ArrayBuffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const result: any = { url, type: mimeType, name: fileName };
      
      if (mimeType.startsWith("text/")) {
        result.text = new TextDecoder().decode(decryptedBuffer);
      }
      
      setDecryptedFile(result);
    } catch (e: any) {
      console.error(e);
      setDecryptError(e.message || "Decryption failed");
    } finally {
      setDecrypting(false);
    }
  };

  if (loading) {
    return <div className="py-12 animate-pulse text-gray-500 font-mono text-sm uppercase">Loading Switch Data...</div>;
  }

  if (!sw) {
    return <div className="py-12 text-red-500">Switch not found.</div>;
  }

  const isOwner = wallet && wallet.toLowerCase() === sw.owner.toLowerCase();

  return (
    <div className="py-12 max-w-4xl mx-auto">
      <Link to="/dashboard" className="text-xs font-mono uppercase tracking-widest text-gray-500 hover:text-white transition-colors mb-8 inline-block">
        ← Back to Dashboard
      </Link>
      
      <div className="mb-12 border-b border-white/10 pb-8">
        <h1 className="text-4xl font-bold tracking-tighter mb-4 break-all">
          <span className="text-gray-600 font-mono text-2xl block mb-2">Switch ID</span>
          {sw.id}
        </h1>
        
        <div className="flex flex-wrap gap-8">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Status</div>
            <div className={`px-3 py-1 text-xs font-bold uppercase tracking-widest inline-block border ${
              sw.status === 'TRIGGERED' ? 'bg-red-900/20 border-red-500 text-red-500' :
              sw.status === 'VULNERABLE' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
              sw.status === 'GRACE_PERIOD' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
              'bg-green-500/10 border-green-500/30 text-green-400'
            }`}>
              {sw.status.replace('_', ' ')}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Owner</div>
            <div className="font-mono text-sm text-gray-300">
              {sw.owner} {isOwner && <span className="text-accent">(You)</span>}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Bounty</div>
            <div className="font-mono text-sm text-gray-300">{sw.bounty} ETH {sw.bountyClaimed && '(Claimed)'}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-8">
          <h2 className="text-xl font-bold border-b border-white/10 pb-2">Timeline</h2>
          
          <div className="space-y-6 border-l-2 border-white/10 pl-6 relative">
            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-green-500" />
              <h3 className="font-bold text-sm text-green-400">Armed</h3>
              <p className="text-xs text-gray-500 mt-1">Switch registered on Arbitrum and evidence secured.</p>
            </div>
            
            <div className="relative">
              <div className={`absolute -left-[31px] top-1 w-3 h-3 rounded-full ${['VULNERABLE', 'TRIGGERED'].includes(sw.status) ? 'bg-red-500' : 'bg-white/20'}`} />
              <h3 className={`font-bold text-sm ${['VULNERABLE', 'TRIGGERED'].includes(sw.status) ? 'text-red-400' : 'text-gray-500'}`}>Vulnerability Window</h3>
              <p className="text-xs text-gray-500 mt-1">Heartbeat window expired. Bounty hunters can trigger.</p>
            </div>
            
            <div className="relative">
              <div className={`absolute -left-[31px] top-1 w-3 h-3 rounded-full ${sw.status === 'TRIGGERED' ? 'bg-accent' : 'bg-white/20'}`} />
              <h3 className={`font-bold text-sm ${sw.status === 'TRIGGERED' ? 'text-accent' : 'text-gray-500'}`}>Detonated</h3>
              <p className="text-xs text-gray-500 mt-1">Switch was triggered. Lit Protocol will now decrypt the evidence.</p>
            </div>
          </div>

          <div className="flex gap-4">
            {sw.status === 'VULNERABLE' && (
              <TriggerButton switchId={sw.id} onTriggered={() => fetchSwitch()} />
            )}
            
            {sw.status === 'TRIGGERED' && !sw.bountyClaimed && wallet?.toLowerCase() === sw.triggerer?.toLowerCase() && (
              <ClaimBountyButton switchId={sw.id} onClaimed={() => fetchSwitch()} />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold border-b border-white/10 pb-2 mb-6">Evidence</h2>
          
          {sw.status !== 'TRIGGERED' ? (
            <div className="p-8 border border-white/10 bg-black/50 text-center">
              <div className="text-4xl mb-4">🔒</div>
              <div className="text-sm font-bold text-gray-300">Encrypted</div>
              <p className="text-xs text-gray-500 mt-2">The evidence is locked by the Lit Network and cannot be decrypted until the switch is triggered.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 border border-white/10 bg-white/5 font-mono text-xs break-all">
                <span className="text-gray-500 block mb-1">Permanent Storage (Irys)</span>
                <a href={`https://devnet.irys.xyz/${sw.irysTxId}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {sw.irysTxId}
                </a>
              </div>
              
              {!decryptedFile ? (
                <div className="p-8 border border-white/10 bg-black/50 text-center">
                  <p className="text-sm text-gray-300 mb-4">The switch has detonated. Lit Protocol allows decryption.</p>
                  <button 
                    onClick={handleDecrypt}
                    disabled={decrypting}
                    className="px-6 py-3 bg-white text-black font-medium tracking-widest uppercase hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {decrypting ? 'Decrypting via Lit...' : 'Decrypt Evidence'}
                  </button>
                  {decryptError && <div className="text-red-500 text-xs mt-4">{decryptError}</div>}
                </div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="border border-green-500/30 bg-green-500/5 p-1"
                >
                  <div className="bg-black p-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
                      <div>
                        <div className="text-xs font-bold text-green-400 uppercase tracking-widest">Decrypted Successfully</div>
                        <div className="text-xs text-gray-500 font-mono mt-1">{decryptedFile.name}</div>
                      </div>
                      <a 
                        href={decryptedFile.url} 
                        download={decryptedFile.name}
                        className="px-4 py-2 border border-white/20 text-xs font-medium uppercase tracking-widest hover:bg-white/10 transition-colors"
                      >
                        Download
                      </a>
                    </div>
                    
                    {decryptedFile.text ? (
                      <pre className="text-sm font-mono whitespace-pre-wrap text-gray-300 max-h-96 overflow-y-auto custom-scrollbar p-2">
                        {decryptedFile.text}
                      </pre>
                    ) : decryptedFile.type.startsWith('image/') ? (
                      <img src={decryptedFile.url} alt="Decrypted Evidence" className="max-w-full max-h-96 object-contain" />
                    ) : (
                      <div className="text-center p-8 text-sm text-gray-500 font-mono border border-dashed border-white/10">
                        Binary file. Please download to view.
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
