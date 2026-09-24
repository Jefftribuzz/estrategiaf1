/** Limite de requisições por chave (ex.: IP) numa janela de tempo fixa. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();

  constructor(private now: () => number = Date.now) {}

  /** Retorna false se a chave estourou o limite nesta janela. */
  take(key: string, limit: number, windowMs: number): boolean {
    const t = this.now();
    if (this.hits.size > 20_000) {
      for (const [k, v] of this.hits) if (v.reset <= t) this.hits.delete(k);
    }
    const h = this.hits.get(key);
    if (!h || h.reset <= t) {
      this.hits.set(key, { count: 1, reset: t + windowMs });
      return true;
    }
    h.count++;
    return h.count <= limit;
  }
}
