import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { EthersV6Adapter } from "@irys/web-upload-ethereum-ethers-v6";
import { ethers } from "ethers";

/**
 * Uploads a string payload to Irys (Arweave permanent storage) and returns the transaction ID.
 */
export const uploadToIrys = async (data: string): Promise<string> => {
  if (!window.ethereum) throw new Error("No Ethereum wallet found");

  const provider = new ethers.BrowserProvider(window.ethereum);
  
  const irys = await WebUploader(WebEthereum)
      .withAdapter(EthersV6Adapter(provider))
      .devnet();

  const receipt = await irys.upload(data);
  return receipt.id;
};
