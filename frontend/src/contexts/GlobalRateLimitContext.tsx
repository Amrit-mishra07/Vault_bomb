import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';

const MAX_REQUESTS = 5;
const WINDOW_MS = 60_000;

type GlobalRateLimitContextValue = {
  /**
   * Resolves immediately if a request slot is available within the current
   * 60-second window. If the budget is exhausted, the promise resolves only
   * after enough time has elapsed for a slot to open up.
   *
   * Call this at the start of every RPC or Lit Simulator interaction.
   */
  acquireRateLimit: () => Promise<void>;
  /**
   * Call this in every catch block. If the caught error indicates a 429 /
   * rate-limit response, it immediately fills the remaining request slots so
   * all subsequent callers are queued for a full 60-second cooldown.
   */
  reportError: (err: unknown) => void;
  /**
   * True while callers are actively queued behind a full rate-limit window.
   * Drives UI loading indicators that say "Hit Rate Limit…".
   */
  isRateLimited: boolean;
};

const GlobalRateLimitContext = createContext<GlobalRateLimitContextValue | null>(null);

/**
 * Returns the global rate-limit helpers. Must be called inside
 * `<GlobalRateLimitProvider>`.
 */
export function useGlobalRateLimit(): GlobalRateLimitContextValue {
  const ctx = useContext(GlobalRateLimitContext);
  if (!ctx) throw new Error('useGlobalRateLimit must be used inside GlobalRateLimitProvider');
  return ctx;
}

/** Wrap the whole application in this provider once, at the root level. */
export function GlobalRateLimitProvider({ children }: { children: ReactNode }) {
  // Timestamps (ms) of the last MAX_REQUESTS requests within the window.
  const timestamps = useRef<number[]>([]);
  const [isRateLimited, setIsRateLimited] = useState(false);

  const acquireRateLimit = useCallback(async (): Promise<void> => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      // Prune timestamps older than the window
      timestamps.current = timestamps.current.filter(t => now - t < WINDOW_MS);

      if (timestamps.current.length < MAX_REQUESTS) {
        // Slot available — record this request and proceed
        timestamps.current.push(now);
        setIsRateLimited(false);
        return;
      }

      // No slot available — compute how long until the oldest request ages out
      const oldestTs = timestamps.current[0];
      const waitMs = WINDOW_MS - (now - oldestTs) + 10; // +10ms safety margin

      setIsRateLimited(true);
      console.warn(`[RateLimit] Budget exhausted. Waiting ${waitMs}ms for next slot.`);
      await new Promise<void>(resolve => setTimeout(resolve, waitMs));
    }
  }, []);

  const reportError = useCallback((err: unknown): void => {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    const is429 =
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('too many requests');

    if (!is429) return;

    // Fill the remaining slots in the window so all queued callers wait 60s
    const now = Date.now();
    timestamps.current = timestamps.current.filter(t => now - t < WINDOW_MS);
    while (timestamps.current.length < MAX_REQUESTS) {
      timestamps.current.push(now);
    }
    setIsRateLimited(true);
    console.warn('[RateLimit] 429 received — forcing 60s cooldown for all pending requests.');
  }, []);

  return (
    <GlobalRateLimitContext.Provider value={{ acquireRateLimit, reportError, isRateLimited }}>
      {children}
    </GlobalRateLimitContext.Provider>
  );
}
