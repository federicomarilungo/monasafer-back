/**
 * Envío de emails con Resend (API HTTP, sin librería). Sin RESEND_API_KEY no manda nada
 * y lo deja anotado en el log (sin el link, que da acceso a la cuenta).
 */
export class Correo {
  async enviar(para: string, asunto: string, html: string): Promise<boolean> {
    const clave = process.env.RESEND_API_KEY;
    if (!clave) {
      console.warn(`[correo] sin RESEND_API_KEY: no se mandó "${asunto}"`);
      return false;
    }
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clave}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:
            process.env.CORREO_DESDE ?? 'Monasafer <no-responder@monasafer.com>',
          to: [para],
          subject: asunto,
          html,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok)
        console.error(`[correo] Resend respondió ${r.status}: ${await r.text()}`);
      return r.ok;
    } catch (e) {
      console.error('[correo] no se pudo mandar', e);
      return false;
    }
  }
}

export const urlApp = () =>
  (process.env.APP_URL ?? 'https://monasafer.com').replace(/\/$/, '');

export function emailRecupero(link: string, nombre: string) {
  const hola = nombre ? `Hola, ${nombre}` : 'Hola';
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;color:#2b2118">
<p style="font-size:40px;margin:0">🐒</p>
<h2>${hola}</h2>
<p>Pediste cambiar la contraseña de Monasafer. Tocá el botón para elegir una nueva. El link vale una hora y sirve una sola vez.</p>
<p><a href="${link}" style="display:inline-block;background:#2f9e6b;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Elegir contraseña nueva</a></p>
<p style="color:#8a7a66;font-size:13px">Si no fuiste vos, ignorá este email: tu contraseña sigue igual.</p>
</div>`;
}
