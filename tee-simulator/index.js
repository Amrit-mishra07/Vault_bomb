require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
// Increase limit for demo evidence payloads
app.use(express.json({ limit: "50mb" }));

// In a real TEE (e.g. EigenCloud or AWS Nitro), this state is protected by hardware isolation.
// For the hackathon demo, we hold it in memory.
const keyStore = new Map(); // Map<journalistAddress, {aesKey, evidenceHash, ciphertext}>

app.post("/store-key", (req, res) => {
    const { journalistAddress, aesKey, evidenceHash, ciphertext } = req.body;
    if (!journalistAddress || !aesKey || !evidenceHash || !ciphertext) {
        return res.status(400).json({ error: "Missing parameters" });
    }
    
    console.log(`\n[TEE] Securing key and evidence for journalist: ${journalistAddress}`);
    console.log(`[TEE] Expected Evidence Hash (SHA-256): ${evidenceHash}`);
    
    keyStore.set(journalistAddress.toLowerCase(), {
        aesKey, // Base64 string
        evidenceHash,
        ciphertext // Base64 string (IV + Ciphertext + AuthTag)
    });

    // In a real implementation, the TEE returns a cryptographic attestation/signature
    // over (evidenceHash || journalistAddress) signed by the enclave's private key.
    // For this mock demo, we return a dummy signature that the contract accepts.
    res.json({
        success: true,
        teeSignature: "0xdeadbeef" 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mock TEE Enclave started on port ${PORT}`);
    console.log(`Waiting for connections and blockchain triggers...`);
});

// ---------------------------------------------------------
// Listen for Blockchain Trigger Events
// ---------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

if (CONTRACT_ADDRESS) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    // ABI matching the Stylus contract event
    const abi = [
        "event Triggered(address indexed journalist, string arweaveTxId, address teeEndpoint)"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
    
    console.log(`Listening for TRIGGERED events on ${CONTRACT_ADDRESS}...`);
    
    contract.on("Triggered", async (journalist, arweaveTxId, teeEndpoint) => {
        console.log(`\n======================================================`);
        console.log(`🚨 TRIGGERED EVENT RECEIVED FOR ${journalist} 🚨`);
        console.log(`======================================================`);
        
        const keyData = keyStore.get(journalist.toLowerCase());
        if (!keyData) {
            console.error(`[X] Error: Key not found in TEE for ${journalist}`);
            return;
        }

        console.log(`[*] Fetching encrypted evidence... (Simulating Arweave TX: ${arweaveTxId})`);
        
        try {
            // Decrypt the payload
            console.log(`[*] Decrypting evidence with securely held AES key...`);
            
            const rawKey = Buffer.from(keyData.aesKey, 'base64');
            const encryptedData = Buffer.from(keyData.ciphertext, 'base64');
            
            // Extract IV (first 12 bytes)
            const iv = encryptedData.subarray(0, 12);
            // Extract Auth Tag (last 16 bytes)
            const authTag = encryptedData.subarray(encryptedData.length - 16);
            // Extract Ciphertext
            const ciphertext = encryptedData.subarray(12, encryptedData.length - 16);
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', rawKey, iv);
            decipher.setAuthTag(authTag);
            
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);
            
            // Verify Hash
            const computedHash = "0x" + crypto.createHash("sha256").update(plaintext).digest("hex");
            if (computedHash !== keyData.evidenceHash) {
                throw new Error(`Hash mismatch! Expected ${keyData.evidenceHash}, got ${computedHash}`);
            }
            
            console.log(`[✔] Evidence successfully decrypted!`);
            console.log(`[✔] Integrity hash matched perfectly.`);
            
            console.log(`\n[*] Publishing plaintext to pre-configured journalistic endpoints...`);
            
            // Save to disk to prove it worked
            const outPath = path.join(__dirname, `released_evidence_${Date.now()}.txt`);
            fs.writeFileSync(outPath, plaintext);
            
            console.log(`\n[SUCCESS] Unstoppable Release Complete!`);
            console.log(`[SUCCESS] Evidence written to: ${outPath}`);
            console.log(`======================================================\n`);
            
        } catch (e) {
            console.error(`[X] Decryption failed:`, e.message);
        }
    });
} else {
    console.warn("No CONTRACT_ADDRESS provided in .env, skipping on-chain event listener.");
    console.warn("To test decryption manually, you will need to trigger the contract and pass the address.");
}
