export class TtlCache<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly defaultTtlMs = 30_000) {}

  get(key: string): T | null {
    const entry = this.values.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.values.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.defaultTtlMs): T {
    this.values.set(key, { value, expiresAt: Date.now() + ttlMs });
    return value;
  }

  delete(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}
