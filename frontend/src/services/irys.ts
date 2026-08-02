import { WebIrys } from "@irys/sdk";
import { ethers } from "ethers";

export const uploadToIrys = async (data: string): Promise<string> => {
  if (!window.ethereum) throw new Error("No Ethereum wallet found");
  
  const provider = new ethers.BrowserProvider(window.ethereum);
  
  const irys = new WebIrys({
    url: "https://devnet.irys.xyz",
    token: "ethereum",
    wallet: { name: "ethersv6", provider: provider },
  });

  await irys.ready();
  const receipt = await irys.upload(data);
  return receipt.id;
};
