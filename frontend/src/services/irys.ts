import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { ethers } from "ethers";

export const uploadToIrys = async (data: string): Promise<string> => {
  if (!window.ethereum) throw new Error("No Ethereum wallet found");
  
  const provider = new ethers.BrowserProvider(window.ethereum);
  
  const irys = await WebUploader(WebEthereum)
      .withProvider(provider)
      .devnet();

  const receipt = await irys.upload(data);
  return receipt.id;
};
