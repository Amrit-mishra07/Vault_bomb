require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { ethers } = require("ethers");

const app = express();
app.use(cors());
app.use(express.json());

// In a real TEE (e.g. EigenCloud or AWS Nitro), this state is protected by hardware isolation.
// For the hackathon demo, we hold it in memory.
const keyStore = new Map(); // Map<journalistAddress, {aesKey, evidenceHash}>

app.post("/store-key", (req, res) => {
    const { journalistAddress, aesKey, evidenceHash } = req.body;
    if (!journalistAddress || !aesKey || !evidenceHash) {
        return res.status(400).json({ error: "Missing parameters" });
    }
    
    console.log(`[TEE] Storing key for journalist: ${journalistAddress}`);
    keyStore.set(journalistAddress.toLowerCase(), {
        aesKey,
        evidenceHash
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
});

// ---------------------------------------------------------
// Listen for Blockchain Trigger Events
// ---------------------------------------------------------
const RPC_URL = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const provider = new ethers.JsonRpcProvider(RPC_URL);

// ABI matching the Stylus contract event
const abi = [
    "event Triggered(address indexed journalist, string arweaveTxId, address teeEndpoint)"
];

if (CONTRACT_ADDRESS) {
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
    
    console.log(`Listening for TRIGGERED events on ${CONTRACT_ADDRESS}...`);
    
    contract.on("Triggered", async (journalist, arweaveTxId, teeEndpoint) => {
        console.log(`\n[!] 🔥 TRIGGERED EVENT RECEIVED FOR ${journalist} 🔥`);
        
        const keyData = keyStore.get(journalist.toLowerCase());
        if (!keyData) {
            console.error(`[X] Error: Key not found in TEE for ${journalist}`);
            return;
        }

        console.log(`[*] Fetching encrypted evidence from Arweave TX: ${arweaveTxId}`);
        // In reality: const response = await fetch(`https://arweave.net/${arweaveTxId}`);
        
        console.log(`[*] Decrypting evidence with securely held AES key...`);
        // In reality: AES-GCM decryption using keyData.aesKey
        
        console.log(`[*] Evidence successfully decrypted. Integrity hash matched: ${keyData.evidenceHash}`);
        console.log(`[*] Publishing plaintext to pre-configured journalistic endpoints...`);
        
        console.log(`\n[SUCCESS] Unstoppable Release Complete for ${journalist}\n`);
    });
} else {
    console.warn("No CONTRACT_ADDRESS provided in .env, skipping on-chain event listener.");
}
