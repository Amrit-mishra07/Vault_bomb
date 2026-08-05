import { ethers } from "ethers";

const ABI = [
  "function getSwitchInfo(bytes32 switch_id) external view returns (address owner, bool is_active, bool is_triggered, uint256 heartbeat_window_blocks, uint256 grace_period_blocks, uint256 last_heartbeat_block, uint256 bounty_amount, bool bounty_claimed, uint256 last_nonce)",
  "function registerSwitch(bytes32 switch_id, uint256 heartbeat_window_blocks, uint256 grace_period_blocks, string arweave_tx_id, bytes32 evidence_hash, address duress_wallet, address backup_wallet) external payable",
  "function heartbeat(bytes32 switch_id, uint256 nonce) external",
  "function triggerRelease(bytes32 switch_id) external",
  "function claimBounty(bytes32 switch_id, bytes lit_proof) external",
  "event SwitchRegistered(bytes32 indexed switchId, address indexed journalist, uint256 heartbeatWindowBlocks, uint256 bountyAmount)",
  "event Triggered(bytes32 indexed switchId, address indexed journalist, address indexed triggerer, string arweaveTxId)",
  "event PlaintextPublished(bytes32 indexed switchId, string arweaveTxId)"
];

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';

export const getProvider = () => {
  if (window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
  }
  return new ethers.JsonRpcProvider("https://sepolia-rollup.arbitrum.io/rpc");
};

export const getContract = async (signerOrProvider: ethers.Signer | ethers.Provider) => {
  return new ethers.Contract(CONTRACT_ADDRESS, ABI, signerOrProvider);
};

const ARBITRUM_SEPOLIA_CHAIN_ID = "0x66eee";
const ARBITRUM_SEPOLIA_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";

export const ensureCorrectNetwork = async (provider: ethers.BrowserProvider) => {
  const network = await provider.getNetwork();
  if (network.chainId !== 421614n) {
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ARBITRUM_SEPOLIA_CHAIN_ID }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
              chainName: 'Arbitrum Sepolia',
              rpcUrls: [ARBITRUM_SEPOLIA_RPC_URL],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.arbiscan.io/'],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  }
};

/**
 * Safely fetches the current network gas price and adds a 50% buffer.
 * By returning `gasPrice` (instead of maxFeePerGas), we force MetaMask to send a
 * Legacy (Type 0) transaction. On Arbitrum, this entirely bypasses the strict
 * EIP-1559 `max fee per gas less than block base fee` rejection errors and the
 * missing `eth_maxPriorityFeePerGas` RPC endpoint issues.
 */
export const getRobustGasOverrides = async (provider: ethers.Provider): Promise<Record<string, bigint>> => {
  try {
    const rawGasPrice = await (provider as ethers.JsonRpcApiProvider).send("eth_gasPrice", []);
    const gasPrice = BigInt(rawGasPrice);
    return { gasPrice: (gasPrice * 150n) / 100n };
  } catch (e) {
    console.warn("Failed to fetch robust gas price, falling back to MetaMask defaults", e);
    return {};
  }
};

export const registerSwitch = async (
  switchId: string,
  heartbeatBlocks: number,
  graceBlocks: number,
  irysTxId: string,
  evidenceHash: string,
  duressWallet: string,
  backupWallet: string,
  bountyValue: string
) => {
  const provider = getProvider();
  if (!(provider instanceof ethers.BrowserProvider)) throw new Error("Wallet required");
  await ensureCorrectNetwork(provider);
  const signer = await provider.getSigner();
  const contract = await getContract(signer);

  const overrides: any = await getRobustGasOverrides(provider);
  const value = ethers.parseEther(bountyValue);

  // Manually estimate gas without gasPrice to avoid MetaMask/Arbitrum simulation errors
  const estimatedGas = await contract.registerSwitch.estimateGas(
    switchId,
    heartbeatBlocks,
    graceBlocks,
    irysTxId,
    evidenceHash,
    duressWallet,
    backupWallet,
    { value }
  );

  const tx = await contract.registerSwitch(
    switchId,
    heartbeatBlocks,
    graceBlocks,
    irysTxId,
    evidenceHash,
    duressWallet,
    backupWallet,
    {
      ...overrides,
      value,
      gasLimit: (estimatedGas * 120n) / 100n
    }
  );
  await tx.wait();
  return tx.hash;
};

/**
 * Sends a heartbeat transaction to reset the countdown timer for a switch.
 *
 * The nonce must be strictly increasing per switch (replay protection).
 * The caller is responsible for fetching the current last_nonce from
 * getSwitchInfo and passing lastNonce + 1 here.
 */
export const heartbeat = async (switchId: string, nonce: number): Promise<string> => {
  const provider = getProvider();
  if (!(provider instanceof ethers.BrowserProvider)) throw new Error("Wallet required");
  await ensureCorrectNetwork(provider);
  const signer = await provider.getSigner();
  const contract = await getContract(signer);

  const overrides = await getRobustGasOverrides(provider);
  
  const estimatedGas = await contract.heartbeat.estimateGas(switchId, nonce);
  const tx = await contract.heartbeat(switchId, nonce, {
    ...overrides,
    gasLimit: (estimatedGas * 120n) / 100n
  });
  await tx.wait();
  return tx.hash;
};

/**
 * Claims the bounty for triggering a switch release.
 *
 * MOCK NOTE: In a real Lit Protocol integration the litProof would be a
 * cryptographic signature produced by the Lit Action upon successful decryption.
 * In the current mock setup (lit-simulator), this proof is a hex string that
 * the simulator logs to its backend terminal. The caller must copy-paste it here.
 * This behaviour MUST be replaced with a proper Lit SDK proof-retrieval call
 * before any production deployment.
 */
export const claimBounty = async (switchId: string, litProof: string): Promise<string> => {
  const provider = getProvider();
  if (!(provider instanceof ethers.BrowserProvider)) throw new Error("Wallet required");
  await ensureCorrectNetwork(provider);
  const signer = await provider.getSigner();
  const contract = await getContract(signer);

  const overrides = await getRobustGasOverrides(provider);
  
  const estimatedGas = await contract.claimBounty.estimateGas(switchId, litProof);
  const tx = await contract.claimBounty(switchId, litProof, {
    ...overrides,
    gasLimit: (estimatedGas * 120n) / 100n
  });
  await tx.wait();
  return tx.hash;
};
