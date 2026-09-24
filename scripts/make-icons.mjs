// Gera os ícones do app (PNG) em pixel art: capacete amarelo com listras
// verde e azul sobre fundo quadriculado. Sem dependências: PNG feito à mão.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const G = [
  '................',
  '.....KKKKKK.....',
  '...KKYYYYYYKK...',
  '..KYYWYYYYYYYK..',
  '.KYYWYYYYYYYYYK.',
  '.KYYYYYYYYYYYYK.',
  'KYYYYYYYYYYYYYYK',
  'KGGGGGGGGGGGGGGK',
  'KYYYYYVVVVVVVVVK',
  'KYYYYYVVVVVVVVVK',
  'KYYYYYVVVVVVVVVK',
  'KBBBBBBBBBBBBBBK',
  '.KYYYYYYYYYYYYK.',
  '..KYYYYYYYYYYK..',
  '...KKKKKKKKKK...',
  '................',
];
const COLORS = { K: [0, 0, 0], Y: [255, 215, 0], W: [255, 255, 200], G: [0, 155, 58], B: [27, 58, 140], V: [34, 34, 34] };

function png(size) {
  const pad = Math.round(size * 0.12); // área segura para ícones "maskable"
  const inner = size - pad * 2;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const check = (Math.floor(x / (size / 8)) + Math.floor(y / (size / 8))) % 2 === 0;
      let c = check ? [15, 16, 32] : [27, 29, 58];
      const gx = Math.floor(((x - pad) / inner) * 16);
      const gy = Math.floor(((y - pad) / inner) * 16);
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
        const ch = G[gy][gx];
        if (ch !== '.') c = COLORS[ch];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = 255;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, png(size));
writeFileSync('public/apple-touch-icon.png', png(180));
console.log('ícones gerados em public/');
