import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Tokens } from '../auth/tokens';
import { SESIONES, UsuarioGuard } from '../auth/usuario.guard';
import { VerificadorGoogle } from '../auth/google';
import { Correo } from '../auth/correo';
import {
  GastoDb,
  GastoSchema,
  MesGasto,
  MesGastoSchema,
  UsoReservaDb,
  UsoReservaSchema,
  Suscripcion,
  SuscripcionSchema,
  UsoIa,
  UsoIaSchema,
  Usuario,
  UsuarioSchema,
} from './esquemas';
import { MonasaferController } from './monasafer.controller';
import { MonasaferService } from './monasafer.service';
import { PremiumController } from '../premium/premium.controller';
import { PremiumService } from '../premium/premium.service';
import { MercadoPago } from '../premium/mercadopago';
import { ClienteIa } from '../premium/asistente';
import {
  Bolsillo,
  BolsilloSchema,
  MovimientoCajon,
  MovimientoCajonSchema,
} from '../cajon/esquemas';
import { CajonController } from '../cajon/cajon.controller';
import { CajonService } from '../cajon/cajon.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Usuario.name, schema: UsuarioSchema },
      { name: GastoDb.name, schema: GastoSchema },
      { name: MesGasto.name, schema: MesGastoSchema },
      { name: UsoReservaDb.name, schema: UsoReservaSchema },
      { name: Suscripcion.name, schema: SuscripcionSchema },
      { name: UsoIa.name, schema: UsoIaSchema },
      { name: Bolsillo.name, schema: BolsilloSchema },
      { name: MovimientoCajon.name, schema: MovimientoCajonSchema },
    ]),
  ],
  controllers: [MonasaferController, PremiumController, CajonController],
  providers: [
    MonasaferService,
    PremiumService,
    CajonService,
    MercadoPago,
    ClienteIa,
    { provide: Tokens, useFactory: () => Tokens.desdeEntorno() },
    { provide: SESIONES, useExisting: MonasaferService },
    VerificadorGoogle,
    Correo,
    { provide: APP_GUARD, useClass: UsuarioGuard },
  ],
})
export class DatosModule {}
