import {
  Inject,
  Optional,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Tokens } from './tokens';
import { ES_PUBLICO } from './public.decorator';

interface ConUsuario {
  headers: Record<string, unknown>;
  usuarioId?: string;
}

/** Dice si los tokens de un usuario emitidos en `emitido` (ms) siguen valiendo. */
export const SESIONES = Symbol('SESIONES');
export interface Sesiones {
  vigente(usuarioId: string, emitido: number): Promise<boolean>;
}

/** Guard global: todo endpoint pide `Authorization: Bearer <token>` salvo los @Public(). */
@Injectable()
export class UsuarioGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: Tokens,
    @Optional() @Inject(SESIONES) private readonly sesiones?: Sesiones,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      return true;
    const req = ctx.switchToHttp().getRequest<ConUsuario>();
    const auth = req.headers['authorization'];
    const token =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? auth.slice(7)
        : null;
    const leido = this.tokens.leer(token);
    if (
      !leido ||
      (this.sesiones &&
        !(await this.sesiones.vigente(leido.usuarioId, leido.emitido)))
    )
      throw new UnauthorizedException();
    req.usuarioId = leido.usuarioId;
    return true;
  }
}

/** El id del usuario logueado (lo pone UsuarioGuard). */
export const UsuarioId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<ConUsuario>().usuarioId!;
  },
);
