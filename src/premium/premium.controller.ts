import { Body, Controller, Get, HttpCode, Post, Query, Req, BadRequestException } from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { UsuarioId } from '../auth/usuario.guard';
import { ipDe, Limitador } from '../auth/limite';
import * as v from '../datos/validar';
import { FUNCIONES, Funcion, PremiumService } from './premium.service';
import { MensajeChat } from './asistente';

type ReqHttp = { headers: Record<string, unknown>; ip?: string };

@Controller()
export class PremiumController {
  constructor(private readonly s: PremiumService) {}

  private readonly limite = new Limitador();

  @Public()
  @Get('premium/config')
  config() {
    return this.s.config();
  }

  @Get('premium')
  estado(@UsuarioId() u: string) {
    return this.s.estado(u);
  }

  @Post('premium/usar')
  @HttpCode(200)
  usar(@UsuarioId() u: string, @Body() body: unknown) {
    const f = v.objeto(body).funcion;
    if (!FUNCIONES.includes(f as Funcion))
      throw new BadRequestException(`funcion: ${FUNCIONES.join(', ')}`);
    return this.s.usar(u, f as Funcion);
  }

  @Post('asistente')
  @HttpCode(200)
  asistente(@UsuarioId() u: string, @Body() body: unknown) {
    this.limite.usar(`asistente:${u}`, 20, 60 * 1000);
    const m = v.objeto(body).mensajes;
    if (!Array.isArray(m) || m.length === 0 || m.length > 40)
      throw new BadRequestException('mensajes: lista de 1 a 40');
    const chat: MensajeChat[] = m.map((x) => {
      const o = v.objeto(x);
      if (typeof o.texto !== 'string' || (o.rol !== 'usuario' && o.rol !== 'mona'))
        throw new BadRequestException('cada mensaje: {rol: usuario|mona, texto}');
      return { rol: o.rol, texto: o.texto.slice(0, 1000) };
    });
    return this.s.asistente(u, chat);
  }

  @Post('premium/suscribir')
  @HttpCode(200)
  suscribir(@UsuarioId() u: string) {
    this.limite.usar(`suscribir:${u}`, 5, 60 * 60 * 1000);
    return this.s.suscribir(u);
  }

  @Post('premium/sincronizar')
  @HttpCode(200)
  sincronizar(@UsuarioId() u: string) {
    return this.s.sincronizar(u);
  }

  @Post('premium/cancelar')
  @HttpCode(200)
  cancelar(@UsuarioId() u: string) {
    return this.s.cancelar(u);
  }

  /** Webhook de Mercado Pago. Responde 200 siempre: lo que importa se relee en la API de MP. */
  @Public()
  @Post('pagos/mercadopago')
  @HttpCode(200)
  async webhook(@Body() body: unknown, @Query() q: Record<string, string>, @Req() req: ReqHttp) {
    this.limite.usar(`webhook:${ipDe(req)}`, 120, 60 * 1000);
    const b = (body && typeof body === 'object' ? body : {}) as {
      type?: string;
      data?: { id?: string | number };
    };
    const tipo = String(b.type ?? q.type ?? q.topic ?? '');
    const id = String(b.data?.id ?? q['data.id'] ?? q.id ?? '');
    if (/^[\w-]{1,64}$/.test(id)) await this.s.notificacion(tipo, id);
    return { ok: true };
  }
}
