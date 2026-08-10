export const buildACC = (contractAddress: string, switchId: string) => {
  return [
    {
      contractAddress,
      functionName: "getSwitchInfo",
      functionParams: [switchId],
      functionAbi: {
        inputs: [{ internalType: "bytes32", name: "switch_id", type: "bytes32" }],
        name: "getSwitchInfo",
        outputs: [
          { internalType: "address", name: "owner", type: "address" },
          { internalType: "bool", name: "is_active", type: "bool" },
          { internalType: "bool", name: "is_triggered", type: "bool" },
          { internalType: "uint256", name: "heartbeat_window_blocks", type: "uint256" },
          { internalType: "uint256", name: "grace_period_blocks", type: "uint256" },
          { internalType: "uint256", name: "last_heartbeat_block", type: "uint256" },
          { internalType: "uint256", name: "bounty_amount", type: "uint256" },
          { internalType: "bool", name: "bounty_claimed", type: "bool" },
          { internalType: "uint256", name: "last_nonce", type: "uint256" },
          { internalType: "address", name: "triggerer", type: "address" }
        ],
        stateMutability: "view",
        type: "function"
      },
      chain: "arbitrumSepolia",
      returnValueTest: {
        key: "is_triggered",
        comparator: "=",
        value: "true"
      }
    }
  ];
};

export const encryptKey = async (
  keyStr: string,
  _acc: any,
  switchId?: string,
  journalistAddress?: string,
  evidenceHash?: string,
  ciphertext?: string
) => {
  const isDev = import.meta.env.DEV;
  const API_URL = import.meta.env.VITE_LIT_SIMULATOR_URL || (isDev ? "http://localhost:3000" : "https://vault-bomb-simulator.onrender.com");
  const res = await fetch(`${API_URL}/store-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      switchId,
      journalistAddress,
      aesKey: keyStr,
      evidenceHash,
      ciphertext
    })
  });
  
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to store key in Lit Simulator");
  }
  
  return {
    ciphertext: "simulated_ciphertext",
    dataToEncryptHash: "simulated_hash"
  };
};

export const decryptKey = async (_ciphertext: string, _dataToEncryptHash: string, _acc: any, switchId?: string) => {
  const isDev = import.meta.env.DEV;
  const API_URL = import.meta.env.VITE_LIT_SIMULATOR_URL || (isDev ? "http://localhost:3000" : "https://vault-bomb-simulator.onrender.com");
  const res = await fetch(`${API_URL}/get-key/${switchId}`);
  if (!res.ok) {
    throw new Error("Failed to retrieve key from Lit Simulator. Is it triggered on-chain?");
  }
  const data = await res.json();
  return data.aesKey;
};

