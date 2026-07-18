require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Mocking Lit Protocol's decentralized MPC state
const litKeyStore = new Map(); // Map<journalistAddress, {aesKey, evidenceHash, ciphertext}>

app.post("/store-key", (req, res) => {
    const { journalistAddress, aesKey, evidenceHash, ciphertext } = req.body;
    if (!journalistAddress || !aesKey || !evidenceHash || !ciphertext) {
        return res.status(400).json({ error: "Missing parameters" });
    }
    
    console.log(`\n[LIT PROTOCOL] Securing key and evidence for journalist: ${journalistAddress}`);
    console.log(`[LIT PROTOCOL] Access Control Condition (ACC): "triggerRelease() must be called on-chain"`);
    
    litKeyStore.set(journalistAddress.toLowerCase(), {
        aesKey,
        evidenceHash,
        ciphertext
    });

    res.json({
        success: true,
        litSignature: "0xdeadbeef_lit_setup_proof" 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mock Lit Protocol Node started on port ${PORT}`);
    console.log(`Waiting for blockchain ACC unlocks...`);
});

// ---------------------------------------------------------
// Listen for Blockchain Trigger Events (ACC Unlock)
// ---------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

if (CONTRACT_ADDRESS) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    // ABI matching the Stylus contract event
    const abi = [
        "event Triggered(address indexed journalist, address indexed triggerer, string arweaveTxId)"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
    
    console.log(`Listening for ACC unlock on ${CONTRACT_ADDRESS}...`);
    
    contract.on("Triggered", async (journalist, triggerer, arweaveTxId) => {
        console.log(`\n======================================================`);
        console.log(`🚨 LIT ACTION UNLOCKED FOR ${journalist} 🚨`);
        console.log(`Triggered by Bounty Hunter: ${triggerer}`);
        console.log(`======================================================`);
        
        const keyData = litKeyStore.get(journalist.toLowerCase());
        if (!keyData) {
            console.error(`[X] Error: Key not found in Lit nodes for ${journalist}`);
            return;
        }

        try {
            console.log(`[*] MPC nodes combining shares to reconstruct AES key...`);
            console.log(`[*] Fetching encrypted evidence... (Arweave TX: ${arweaveTxId})`);
            
            const rawKey = Buffer.from(keyData.aesKey, 'base64');
            const encryptedData = Buffer.from(keyData.ciphertext, 'base64');
            
            const iv = encryptedData.subarray(0, 12);
            const authTag = encryptedData.subarray(encryptedData.length - 16);
            const ciphertext = encryptedData.subarray(12, encryptedData.length - 16);
            
            const decipher = crypto.createDecipheriv('aes-256-gcm', rawKey, iv);
            decipher.setAuthTag(authTag);
            
            const plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final()
            ]);
            
            const computedHash = "0x" + crypto.createHash("sha256").update(plaintext).digest("hex");
            if (computedHash !== keyData.evidenceHash) {
                throw new Error(`Hash mismatch!`);
            }
            
            console.log(`[✔] Evidence successfully decrypted by Lit Action!`);
            
            // MULTI-CHANNEL PUBLISHING
            console.log(`\n[*] Executing Multi-Channel Publishing from inside Lit Action...`);
            
            const outPath = path.join(__dirname, `released_evidence_${Date.now()}.txt`);
            fs.writeFileSync(outPath, plaintext);
            console.log(`  ➔ [Arweave] Uploaded successfully (Mocked via local disk: ${outPath})`);
            console.log(`  ➔ [Farcaster] Cast published: "AUTOMATED RELEASE: Evidence attached..." (Mocked)`);
            console.log(`  ➔ [Email] Dispatched to press freedom org list (Mocked)`);
            
            console.log(`\n[SUCCESS] Unstoppable Release Complete!`);
            
            // Generate the bounty claim proof
            const publicationProof = "0x" + crypto.createHash("sha256").update("PUBLISHED" + journalist).digest("hex");
            console.log(`\n💰 BOUNTY PROOF FOR TRIGGERER 💰`);
            console.log(`Triggerer ${triggerer} can now call claim_bounty() with this Lit Proof:`);
            console.log(`${publicationProof}`);
            console.log(`======================================================\n`);
            
        } catch (e) {
            console.error(`[X] Lit Action failed:`, e.message);
        }
    });
} else {
    console.warn("No CONTRACT_ADDRESS provided in .env.");
}
