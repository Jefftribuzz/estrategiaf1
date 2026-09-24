import { createServer } from 'node:http';
import { createApp } from './app';
import { googleVerifier } from './google';
import { FileStore, PgStore, type Store } from './store';

// Servidor do Grande Prêmio 8-Bit: API do multiplayer + o jogo compilado.
//   PORT               porta HTTP (padrão 8787)
//   DATABASE_URL       Postgres (Supabase, Neon, Render...). Sem ela, usa arquivos.
//   DATA_DIR           pasta dos arquivos quando não há banco (padrão ./data)
//   STATIC_DIR         pasta do jogo compilado (padrão ./dist)
//   GOOGLE_CLIENT_ID   ativa o login com Google (opcional)
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
//                      chaves das notificações (opcional: sem elas, o servidor
//                      gera um par e guarda no banco)
//   TRUST_PROXY=1      atrás de proxy (Render): IP real via X-Forwarded-For

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
const googleClientId = process.env.GOOGLE_CLIENT_ID || undefined;
const app = createApp({
  store,
  staticDir: process.env.STATIC_DIR ?? './dist',
  googleClientId,
  googleVerify: googleClientId ? googleVerifier(googleClientId) : undefined,
  trustProxy: process.env.TRUST_PROXY === '1',
});
const server = createServer(app);
server.listen(port, () => console.log(`Grande Prêmio 8-Bit no ar: http://localhost:${port}`));

// Relógio: a cada minuto roda sessões vencidas e manda lembretes/resultados.
setInterval(() => void app.tick().catch((e) => console.error('tick', e)), 60_000);
