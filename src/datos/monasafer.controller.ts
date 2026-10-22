import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator';
import { UsuarioId } from '../auth/usuario.guard';
import { googleClientId } from '../auth/google';
import { ipDe, Limitador } from '../auth/limite';
import { Req } from '@nestjs/common';

type ReqHttp = { headers: Record<string, unknown>; ip?: string };
const MIN = 60 * 1000;
import { MonasaferService } from './monasafer.service';
import { PremiumService } from '../premium/premium.service';
import { CajonService } from '../cajon/cajon.service';
import { mesDe } from '../motor';
import * as v from './validar';
import { IDIOMAS, MONEDAS } from './esquemas';
import { BadRequestException } from '@nestjs/common';

@Controller()
export class MonasaferController {
  constructor(
    private readonly s: MonasaferService,
    private readonly premium: PremiumService,
    private readonly cajon: CajonService,
  ) {}

  private readonly limite = new Limitador();

  @Public()
  @Post('auth/registro')
  registro(@Body() body: unknown, @Req() req: ReqHttp) {
    this.limite.usar(`registro:${ipDe(req)}`, 10, 60 * MIN);
    const b = v.objeto(body);
    return this.s.registrar(
      v.email(b.email),
      v.clave(b.clave),
      v.texto(b.nombre, 'nombre', 60, false),
      b.idioma === 'en' ? 'en' : 'es',
    );
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() req: ReqHttp) {
    const b = v.objeto(body);
    const email = v.email(b.email);
    this.limite.usar(`login:${ipDe(req)}`, 30, 15 * MIN);
    this.limite.usar(`login:${email}`, 10, 15 * MIN);
    return this.s.login(
      email,
      typeof b.clave === 'string' ? b.clave : '',
    );
  }

  @Public()
  @Post('auth/google')
  @HttpCode(200)
  loginGoogle(@Body() body: unknown, @Req() req: ReqHttp) {
    this.limite.usar(`google:${ipDe(req)}`, 30, 15 * MIN);
    const b = v.objeto(body);
    if (typeof b.credencial !== 'string' || b.credencial.length > 5000)
      throw new BadRequestException('credencial inválida');
    return this.s.loginGoogle(b.credencial);
  }

  @Public()
  @Post('auth/olvide')
  @HttpCode(200)
  olvide(@Body() body: unknown, @Req() req: ReqHttp) {
    const email = v.email(v.objeto(body).email);
    this.limite.usar(`olvide:${ipDe(req)}`, 10, 60 * MIN);
    this.limite.usar(`olvide:${email}`, 3, 60 * MIN);
    return this.s.olvideClave(email);
  }

  @Public()
  @Post('auth/recuperar')
  @HttpCode(200)
  recuperar(@Body() body: unknown, @Req() req: ReqHttp) {
    this.limite.usar(`recuperar:${ipDe(req)}`, 20, 15 * MIN);
    const b = v.objeto(body);
    if (typeof b.codigo !== 'string' || b.codigo.length > 100)
      throw new BadRequestException('El link no es válido');
    return this.s.recuperarClave(b.codigo, v.clave(b.clave));
  }

  @Delete('perfil')
  async borrarCuenta(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    const confirmacion =
      typeof b.confirmacion === 'string' ? b.confirmacion : '';
    const perfil = await this.s.perfil(u);
    if (confirmacion.trim().toLowerCase() !== perfil.email)
      throw new BadRequestException('Escribí tu email para confirmar');
    await this.premium.borrarDatos(u);
    await this.cajon.borrarDatos(u);
    return this.s.borrarCuenta(u, confirmacion);
  }

  @Public()
  @Get('auth/config')
  config() {
    return { googleClientId: googleClientId() || null };
  }

  @Get('perfil')
  async perfil(@UsuarioId() u: string) {
    await this.premium.revisarVencido(u);
    return this.s.perfil(u);
  }

