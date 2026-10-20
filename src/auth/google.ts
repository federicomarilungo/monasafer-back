import { OAuth2Client } from 'google-auth-library';

/**
 * Client ID de "Acceder con Google" (Google Identity Services). No es secreto: va en el
 * HTML de cualquier sitio que use el botón. Se puede pisar con GOOGLE_CLIENT_ID.
 * Vacío = el botón no aparece y POST /auth/google responde 503.
 */
const CLIENT_ID_PROD = '';

export function googleClientId(): string {
  return (process.env.GOOGLE_CLIENT_ID ?? CLIENT_ID_PROD).trim();
}

export interface CuentaGoogle {
  sub: string;
  email: string;
  nombre: string;
}

/** Verifica el ID token que devuelve el botón y saca lo que usamos. Sin terceros: valida con las claves públicas de Google. */
export class VerificadorGoogle {
  private readonly cliente = new OAuth2Client();

  async verificar(credencial: string, clientId: string): Promise<CuentaGoogle | null> {
    try {
      const ticket = await this.cliente.verifyIdToken({
        idToken: credencial,
        audience: clientId,
      });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || p.email_verified !== true) return null;
      return {
        sub: p.sub,
        email: p.email.toLowerCase(),
        nombre: (p.given_name ?? p.name ?? '').slice(0, 60),
      };
    } catch {
      return null;
    }
  }
}
