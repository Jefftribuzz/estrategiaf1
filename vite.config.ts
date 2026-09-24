import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // Em desenvolvimento, a API do multiplayer roda em `npm run dev:server`.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
