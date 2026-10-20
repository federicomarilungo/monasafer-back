import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Límite de intentos en memoria (una sola instancia en DO). Frena a quien prueba
 * contraseñas o manda emails de recupero en loop. Se pierde al redeployar, y está bien.
 */
export class Limitador {
  private readonly intentos = new Map<string, number[]>();

  /** Tira 429 si `clave` ya hizo `max` intentos en los últimos `ventanaMs`. */
  usar(clave: string, max: number, ventanaMs: number, ahora = Date.now()) {
    const recientes = (this.intentos.get(clave) ?? []).filter(
      (t) => t > ahora - ventanaMs,
    );
    if (recientes.length >= max)
      throw new HttpException(
        'Demasiados intentos. Esperá un rato y probá de nuevo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    recientes.push(ahora);
    if (this.intentos.size > 20000) this.intentos.clear();
    this.intentos.set(clave, recientes);
  }
}

/** IP real: DigitalOcean la manda en `do-connecting-ip`. */
export function ipDe(req: { headers: Record<string, unknown>; ip?: string }) {
  const h = req.headers['do-connecting-ip'];
  return (typeof h === 'string' && h) || req.ip || 'sin-ip';
}
