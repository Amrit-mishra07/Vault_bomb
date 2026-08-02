require('dotenv').config();
const { ethers } = require('ethers');
const crypto = require('crypto');

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RPC_URL = process.env.RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const LIT_SIMULATOR_URL = process.env.LIT_SIMULATOR_URL || "http://localhost:3000/store-key";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
  "function registerSwitch(bytes32 switch_id, uint256 heartbeat_window_blocks, uint256 grace_period_blocks, string arweave_tx_id, bytes32 evidence_hash, address duress_wallet, address backup_wallet) external payable"
];

async function main() {
    if (!CONTRACT_ADDRESS || !PRIVATE_KEY) {
        console.error("Missing CONTRACT_ADDRESS or PRIVATE_KEY in environment variables.");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    const evidenceText = "This is the highly sensitive whistleblower evidence.";
    const windowBlocks = 50n;
    const graceBlocks = 10n;
    const bountyEth = "0.01";

    console.log("1. Encrypting evidence locally...");
    const switchId = ethers.hexlify(crypto.randomBytes(32));
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(evidenceText, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    const ciphertext = Buffer.concat([iv, encrypted, authTag]);
    const evidenceHash = "0x" + crypto.createHash('sha256').update(evidenceText).digest('hex');

    console.log("2. Transmitting key to Lit simulator...");
    const litResponse = await fetch(LIT_SIMULATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            switchId,
            journalistAddress: wallet.address,
            aesKey: aesKey.toString('base64'),
            evidenceHash,
            ciphertext: ciphertext.toString('base64')
        })
    });
    
    const litResult = await litResponse.json();
    if (!litResponse.ok || !litResult.success) {
        console.error("Lit nodes rejected the payload:", litResult);
        process.exit(1);
    }
    
    console.log("3. Executing three-phase commit (registerSwitch)...");
    const tx = await contract.registerSwitch(
        switchId,
        windowBlocks,
        graceBlocks,
        "arweave_mock_tx_123", // Mock Arweave upload
        evidenceHash,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        { value: ethers.parseEther(bountyEth) }
    );
    
    console.log("Tx sent:", tx.hash);
    await tx.wait();
    console.log(`Success! Switch ${switchId} registered.`);
}

main().catch(console.error);
