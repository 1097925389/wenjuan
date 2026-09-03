export type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type WindowEntry = { count: number; resetAt: number };

export class FixedWindowLimiter {
  private readonly entries = new Map<string, WindowEntry>();
  private operations = 0;

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
    private readonly maxEntries = 10_000,
  ) {}

  consume(key: string, now = Date.now()): LimitResult {
    this.cleanup(now);
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.makeRoom();
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true };
    }
    if (entry.count >= this.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
    }
    entry.count += 1;
    return { allowed: true };
  }

  private cleanup(now: number): void {
    this.operations += 1;
    if (this.operations % 100 !== 0) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  private makeRoom(): void {
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}

type FailureEntry = { count: number; windowEndsAt: number; lockedUntil: number };

export class LoginFailureLimiter {
  private readonly entries = new Map<string, FailureEntry>();
  private operations = 0;

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60_000,
    private readonly lockMs = 30 * 60_000,
    private readonly maxEntries = 10_000,
  ) {}

  check(key: string, now = Date.now()): LimitResult {
    this.cleanup(now);
    const entry = this.entries.get(key);
    if (!entry) return { allowed: true };
    if (entry.lockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (entry.windowEndsAt <= now) this.entries.delete(key);
    return { allowed: true };
  }

  fail(key: string, now = Date.now()): void {
    this.cleanup(now);
    const existing = this.entries.get(key);
    const entry = !existing || existing.windowEndsAt <= now
      ? { count: 0, windowEndsAt: now + this.windowMs, lockedUntil: 0 }
      : existing;
    entry.count += 1;
    if (entry.count >= this.maxFailures) entry.lockedUntil = now + this.lockMs;
    this.makeRoom();
    this.entries.set(key, entry);
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private cleanup(now: number): void {
    this.operations += 1;
    if (this.operations % 100 !== 0) return;
    for (const [key, entry] of this.entries) {
      if (entry.windowEndsAt <= now && entry.lockedUntil <= now) this.entries.delete(key);
    }
  }

  private makeRoom(): void {
    while (this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.entries.delete(oldestKey);
    }
  }
}
