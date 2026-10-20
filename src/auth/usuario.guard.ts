import {
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

/** Guard global: todo endpoint pide `Authorization: Bearer <token>` salvo los @Public(). */
@Injectable()
export class UsuarioGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: Tokens,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
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
    const usuarioId = this.tokens.validar(token);
    if (!usuarioId) throw new UnauthorizedException();
    req.usuarioId = usuarioId;
    return true;
  }
}

/** El id del usuario logueado (lo pone UsuarioGuard). */
export const UsuarioId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    return ctx.switchToHttp().getRequest<ConUsuario>().usuarioId!;
  },
);
