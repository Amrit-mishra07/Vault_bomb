import { ethers } from 'ethers';

/**
 * Decodes a Stylus contract revert reason from raw error data.
 *
 * Stylus contracts return revert reasons as raw UTF-8 bytes rather than
 * ABI-encoded `Error(string)`, so ethers.js leaves `err.reason` null and
 * cannot display a human-readable message. This function reads the raw `data`
 * field from an ethers CALL_EXCEPTION error and decodes it.
 *
 * Returns the decoded string when the bytes form valid printable ASCII,
 * otherwise returns an empty string so callers can fall back gracefully.
 */
export function decodeRevertReason(error: unknown): string {
  const err = error as any;
  const data: unknown = err?.data ?? err?.error?.data ?? err?.info?.error?.data;
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length <= 2) {
    return '';
  }
  try {
    const bytes = ethers.getBytes(data);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    // Only return the decoded string if it is entirely printable ASCII.
    if (decoded && /^[\x20-\x7E]+$/.test(decoded)) return decoded;
  } catch {
    // Not valid UTF-8 — fall through
  }
  return '';
}
