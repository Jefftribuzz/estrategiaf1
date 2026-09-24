import webpush from 'web-push';
import type { Store } from './store';

// Notificações push (Web Push com chaves VAPID). Se as chaves não vierem do
// ambiente, o servidor gera um par na primeira vez e guarda no banco.

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Envia uma notificação; em erro, lança com `statusCode` (404/410 = inscrição morta). */
export type PushSender = (sub: PushSubscriptionJSON, payload: PushPayload) => Promise<void>;

export interface Vapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export async function loadVapid(store: Store): Promise<Vapid> {
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject };
  }
  const saved = await store.get<Vapid>('config:vapid');
  if (saved) return saved;
  const keys = webpush.generateVAPIDKeys();
  const vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject };
  await store.put('config:vapid', vapid);
  return vapid;
}

export function webPushSender(vapid: Vapid): PushSender {
  return async (sub, payload) => {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      vapidDetails: vapid,
      TTL: 6 * 3600,
    });
  };
}

export function isSubscription(x: unknown): x is PushSubscriptionJSON {
  const s = x as PushSubscriptionJSON;
  return (
    !!s &&
    typeof s.endpoint === 'string' &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 1024 &&
    typeof s.keys?.p256dh === 'string' &&
    typeof s.keys?.auth === 'string' &&
    s.keys.p256dh.length < 256 &&
    s.keys.auth.length < 64
  );
}
