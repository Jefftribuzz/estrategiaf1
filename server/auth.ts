import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Senhas, validação de cadastro e perfil. A senha nunca é guardada: só o hash
// scrypt com um sal aleatório por usuário.

const KEYLEN = 64;
const PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(password.normalize('NFKC'), salt, KEYLEN, PARAMS, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Formato: scrypt$<sal base64url>$<hash base64url>. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  // Sem hash guardado, ainda calcula um scrypt: mesmo tempo de resposta, sem
  // revelar se o e-mail existe.
  const [kind, saltB64, keyB64] = (stored ?? 'scrypt$AAAAAAAAAAAAAAAAAAAAAA$').split('$');
  if (kind !== 'scrypt') return false;
  const key = await scrypt(password, Buffer.from(saltB64, 'base64url'));
  const expected = Buffer.from(keyB64 ?? '', 'base64url');
  return !!stored && expected.length === key.length && timingSafeEqual(expected, key);
}

export class ValidationError extends Error {}

export function normalizeEmail(v: unknown): string {
  const email = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new ValidationError('Informe um e-mail válido.');
  return email;
}

export function validatePassword(v: unknown): string {
  const p = typeof v === 'string' ? v : '';
  if (p.length < 8) throw new ValidationError('A senha precisa ter pelo menos 8 caracteres.');
  if (p.length > 200) throw new ValidationError('Senha longa demais.');
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) throw new ValidationError('Use letras e números na senha.');
  return p;
}

/** Texto curto de perfil (nome, sobrenome, apelido). */
export function cleanText(v: unknown, max: number, what: string, required = true): string {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
  if (required && !s) throw new ValidationError(`Informe ${what}.`);
  return s;
}

/** Avatar: capacete em pixel art com 3 cores (base, listra 1, listra 2). */
export interface Avatar {
  base: string;
  stripe1: string;
  stripe2: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function validateAvatar(v: unknown): Avatar {
  const a = v as Avatar;
  if (!a || !HEX.test(a.base) || !HEX.test(a.stripe1) || !HEX.test(a.stripe2)) throw new ValidationError('Avatar inválido.');
  return { base: a.base.toLowerCase(), stripe1: a.stripe1.toLowerCase(), stripe2: a.stripe2.toLowerCase() };
}

/** Preferências salvas no perfil (valem em qualquer aparelho). */
export interface Prefs {
  sound: boolean;
  crt: boolean;
  notify: { session: boolean; reminder: boolean; results: boolean };
}

export const DEFAULT_PREFS: Prefs = { sound: true, crt: false, notify: { session: true, reminder: true, results: true } };

export function validatePrefs(v: unknown): Prefs {
  const p = (v ?? {}) as Partial<Prefs>;
  const n = (p.notify ?? {}) as Partial<Prefs['notify']>;
  const b = (x: unknown, d: boolean) => (typeof x === 'boolean' ? x : d);
  return {
    sound: b(p.sound, DEFAULT_PREFS.sound),
    crt: b(p.crt, DEFAULT_PREFS.crt),
    notify: {
      session: b(n.session, true),
      reminder: b(n.reminder, true),
      results: b(n.results, true),
    },
  };
}
