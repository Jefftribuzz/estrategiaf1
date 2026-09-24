import { defineConfig } from 'vite';

// O jogo é publicado em /jogar/ (a raiz do domínio é a landing page, em landing/).
export default defineConfig({
  base: './',
  build: { outDir: 'dist/jogar', emptyOutDir: true },
  server: {
    // Em desenvolvimento, a API do multiplayer roda em `npm run dev:server`.
    proxy: { '/api': 'http://localhost:8787' },
  },
});
