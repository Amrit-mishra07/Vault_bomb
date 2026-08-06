export const RPC_BATCH_SIZE = 5;
export const RPC_BATCH_DELAY_MS = 300;
export const RPC_MAX_RETRIES = 3;
export const RPC_INITIAL_BACKOFF_MS = 1000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps an async RPC call with exponential-backoff retry logic.
 * Retries on HTTP 429 (rate limited) and generic network errors.
 * Re-throws immediately for contract revert errors so callers can
 * inspect the revert reason without waiting for retries.
 * Accepts an optional onError callback to forward errors externally.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  onError?: (err: unknown) => void,
  maxRetries = RPC_MAX_RETRIES,
  initialBackoffMs = RPC_INITIAL_BACKOFF_MS,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      onError?.(err);
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      const isRevert =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.code === 'CALL_EXCEPTION' ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.info?.error?.code === 3;
      if (isRevert) throw err; // surface contract reverts immediately
      const isRetriable =
        message.includes('429') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('network error') ||
        message.includes('failed to fetch');
      if (!isRetriable || attempt === maxRetries) break;
      const backoff = initialBackoffMs * 2 ** attempt;
      console.warn(`[RPC] Attempt ${attempt + 1} failed, retrying in ${backoff}ms…`, message);
      await sleep(backoff);
    }
  }
  throw lastError;
}

/**
 * Executes an array of async tasks in sequential batches of `batchSize`,
 * inserting `delayMs` between each batch to reduce RPC burst traffic.
 */
export async function batchedMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = RPC_BATCH_SIZE,
  delayMs = RPC_BATCH_DELAY_MS,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await sleep(delayMs);
    }
  }
  return results;
}
