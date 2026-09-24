// Monta a raiz de dist/ com a landing page (landing/). O jogo fica em dist/jogar/.
// Apaga antes tudo que não for o jogo, para não sobrar arquivo antigo na raiz
// (um sw.js perdido na raiz controlaria o domínio inteiro).
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';

if (!existsSync('dist/jogar/index.html')) throw new Error('Rode o build do jogo antes (vite build).');
for (const name of readdirSync('dist')) if (name !== 'jogar') rmSync(`dist/${name}`, { recursive: true, force: true });
cpSync('landing', 'dist', { recursive: true });
console.log('landing page copiada para dist/');
