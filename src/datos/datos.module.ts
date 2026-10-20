import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { Tokens } from '../auth/tokens';
import { UsuarioGuard } from '../auth/usuario.guard';
import {
  GastoDb,
  GastoSchema,
  MesGasto,
  MesGastoSchema,
  UsoReservaDb,
  UsoReservaSchema,
  Usuario,
  UsuarioSchema,
} from './esquemas';
import { MonasaferController } from './monasafer.controller';
import { MonasaferService } from './monasafer.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Usuario.name, schema: UsuarioSchema },
      { name: GastoDb.name, schema: GastoSchema },
      { name: MesGasto.name, schema: MesGastoSchema },
      { name: UsoReservaDb.name, schema: UsoReservaSchema },
    ]),
  ],
  controllers: [MonasaferController],
  providers: [
    MonasaferService,
    { provide: Tokens, useFactory: () => Tokens.desdeEntorno() },
    { provide: APP_GUARD, useClass: UsuarioGuard },
  ],
})
export class DatosModule {}
