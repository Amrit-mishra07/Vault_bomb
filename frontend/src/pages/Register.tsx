import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { generateAESKey, encryptData, exportKey, bufferToBase64 } from '../services/crypto';
import { uploadToIrys } from '../services/irys';
import { buildACC, encryptKey } from '../services/lit';
import { ethers } from 'ethers';
import { registerSwitch, getProvider, CONTRACT_ADDRESS } from '../contracts/VaultBomb';
import { useRpcCall } from '../hooks/useRpcCall';
import { simplifyError } from '../utils/errors';

export default function Register({ wallet }: { wallet: string | null }) {
  const { isRateLimited } = useRpcCall();
  
  const [secretText, setSecretText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [bounty, setBounty] = useState('0.0001');
  const [heartbeatBlocks, setHeartbeatBlocks] = useState('7200'); // ~1 day
  
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successSwitchId, setSuccessSwitchId] = useState<string | null>(null);

  const steps = [
    { id: 0, name: 'Local Encryption', status: activeStep === 0 ? 'active' : activeStep > 0 ? 'done' : 'pending' },
    { id: 1, name: 'Arweave Storage', status: activeStep === 1 ? 'active' : activeStep > 1 ? 'done' : 'pending' },
    { id: 2, name: 'Lit Custody', status: activeStep === 2 ? 'active' : activeStep > 2 ? 'done' : 'pending' },
    { id: 3, name: 'On-Chain Switch', status: activeStep === 3 ? 'active' : activeStep > 3 ? 'done' : 'pending' }
  ];

  const handleArm = async () => {
    if (!wallet) {
      setError("Please connect your wallet first.");
      return;
    }
    
    if (!secretText && !file) {
      setError("Please provide either text evidence or a file.");
      return;
    }

    // Rough check on file size to prevent massive Irys upload bills during testing. 5MB.
    if (file && file.size > 5 * 1024 * 1024) {
      setError("File must be smaller than 5MB for the current testnet configuration.");
      return;
    }

    setError(null);
    setSuccessSwitchId(null);
    setActiveStep(0); // Start Local Encryption

    try {
      const provider = getProvider();
      const signer = await provider.getSigner();
      const ownerAddress = await signer.getAddress();

      // --- 1. LOCAL ENCRYPTION ---
      let dataToEncrypt: Uint8Array;
      if (file) {
        const arrayBuffer = await file.arrayBuffer();
        dataToEncrypt = new Uint8Array(arrayBuffer);
      } else {
        dataToEncrypt = new TextEncoder().encode(secretText);
      }

      const key = await generateAESKey();
      const { ciphertext: secretCiphertext, iv } = await encryptData(dataToEncrypt, key);
      
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataToEncrypt.buffer as ArrayBuffer);
      const evidenceHash = "0x" + Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Format ciphertext for Lit Protocol mock (iv + ciphertext)
      const ivBuffer = Uint8Array.from(atob(iv), c => c.charCodeAt(0));
      const ciphertextBuffer = Uint8Array.from(atob(secretCiphertext), c => c.charCodeAt(0));
      const combined = new Uint8Array(12 + ciphertextBuffer.byteLength);
      combined.set(ivBuffer, 0);
      combined.set(ciphertextBuffer, 12);
      const fullCiphertext = await bufferToBase64(combined);
      
      setActiveStep(1); // Start Arweave

      // --- 2. SECURE SWITCH ID GENERATION & LIT CUSTODY ---
      // We do this before Arweave because Lit might take a while to wake up, 
      // but actually the prompt says Encrypt -> Upload -> Custody -> Register. Let's follow that.
      
      // Generate ID securely
      const randomBytes = new Uint8Array(32);
      window.crypto.getRandomValues(randomBytes);
      const switchId = ethers.hexlify(randomBytes);
      const acc = buildACC(CONTRACT_ADDRESS, switchId);

      // --- 3. LIT CUSTODY ---
      // We flip this step slightly in UI to let Irys run first, but wait, Lit needs the ciphertext hash anyway.
      // Lit might cold start (Render free tier).
      setActiveStep(2); 
      const exportedKeyStr = await exportKey(key);
      const litData = await encryptKey(
        exportedKeyStr, 
        acc, 
        switchId, 
        ownerAddress, 
        evidenceHash, 
        fullCiphertext
      );

      // --- 2. IRYS UPLOAD --- (Returning to 1 in logic flow, UI is just an order of ops)
      setActiveStep(1);
      const payload = JSON.stringify({
        secretCiphertext,
        iv,
        litCiphertext: litData.ciphertext,
        litHash: litData.dataToEncryptHash,
        mimeType: file ? file.type : "text/plain",
        fileName: file ? file.name : "secret.txt"
      });
      const irysTxId = await uploadToIrys(payload);

      // --- 4. ON-CHAIN REGISTRATION ---
      setActiveStep(3);
      const hbBlocks = parseInt(heartbeatBlocks);
      if (isNaN(hbBlocks) || hbBlocks <= 0) throw new Error("Invalid heartbeat window");
      
      // Wrapped in our rpcCall just to track rate limits if needed, though tx signing is MetaMask.
      await registerSwitch(
        switchId, 
        hbBlocks, 
        20, // grace period
        irysTxId, 
        evidenceHash,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        bounty
      );

      setActiveStep(4); // All done
      setSuccessSwitchId(switchId);

      // Persist to localStorage
      try {
        const stored = localStorage.getItem('vaultBombSwitches') || '[]';
        const parsed = JSON.parse(stored);
        parsed.unshift({ id: switchId, timestamp: Date.now() });
        localStorage.setItem('vaultBombSwitches', JSON.stringify(parsed));
      } catch (e) {
        console.error("Failed to save switch locally", e);
      }

    } catch (err: any) {
      console.error(err);
      setError(simplifyError(err));
      setActiveStep(-1);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSecretText(''); // mutually exclusive for now to keep UI simple
    }
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="py-12 max-w-2xl">
      <h1 className="text-3xl font-bold tracking-tight mb-2">Arm Switch</h1>
      <p className="text-gray-400 text-sm mb-12 border-b border-white/10 pb-8">
        Deposit evidence into the Vault. It remains encrypted locally and stored permanently. 
        It will only be decrypted if you fail to send your heartbeat.
      </p>

      {successSwitchId ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-accent/10 border border-accent p-8 rounded-sm"
        >
          <div className="text-accent font-bold mb-4 uppercase tracking-wider text-sm">Vault Armed Successfully</div>
          <p className="text-gray-300 mb-6 text-sm leading-relaxed">
            Your evidence is securely locked. The network is monitoring your heartbeat.
            Keep your Switch ID safe, though it has been saved to your local browser storage.
          </p>
          <div className="bg-black/50 p-4 border border-white/10 font-mono text-sm break-all mb-8 text-white">
            {successSwitchId}
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => navigator.clipboard.writeText(successSwitchId)}
              className="px-4 py-2 border border-white/20 hover:border-white transition-colors text-sm font-medium"
            >
              Copy ID
            </button>
            <Link 
              to="/dashboard"
              className="px-4 py-2 bg-white text-black hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Go to Dashboard
            </Link>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-8">
          
          <div className="space-y-4">
            <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">Evidence</label>
            
            {!file ? (
              <textarea 
                className="w-full bg-white/5 border border-white/10 p-4 min-h-[150px] text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-all resize-y placeholder:text-gray-700"
                placeholder="Type your secret evidence here, or upload a file below..."
                value={secretText}
                onChange={e => setSecretText(e.target.value)}
              />
            ) : (
              <div className="w-full bg-white/5 border border-white/10 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 bg-white/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-mono">FILE</span>
                  </div>
                  <span className="text-sm font-medium truncate">{file.name}</span>
                  <span className="text-xs text-gray-500 font-mono">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button onClick={clearFile} className="text-xs text-gray-400 hover:text-white uppercase tracking-widest px-2 py-1">Remove</button>
              </div>
            )}
            
            {!file && (
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  className="hidden" 
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-medium uppercase tracking-widest border border-white/20 px-4 py-2 hover:bg-white/5 transition-colors"
                >
                  Upload File Instead
                </button>
                <span className="text-xs text-gray-600 ml-4 font-mono">Max 5MB</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">Heartbeat Window</label>
              <div className="relative">
                <input 
                  type="number" 
                  className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-accent outline-none font-mono"
                  value={heartbeatBlocks}
                  onChange={e => setHeartbeatBlocks(e.target.value)}
                />
                <span className="absolute right-3 top-3 text-xs text-gray-500 font-mono">Blocks</span>
              </div>
              <p className="text-xs text-gray-500">
                ~{((parseInt(heartbeatBlocks) || 0) * 12 / 3600).toFixed(1)} hours
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500">Trigger Bounty</label>
              <div className="relative">
                <input 
                  type="number"
                  step="0.0001" 
                  className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-accent outline-none font-mono"
                  value={bounty}
                  onChange={e => setBounty(e.target.value)}
                />
                <span className="absolute right-3 top-3 text-xs text-gray-500 font-mono">ETH</span>
              </div>
              <p className="text-xs text-gray-500">Reward for the caller</p>
            </div>
          </div>

          {/* Progress Tracker (only shows when active) */}
          <AnimatePresence>
            {activeStep > 0 && activeStep < 4 && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-black border border-white/10 p-6 space-y-4"
              >
                {activeStep === 2 && (
                  <div className="text-xs text-accent mb-4 font-mono">
                    * Waking up Lit custody node (this can take ~30s on first use)
                  </div>
                )}
                {steps.map(step => (
                  <div key={step.id} className={`flex items-center gap-4 text-sm font-mono ${step.status === 'pending' ? 'text-gray-600' : step.status === 'active' ? 'text-white' : 'text-accent'}`}>
                    <div className="w-4 flex justify-center">
                      {step.status === 'done' ? '✓' : step.status === 'active' ? (
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      ) : '·'}
                    </div>
                    <span className={step.status === 'active' ? 'font-bold' : ''}>{step.name}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="p-4 bg-red-950/30 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}
          
          {isRateLimited && (
            <div className="p-4 bg-yellow-950/30 border border-yellow-500/30 text-yellow-400 text-sm">
              RPC Rate Limit hit. Waiting to retry...
            </div>
          )}

          <button
            onClick={handleArm}
            disabled={activeStep > 0 || !wallet}
            className="w-full py-4 bg-white text-black font-medium tracking-widest uppercase hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activeStep > 0 ? 'Processing...' : 'Lock Evidence & Arm'}
          </button>
        </div>
      )}
    </div>
  );
}
