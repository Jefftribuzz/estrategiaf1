import { createServer } from 'node:http';
import { createApp } from './app';
import { FileStore, PgStore, type Store } from './store';

// Servidor do Grande Prêmio 8-Bit: API do multiplayer + o jogo compilado.
//   PORT          porta HTTP (padrão 8787)
//   DATABASE_URL  Postgres (Supabase, Neon, Render...). Sem ela, usa arquivos.
//   DATA_DIR      pasta dos arquivos quando não há banco (padrão ./data)
//   STATIC_DIR    pasta do jogo compilado (padrão ./dist)

async function makeStore(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({ connectionString: url, ssl: url.includes('localhost') ? undefined : { rejectUnauthorized: false }, max: 5 });
    console.log('Armazenamento: Postgres');
    return new PgStore(pool);
  }
  const dir = process.env.DATA_DIR ?? './data';
  console.log(`Armazenamento: arquivos em ${dir}`);
  return new FileStore(dir);
}

const port = Number(process.env.PORT ?? 8787);
const store = await makeStore();
const server = createServer(createApp({ store, staticDir: process.env.STATIC_DIR ?? './dist' }));
server.listen(port, () => console.log(`Grande Prêmio 8-Bit no ar: http://localhost:${port}`));
