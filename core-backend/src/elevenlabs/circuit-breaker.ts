/**
 * Manual circuit breaker implementation — NFR-6.3.1.
 * States: closed → open (5 failures) → half-open (probe after 60s) → closed/open.
 */

export class CircuitOpenError extends Error {
  constructor(queue: string) {
    super(`Circuit breaker OPEN for ${queue} — try again after cooldown`);
    this.name = "CircuitOpenError";
  }
}

type State = "closed" | "open" | "half-open";

export class CircuitBreaker {
  private state: State = "closed";
  private failureCount = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly name: string,
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 60_000
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (Date.now() - (this.openedAt ?? 0) >= this.cooldownMs) {
        this.state = "half-open";
      } else {
        throw new CircuitOpenError(this.name);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.failureCount = 0;
    this.state = "closed";
    this.openedAt = null;
  }

  private onFailure() {
    this.failureCount++;
    if (this.state === "half-open" || this.failureCount >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  getState(): State {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}
