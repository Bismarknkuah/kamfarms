/** A small in-memory cache: a value is kept for a few seconds, and everyone asking for the same thing at once shares ONE load. A failed load is never kept. */
export class TtlCache<V> {
  private readonly values = new Map<string, { at: number; value: V }>();
  private readonly pending = new Map<string, { at: number; p: Promise<V> }>();
  constructor(private readonly ttlMs: number, private readonly max = 200, private readonly now: () => number = Date.now) {}

  peek(key: string): V | undefined {
    const hit = this.values.get(key);
    return hit && this.now() - hit.at < this.ttlMs ? hit.value : undefined;
  }
  set(key: string, value: V): void {
    this.values.delete(key);
    if (this.values.size >= this.max) { const oldest = this.values.keys().next().value; if (oldest !== undefined) this.values.delete(oldest); }
    this.values.set(key, { at: this.now(), value });
  }
  async get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.peek(key); if (hit !== undefined) return hit;
    const running = this.pending.get(key); if (running && this.now() - running.at < this.ttlMs) return running.p;   // a load that has run longer than the cache lives is given up on
    const p: Promise<V> = load().then((v) => { this.set(key, v); return v; }).finally(() => { if (this.pending.get(key)?.p === p) this.pending.delete(key); });
    this.pending.set(key, { at: this.now(), p });
    return p;
  }
  clear(): void { this.values.clear(); this.pending.clear(); }
}
