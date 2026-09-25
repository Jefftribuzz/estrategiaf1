// Envio de e-mails (recuperação de senha e confirmação de cadastro).
// Em produção usa a API do Resend (RESEND_API_KEY). Sem chave, em
// desenvolvimento só mostra o e-mail no console; em produção avisa no log.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

export function resendMailer(apiKey: string, from: string): Mailer {
  return async (mail) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}

export function consoleMailer(): Mailer {
  return async (mail) => console.log(`[e-mail] para ${mail.to}: ${mail.subject}\n${mail.text}`);
}

export function disabledMailer(): Mailer {
  let warned = false;
  return async () => {
    if (!warned) console.warn('E-mail desativado: configure RESEND_API_KEY e EMAIL_FROM para enviar recuperação de senha e confirmação.');
    warned = true;
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** E-mail simples com um botão; o link também vai em texto puro. */
export function linkMail(to: string, subject: string, intro: string, button: string, url: string, outro: string): Mail {
  const text = `${intro}\n\n${url}\n\n${outro}\n\nEstratégia F1 — Grande Prêmio 8-Bit`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
<h2 style="color:#e43b44">Estratégia F1</h2>
<p>${esc(intro)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#e43b44;color:#fff;padding:12px 20px;text-decoration:none;border-radius:4px;font-weight:bold">${esc(button)}</a></p>
<p style="font-size:13px;color:#555">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(url)}</p>
<p style="font-size:13px;color:#555">${esc(outro)}</p>
</div>`;
  return { to, subject, text, html };
}
