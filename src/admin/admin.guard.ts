import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

const hash = (s: string) => createHash('sha256').update(s).digest();

/** Pide el header X-Admin-Key igual a ADMIN_API_KEY. Sin la variable, el endpoint no existe. */
@Injectable()
export class AdminKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const esperada = process.env.ADMIN_API_KEY;
    if (!esperada || esperada.length < 24)
      throw new ServiceUnavailableException('ADMIN_API_KEY no configurada');
    const recibida = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>().headers[
      'x-admin-key'
    ];
    if (
      typeof recibida !== 'string' ||
      !timingSafeEqual(hash(recibida), hash(esperada))
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