  @Patch('perfil')
  actualizarPerfil(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    const cambios: Parameters<MonasaferService['actualizarPerfil']>[1] = {};
    if (b.nombre !== undefined)
      cambios.nombre = v.texto(b.nombre, 'nombre', 60, false);
    if (b.moneda !== undefined) {
      if (!MONEDAS.includes(b.moneda as string))
        throw new BadRequestException(`moneda: ${MONEDAS.join(', ')}`);
      cambios.moneda = b.moneda as string;
    }
    if (b.idioma !== undefined) {
      if (!IDIOMAS.includes(b.idioma as string))
        throw new BadRequestException('idioma: es o en');
      cambios.idioma = b.idioma as string;
    }
    if (b.saldo !== undefined) cambios.saldo = v.saldo(b.saldo);
    if (b.ingresoMensual !== undefined) {
      if (b.ingresoMensual === null) cambios.ingresoMensual = null;
      else {
        const i = v.objeto(b.ingresoMensual);
        const dia = Number(i.diaCobro);
        if (!Number.isInteger(dia) || dia < 1 || dia > 31)
          throw new BadRequestException('diaCobro: 1 a 31');
        cambios.ingresoMensual = { monto: v.monto(i.monto), diaCobro: dia };
      }
    }
    return this.s.actualizarPerfil(u, cambios);
  }

  @Post('perfil/cobrar-ingreso')
  @HttpCode(200)
  cobrarIngreso(@UsuarioId() u: string) {
    return this.s.cobrarIngreso(u);
  }

  @Get('gastos')
  gastos(@UsuarioId() u: string) {
    return this.s.listarGastos(u);
  }

  @Post('gastos')
  crearGasto(@UsuarioId() u: string, @Body() body: unknown) {
    return this.s.crearGasto(u, v.gasto(body));
  }

  @Patch('gastos/:id')
  editarGasto(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.s.editarGasto(u, id, v.gasto(body, true));
  }

  @Delete('gastos/:id')
  archivarGasto(@UsuarioId() u: string, @Param('id') id: string) {
    return this.s.archivarGasto(u, id);
  }

  @Post('gastos/:id/restaurar')
  @HttpCode(200)
  restaurarGasto(@UsuarioId() u: string, @Param('id') id: string) {
    return this.s.restaurarGasto(u, id);
  }

  @Put('gastos/:id/meses/:mes')
  montoDelMes(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Param('mes') mes: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    return this.s.montoDelMes(
      u,
      id,
      v.mes(mes),
      b.montoDelMes === null ? null : v.monto(b.montoDelMes, 'montoDelMes'),
    );
  }

  @Post('gastos/:id/meses/:mes/pagar')
  @HttpCode(200)
  pagar(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Param('mes') mes: string,
  ) {
    return this.s.pagar(u, id, v.mes(mes));
  }

  @Delete('gastos/:id/meses/:mes/pagar')
  despagar(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Param('mes') mes: string,
  ) {
    return this.s.despagar(u, id, v.mes(mes));
  }

  @Get('gastos/:id/usos')
  usos(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Query('mes') mes: string,
  ) {
    return this.s.listarUsos(u, id, v.mes(mes));
  }

  @Post('gastos/:id/usos')
  agregarUso(
    @UsuarioId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const b = v.objeto(body);
    return this.s.agregarUso(
      u,
      id,
      v.mes(b.mes),
      v.monto(b.monto),
      v.texto(b.nota, 'nota', 120, false),
    );
  }

  @Delete('usos/:id')
  borrarUso(@UsuarioId() u: string, @Param('id') id: string) {
    return this.s.borrarUso(u, id);
  }

  /** Con lo ahorrado al cajón este mes, para partir el balance (motor/ahorro.ts). */
  @Get('datos')
  async datos(@UsuarioId() u: string) {
    const [datos, ahorros] = await Promise.all([
      this.s.datos(u),
      this.cajon.ahorrosDesde(u, mesDe(this.s.hoy())),
    ]);
    return { ...datos, ahorros };
  }

  @Get('historial')
  historial(@UsuarioId() u: string, @Query('meses') meses?: string) {
    const n = meses === undefined ? 3 : Number(meses);
    if (!Number.isInteger(n) || n < 1 || n > 12)
      throw new BadRequestException('meses va de 1 a 12');
    return this.s.historial(u, n);
  }

  @Get('meses/:mes')
  resumen(@UsuarioId() u: string, @Param('mes') mes: string) {
    return this.s.resumen(u, v.mes(mes));
  }

  @Get('proyeccion')
  proyeccion(@UsuarioId() u: string, @Query('hasta') hasta: string) {
    return this.s.proyeccion(u, v.mes(hasta, 'hasta'));
  }
}
