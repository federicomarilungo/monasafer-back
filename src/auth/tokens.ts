import crypto from 'crypto';

const DURACION_MS = 30 * 24 * 60 * 60 * 1000; // 30 días: la app se usa desde el celular

export function hashClave(
  clave: string,
  salt = crypto.randomBytes(16),
): string {
  const hash = crypto.scryptSync(clave, salt, 32);
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verificarClave(clave: string, guardado: string): boolean {
  const [algo, saltHex, hashHex] = guardado.split(':');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(
    clave,
    Buffer.from(saltHex, 'hex'),
    esperado.length,
  );
  return crypto.timingSafeEqual(actual, esperado);
}

/** JWT HS256 sin dependencias, como en kpi-back. `sub` = id del usuario. */
export class Tokens {
  constructor(private readonly secreto: Buffer) {}

  static desdeEntorno(): Tokens {
    const s = process.env.AUTH_SECRET;
    if (s && s.length >= 32) return new Tokens(Buffer.from(s));
    console.warn(
      'AUTH_SECRET no configurada: se usa una aleatoria y cada redeploy cierra las sesiones.',
    );
    return new Tokens(crypto.randomBytes(32));
  }

  generar(usuarioId: string, ahora = Date.now()): string {
    const b64 = (o: object) =>
      Buffer.from(JSON.stringify(o)).toString('base64url');
    const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
    const cuerpo = b64({
      sub: usuarioId,
      iat: Math.floor(ahora / 1000),
      exp: Math.floor((ahora + DURACION_MS) / 1000),
    });
    return `${cabecera}.${cuerpo}.${this.firmar(`${cabecera}.${cuerpo}`)}`;
  }

  /** Devuelve el id del usuario o null si el token no vale. */
  validar(token: unknown, ahora = Date.now()): string | null {
    return this.leer(token, ahora)?.usuarioId ?? null;
  }

  /** Id del usuario y cuándo se emitió (ms), o null si el token no vale. */
  leer(
    token: unknown,
    ahora = Date.now(),
  ): { usuarioId: string; emitido: number } | null {
    if (typeof token !== 'string') return null;
    const partes = token.split('.');
    if (partes.length !== 3) return null;
    const esperado = Buffer.from(this.firmar(`${partes[0]}.${partes[1]}`));
    const dado = Buffer.from(partes[2]);
    if (
      esperado.length !== dado.length ||
      !crypto.timingSafeEqual(esperado, dado)
    )
      return null;
    try {
      const datos = JSON.parse(
        Buffer.from(partes[1], 'base64url').toString('utf-8'),
      );
      if (
        typeof datos.sub !== 'string' ||
        typeof datos.exp !== 'number' ||
        datos.exp * 1000 <= ahora
      )
        return null;
      return { usuarioId: datos.sub, emitido: (datos.iat ?? 0) * 1000 };
    } catch {
      return null;
    }
  }

  private firmar(datos: string): string {
    return crypto
      .createHmac('sha256', this.secreto)
      .update(datos)
      .digest('base64url');
  }
}
