import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, firstValueFrom, from } from 'rxjs';

/**
 * Tocar "Guardar" varias veces mientras la primera vuelta todavía no terminó creaba 3 gastos,
 * 3 bolsillos, etc. (Fede, 2/11). El front ya bloquea el botón, pero por si queda una versión
 * vieja en caché o el toque se cuela: si llega un pedido que cambia algo (POST, PUT, PATCH,
 * DELETE) idéntico a otro del mismo usuario que todavía se está procesando, no se vuelve a
 * hacer: recibe la misma respuesta que el primero.
 *
 * Solo mientras el primero está en curso: apenas termina, el mismo pedido vale de nuevo
 * (pagar, despagar y volver a pagar; mirar métricas dos veces).
 */
@Injectable()
export class SinDuplicadosInterceptor implements NestInterceptor {
  private readonly enCurso = new Map<string, Promise<unknown>>();

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<{ method: string; originalUrl?: string; url: string; body?: unknown; usuarioId?: string }>();
    if (!req.usuarioId || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next.handle();
    const clave = `${req.usuarioId} ${req.method} ${req.originalUrl ?? req.url} ${JSON.stringify(req.body ?? null)}`;
    const previo = this.enCurso.get(clave);
    if (previo) return from(previo);
    const p = firstValueFrom(next.handle(), { defaultValue: undefined });
    this.enCurso.set(clave, p);
    const soltar = () => {
      if (this.enCurso.get(clave) === p) this.enCurso.delete(clave);
    };
    p.then(soltar, soltar);
    return from(p);
  }
}
