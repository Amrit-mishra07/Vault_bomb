export const generateAESKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

export const exportKey = async (key: CryptoKey): Promise<string> => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  return btoa(String.fromCharCode(...new Uint8Array(exported)));
};

export const importKey = async (keyStr: string): Promise<CryptoKey> => {
  const keyBytes = Uint8Array.from(atob(keyStr), c => c.charCodeAt(0));
  return await window.crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
};

export const encryptData = async (data: Uint8Array, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    data.buffer as ArrayBuffer
  );
  
  const ciphertext = btoa(String.fromCharCode(...new Uint8Array(ciphertextBuffer)));
  const ivStr = btoa(String.fromCharCode(...iv));
  
  return { ciphertext, iv: ivStr };
};

export const decryptData = async (ciphertextStr: string, ivStr: string, key: CryptoKey): Promise<Uint8Array> => {
  const ciphertext = Uint8Array.from(atob(ciphertextStr), c => c.charCodeAt(0)).buffer;
  const iv = Uint8Array.from(atob(ivStr), c => c.charCodeAt(0));
  
  const decryptedData = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  );
  
  return new Uint8Array(decryptedData);
};

export const encryptText = async (text: string, key: CryptoKey): Promise<{ ciphertext: string, iv: string }> => {
  const encodedText = new TextEncoder().encode(text);
  return encryptData(encodedText, key);
};

export const decryptText = async (ciphertextStr: string, ivStr: string, key: CryptoKey): Promise<string> => {
  const decryptedData = await decryptData(ciphertextStr, ivStr, key);
  return new TextDecoder().decode(decryptedData);
};
