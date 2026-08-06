/**
 * Converts any thrown error into a concise, plain-English sentence that
 * describes *what actually went wrong* rather than a generic step description.
 *
 * Checks error shapes in priority order:
 * 1. MetaMask / EIP-1193 error codes
 * 2. ethers v6 error codes
 * 3. HTTP fetch errors from the Lit Simulator or Irys
 * 4. DOMException names (Web Crypto API)
 * 5. Known plain-message patterns
 * 6. Fallback to the raw message
 */
export function simplifyError(err: any): string {
  const code: number | string | undefined = err?.code ?? err?.error?.code;
  const msg: string = (err?.message ?? String(err)).toLowerCase();

  // ── MetaMask / EIP-1193 numeric codes ──────────────────────────────────────
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return 'You rejected the request in MetaMask. Re-open MetaMask and approve when prompted.';
  }
  if (code === -32002) {
    return 'MetaMask already has a pending connection request. Open MetaMask and approve or reject it, then try again.';
  }
  if (code === -32603) {
    if (msg.includes('max fee per gas less than block base fee')) {
      return 'The network fee spiked exactly as you submitted the transaction, so it was underpriced. Please try clicking the button again.';
    }
    return 'MetaMask encountered an internal error. Try unlocking your wallet or restarting MetaMask.';
  }
  if (code === 4902) {
    return 'The required network is not added to MetaMask. Add Arbitrum Sepolia and switch to it.';
  }
  if (code === 4100) {
    return 'MetaMask is locked or the account is not authorised. Unlock MetaMask and try again.';
  }

  // ── ethers v6 error codes ──────────────────────────────────────────────────
  if (code === 'INSUFFICIENT_FUNDS' || msg.includes('insufficient funds')) {
    return 'Your wallet does not have enough ETH to cover gas fees plus the bounty amount. Top up and retry.';
  }
  if (code === 'CALL_EXCEPTION') {
    const reason: string = err?.reason ?? err?.revert?.name ?? '';
    if (reason) return `Contract reverted: "${reason}". Check the switch parameters and your wallet balance.`;
    return 'The contract call was reverted. The switch may already exist, the bounty may be zero, or the network may be wrong.';
  }
  if (code === 'NETWORK_ERROR' || msg.includes('network')) {
    return 'Cannot reach the Arbitrum Sepolia network. Check your internet connection and try again.';
  }
  if (code === 'TIMEOUT') {
    return 'The network request timed out. The RPC node may be under load — wait a moment and retry.';
  }
  if (code === 'UNPREDICTABLE_GAS_LIMIT' || msg.includes('gas')) {
    return 'Gas estimation failed. This usually means the transaction would revert on-chain. Check your inputs and wallet balance.';
  }
  if (code === 'NONCE_EXPIRED' || msg.includes('nonce')) {
    return 'Transaction nonce mismatch. Reset your MetaMask account activity (Settings → Advanced → Reset Account) and try again.';
  }
  if (code === 'REPLACEMENT_UNDERPRICED' || msg.includes('replacement')) {
    return 'A pending transaction with the same nonce is already in the mempool. Wait for it to confirm or speed it up in MetaMask.';
  }

  // ── Lit Simulator HTTP errors ──────────────────────────────────────────────
  if (msg.includes('failed to store key in lit simulator')) {
    return 'The Lit Simulator backend rejected the key. The simulator service may be down or unreachable — check its status and try again.';
  }
  if (msg.includes('failed to retrieve key')) {
    return 'The Lit Simulator could not return the key. Make sure the switch has been triggered on-chain before trying to read the secret.';
  }
  if (msg.includes('store-key') || msg.includes('get-key')) {
    return 'A request to the Lit Simulator failed. The simulator service may be temporarily unavailable.';
  }

  // ── Irys / Arweave upload errors ───────────────────────────────────────────
  if (msg.includes('irys') || msg.includes('arweave') || msg.includes('upload')) {
    return 'The Irys upload failed. The Irys devnet may be temporarily unavailable — try again in a moment.';
  }
  if (msg.includes('failed to fetch') || err?.name === 'TypeError') {
    return 'A network request failed. Check your internet connection. If the problem persists, the remote service may be down.';
  }

  // ── Web Crypto / DOMException ──────────────────────────────────────────────
  if (err?.name === 'NotSupportedError') {
    return 'Your browser does not support the required cryptographic operation. Try an up-to-date version of Chrome or Firefox.';
  }
  if (err?.name === 'InvalidAccessError' || err?.name === 'DataError') {
    return 'The cryptographic key or data is invalid. This is likely a bug — please report it.';
  }
  if (err?.name === 'OperationError') {
    return 'The browser crypto operation failed. The ciphertext or IV may be malformed.';
  }

  // ── MetaMask install check (thrown explicitly above) ──────────────────────
  if (msg.includes('install metamask') || msg.includes('no ethereum wallet')) {
    return 'MetaMask is not installed. Install the MetaMask browser extension and refresh the page.';
  }

  // ── Invalid user inputs ────────────────────────────────────────────────────
  if (msg.includes('invalid heartbeat window')) {
    return 'The heartbeat window must be a positive integer (number of blocks). Enter a valid value and try again.';
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return err?.message ?? String(err);
}
