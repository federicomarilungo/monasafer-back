import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UsuarioId } from '../auth/usuario.guard';
import { Public } from '../auth/public.decorator';
import { ServiceUnavailableException } from '@nestjs/common';
import { FuenteCotizaciones } from './cotizaciones';
import * as v from '../datos/validar';
import { MONEDAS } from '../datos/esquemas';
import { CajonService } from './cajon.service';

/** Entero de unidades mínimas de un bolsillo (230 USD = 23000; 0,0031 BTC = 310000). */
function cantidad(x: unknown, campo = 'cantidad'): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > 1e15)
    throw new BadRequestException(`${campo} tiene que ser un entero >= 0`);
  return x;
}

/** El total puesto a mano puede ser negativo: plata de otro que tenés guardada y resta. */
function total(x: unknown): number {
  if (typeof x !== 'number' || !Number.isInteger(x) || Math.abs(x) > 1e15)
    throw new BadRequestException('cantidad tiene que ser un entero');
  return x;
}

/** `{moneda, valor}`: cuánto vale 1 unidad del bolsillo, en centavos de esa moneda. */
function cotizacion(x: unknown): { moneda: string; valor: number } | null {
  if (x === null) return null;
  const c = v.objeto(x);
  if (!MONEDAS.includes(c.moneda as string))
    throw new BadRequestException(`cotizacion.moneda: ${MONEDAS.join(', ')}`);
  return {
    moneda: c.moneda as string,
    valor: v.monto(c.valor, 'cotizacion.valor'),
  };
}

function origen(x: unknown): 'mes' | 'acumulado' {
  if (x !== 'mes' && x !== 'acumulado')
    throw new BadRequestException('origen: mes o acumulado');
  return x;
}

@Controller('cajon')
export class CajonController {
  constructor(
    private readonly s: CajonService,
    private readonly cotizaciones: FuenteCotizaciones,
  ) {}

  /** Público a propósito: son cotizaciones de mercado (las usa también la demo). */
  @Public()
  @Get('cotizaciones')
  async cotizacionesDelDia() {
    const c = await this.cotizaciones.obtener();
    if (!c) throw new ServiceUnavailableException('Sin cotizaciones por ahora');
    return c;
  }

  @Get()
  cajon(@UsuarioId() u: string) {
    return this.s.cajon(u);
  }

  @Post('bolsillos')
  crearBolsillo(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    const decimales = b.decimales === undefined ? 2 : Number(b.decimales);
    if (!Number.isInteger(decimales) || decimales < 0 || decimales > 8)
      throw new BadRequestException('decimales: 0 a 8');
    return this.s.crearBolsillo(u, {
      nombre: v.texto(b.nombre, 'nombre', 40),
      emoji: v.texto(b.emoji, 'emoji', 16, false),
      unidad: v.texto(b.unidad, 'unidad', 10),
      decimales,
      cotizacion: b.cotizacion === undefined ? null : cotizacion(b.cotizacion),
    });
  }

  @Patch('bolsillos/:id')
  editarBolsillo(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    const cambios: {
      nombre?: string;
      emoji?: string;
      unidad?: string;
      decimales?: number;
      cotizacion?: { moneda: string; valor: number } | null;
    } = {};
    if (b.unidad !== undefined)
      cambios.unidad = v.texto(b.unidad, 'unidad', 10);
    if (b.decimales !== undefined) {
      const d = Number(b.decimales);
      if (!Number.isInteger(d) || d < 0 || d > 8)
        throw new BadRequestException('decimales: 0 a 8');
      cambios.decimales = d;
    }
    if (b.cotizacion !== undefined)
      cambios.cotizacion = cotizacion(b.cotizacion);
    if (b.nombre !== undefined)
      cambios.nombre = v.texto(b.nombre, 'nombre', 40);
    if (b.emoji !== undefined)
      cambios.emoji = v.texto(b.emoji, 'emoji', 16, false);
    return this.s.editarBolsillo(u, id, cambios);
  }

  @Delete('bolsillos/:id')
  borrarBolsillo(@UsuarioId() u: string, @Param('id') id: string) {
    return this.s.borrarBolsillo(u, id);
  }

  @Post('ahorrar')
  ahorrar(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    if (
      b.bolsilloId !== undefined &&
      b.bolsilloId !== null &&
      typeof b.bolsilloId !== 'string'
    )
      throw new BadRequestException('bolsilloId inválido');
    return this.s.ahorrar(u, {
      monto: v.monto(b.monto),
      origen: origen(b.origen),
      bolsilloId: (b.bolsilloId as string | undefined) ?? null,
      cantidad: b.cantidad == null ? null : cantidad(b.cantidad),
      detalle: v.texto(b.detalle, 'detalle', 120, false),
    });
  }

  @Post('bolsillos/:id/ajustar')
  ajustar(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    return this.s.ajustar(
      u,
      id,
      total(b.cantidad),
      v.texto(b.detalle, 'detalle', 120, false),
    );
  }

  @Post('bolsillos/:id/retirar')
  retirar(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    return this.s.retirar(
      u,
      id,
      cantidad(b.cantidad),
      v.monto(b.monto),
      v.texto(b.detalle, 'detalle', 120, false),
    );
  }

  @Post('traspasar')
  traspasar(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    return this.s.traspasar(u, {
      desde: v.texto(b.desde, 'desde', 40),
      hacia: v.texto(b.hacia, 'hacia', 40),
      cantidad: cantidad(b.cantidad),
      cantidadEntra:
        b.cantidadEntra == null
          ? null
          : cantidad(b.cantidadEntra, 'cantidadEntra'),
      detalle: v.texto(b.detalle, 'detalle', 120, false),
    });
  }

  @Patch('movimientos/:id')
  editarMovimiento(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    return this.s.editarMovimiento(u, id, {
      cantidad: b.cantidad === undefined ? undefined : cantidad(b.cantidad),
      monto: b.monto === undefined ? undefined : v.monto(b.monto),
      detalle:
        b.detalle === undefined
          ? undefined
          : v.texto(b.detalle, 'detalle', 120, false),
    });
  }

  @Delete('movimientos/:id')
  borrarMovimiento(@UsuarioId() u: string, @Param('id') id: string) {
    return this.s.borrarMovimiento(u, id);
  }
}
