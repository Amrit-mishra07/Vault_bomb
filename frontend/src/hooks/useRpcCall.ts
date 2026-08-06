import { useRef, useCallback } from 'react';
import { useGlobalRateLimit } from '../contexts/GlobalRateLimitContext';
import { withRetry } from '../utils/rpc';

export function useRpcCall() {
  const { acquireRateLimit, reportError, isRateLimited } = useGlobalRateLimit();
  
  // Keep a stable ref so async callbacks always call the latest acquireRateLimit
  const acquireRef = useRef(acquireRateLimit);
  acquireRef.current = acquireRateLimit;
  
  const reportRef = useRef(reportError);
  reportRef.current = reportError;

  /**
   * Wraps an async RPC call with both global rate-limiting and
   * exponential-backoff retry logic, in that order.
   *
   * Rate limit is acquired first, then the call is attempted with retries.
   * 429 errors are forwarded to reportError() to trigger the global cooldown.
   */
  const rpcCall = useCallback(async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquireRef.current();
    return withRetry(fn, (err) => reportRef.current(err));
  }, []);

  return { rpcCall, isRateLimited };
}
