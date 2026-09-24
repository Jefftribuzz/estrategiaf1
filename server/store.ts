import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Armazenamento chave → documento JSON. */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  put<T>(key: string, value: T): Promise<void>;
  close?(): Promise<void>;
}

/** Arquivos JSON numa pasta: para rodar localmente ou num servidor com disco. */
export class FileStore implements Store {
  constructor(private dir: string) {}

  private file(key: string): string {
    return join(this.dir, `${encodeURIComponent(key)}.json`);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.file(key), 'utf8')) as T;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  }

  async put<T>(key: string, value: T): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file(key)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value));
    await rename(tmp, this.file(key));
  }
}

/** Interface mínima de um cliente Postgres (compatível com `pg.Pool`). */
export interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end?(): Promise<void>;
}

/** Postgres (ex.: Supabase, Neon, Render): uma tabela chave/valor em JSONB. */
export class PgStore implements Store {
  private ready: Promise<void>;

  constructor(private db: PgLike) {
    this.ready = db
      .query('CREATE TABLE IF NOT EXISTS gp8_kv (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())')
      .then(() => undefined);
  }

  async get<T>(key: string): Promise<T | null> {
    await this.ready;
    const r = await this.db.query('SELECT value FROM gp8_kv WHERE key = $1', [key]);
    if (!r.rows.length) return null;
    const v = r.rows[0].value;
    return (typeof v === 'string' ? JSON.parse(v) : v) as T;
  }

  async put<T>(key: string, value: T): Promise<void> {
    await this.ready;
    await this.db.query(
      'INSERT INTO gp8_kv (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()',
      [key, JSON.stringify(value)],
    );
  }

  async close() {
    await this.db.end?.();
  }
}

/** Fila por chave: evita duas requisições alterando a mesma liga ao mesmo tempo. */
export class KeyedMutex {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => undefined);
    this.tails.set(key, tail);
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return next;
  }
}
