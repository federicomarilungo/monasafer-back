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
import { MonasaferService } from './monasafer.service';
import * as v from './validar';
import { BadRequestException } from '@nestjs/common';

@Controller()
export class MonasaferController {
  constructor(private readonly s: MonasaferService) {}

  @Public()
  @Post('auth/registro')
  registro(@Body() body: unknown) {
    const b = v.objeto(body);
    return this.s.registrar(
      v.email(b.email),
      v.clave(b.clave),
      v.texto(b.nombre, 'nombre', 60, false),
    );
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: unknown) {
    const b = v.objeto(body);
    return this.s.login(
      v.email(b.email),
      typeof b.clave === 'string' ? b.clave : '',
    );
  }

  @Public()
  @Post('auth/google')
  @HttpCode(200)
  loginGoogle(@Body() body: unknown) {
    const b = v.objeto(body);
    if (typeof b.credencial !== 'string' || b.credencial.length > 5000)
      throw new BadRequestException('credencial inválida');
    return this.s.loginGoogle(b.credencial);
  }

  @Public()
  @Get('auth/config')
  config() {
    return { googleClientId: googleClientId() || null };
  }

  @Get('perfil')
  perfil(@UsuarioId() u: string) {
    return this.s.perfil(u);
  }

  @Patch('perfil')
  actualizarPerfil(@UsuarioId() u: string, @Body() body: unknown) {
    const b = v.objeto(body);
    const cambios: Parameters<MonasaferService['actualizarPerfil']>[1] = {};
    if (b.nombre !== undefined)
      cambios.nombre = v.texto(b.nombre, 'nombre', 60, false);
    if (b.moneda !== undefined) {
      if (b.moneda !== 'USD' && b.moneda !== 'ARS')
        throw new BadRequestException('moneda: USD o ARS');
      cambios.moneda = b.moneda;
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

  @Get('datos')
  datos(@UsuarioId() u: string) {
    return this.s.datos(u);
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
