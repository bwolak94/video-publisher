const WINDOW_MS = 1000;
const MAX_EVENTS_PER_WINDOW = 10;

interface Window {
  count: number;
  start: number;
}

/**
 * Fixed-window rate limiter: max MAX_EVENTS_PER_WINDOW per WINDOW_MS per key.
 * Stale entries are pruned every 10 minutes to prevent unbounded Map growth.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  // Prune stale entries every 10 minutes
  private pruneInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now - window.start > WINDOW_MS * 2) {
        this.windows.delete(key);
      }
    }
  }, 10 * 60 * 1000);

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

  onModuleDestroy() {
    clearInterval(this.pruneInterval);
  }
}
