// Login com Google (opcional): o navegador recebe um ID token do Google
// Identity Services e o servidor confere com o Google antes de aceitar.

export interface GoogleIdentity {
  sub: string;
  email?: string;
  name?: string;
}

export type GoogleVerifier = (credential: string) => Promise<GoogleIdentity>;

type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export function googleVerifier(clientId: string, fetchImpl: FetchLike = fetch, now: () => number = Date.now): GoogleVerifier {
  return async (credential) => {
    if (typeof credential !== 'string' || credential.length > 4096) throw new Error('Credencial inválida.');
    const res = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) throw new Error('O Google recusou o login.');
    const t = (await res.json()) as Record<string, string>;
    const validIssuer = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
    if (t.aud !== clientId || !validIssuer || Number(t.exp) * 1000 < now() || !t.sub) throw new Error('Login do Google inválido.');
    if (t.email && t.email_verified !== 'true') throw new Error('E-mail do Google não verificado.');
    return { sub: t.sub, email: t.email, name: t.name };
  };
}
