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

// Health check endpoint for UptimeRobot to keep the free Render instance awake
app.get("/health", (req, res) => {
    res.status(200).send("OK");
});

// Prevent Ethers.js from crashing the app on RPC 429 rate limits
process.on('uncaughtException', (err) => {
    console.error('[RPC Error] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[RPC Error] Unhandled Rejection:', reason.message || reason);
});

// Mocking Lit Protocol's decentralized MPC state with persistence
const KEYS_FILE = path.join(__dirname, 'keys.json');
const litKeyStore = new Map(); 

// Load existing keys
if (fs.existsSync(KEYS_FILE)) {
    try {
        const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        for (const [k, v] of Object.entries(data)) {
            litKeyStore.set(k, v);
        }
        console.log(`Loaded ${litKeyStore.size} keys from disk.`);
    } catch (e) {
        console.error("Failed to load keys.json:", e.message);
    }
}

const saveKeys = () => {
    const obj = {};
    for (const [k, v] of litKeyStore.entries()) {
        obj[k] = v;
    }
    fs.writeFileSync(KEYS_FILE, JSON.stringify(obj, null, 2));
};

app.post("/store-key", (req, res) => {
    const { switchId, journalistAddress, aesKey, evidenceHash, ciphertext } = req.body;
    if (!switchId || !journalistAddress || !aesKey || !evidenceHash || !ciphertext) {
        return res.status(400).json({ error: "Missing parameters" });
    }
    if (!ethers.isHexString(switchId, 32) || switchId === ethers.ZeroHash) {
        return res.status(400).json({ error: "switchId must be a non-zero bytes32 hex value" });
    }
    const key = switchId.toLowerCase();
    if (litKeyStore.has(key)) {
        return res.status(409).json({ error: "Key already stored for this switchId" });
    }
    
    console.log(`\n[LIT PROTOCOL] Securing key and evidence for switch ${switchId} owned by: ${journalistAddress}`);
    console.log(`[LIT PROTOCOL] Access Control Condition (ACC): "triggerRelease() must be called on-chain"`);
    
    litKeyStore.set(key, {
        aesKey,
        evidenceHash,
        ciphertext
    });
    saveKeys();

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

app.get("/get-key/:switchId", (req, res) => {
    const key = req.params.switchId.toLowerCase();
    if (!litKeyStore.has(key)) {
        return res.status(404).json({ error: "Key not found" });
    }
    const data = litKeyStore.get(key);
    res.json({ aesKey: data.aesKey });
});

// ---------------------------------------------------------
// Listen for Blockchain Trigger Events (ACC Unlock)
// ---------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;

if (CONTRACT_ADDRESS) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    provider.pollingInterval = 12000; // Poll every 12 seconds instead of aggressively to avoid 429s
    // ABI matching the Stylus contract event
    const abi = [
        "event Triggered(bytes32 indexed switchId, address indexed journalist, address indexed triggerer, string arweaveTxId)"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
    
    console.log(`Listening for ACC unlock on ${CONTRACT_ADDRESS}...`);
    
    contract.on("Triggered", async (switchId, journalist, triggerer, arweaveTxId) => {
        console.log(`\n======================================================`);
        console.log(`🚨 LIT ACTION UNLOCKED FOR ${journalist} 🚨`);
        console.log(`Triggered by Bounty Hunter: ${triggerer}`);
        console.log(`======================================================`);
        
        const keyData = litKeyStore.get(switchId.toLowerCase());
        if (!keyData) {
            console.error(`[X] Error: Key not found in Lit nodes for switch ${switchId}`);
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
            
            // Generate the bounty claim proof (65 bytes for mock ECDSA signature)
            const hash = crypto.createHash("sha256").update("PUBLISHED" + switchId).digest("hex");
            const publicationProof = "0x" + hash + hash + "00"; // 64 bytes of hash + 1 byte recovery id

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
