const WINDOW_MS = 1000;
const MAX_EVENTS_PER_WINDOW = 10;

interface Window {
  count: number;
  start: number;
}

/**
 * Fixed-window rate limiter: max MAX_EVENTS_PER_WINDOW per WINDOW_MS per key.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  shouldAllow(key: string): boolean {
    const now = Date.now();
    const win = this.windows.get(key);

    if (!win || now - win.start >= WINDOW_MS) {
      this.windows.set(key, { count: 1, start: now });
      return true;
    }

    if (win.count >= MAX_EVENTS_PER_WINDOW) {
      return false;
    }

    win.count += 1;
    return true;
  }
}
