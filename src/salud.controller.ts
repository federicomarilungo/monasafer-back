import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { Optional } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Public()
@Controller()
export class SaludController {
  constructor(
    @Optional() @InjectConnection() private readonly conexion?: Connection,
  ) {}

  @Get('ping')
  ping() {
    return { ok: true, app: 'monasafer', mono: '🐒' };
  }

  @Get('salud')
  salud() {
    // readyState 1 = conectado. Sin MONGO_URI la API arranca igual (primer deploy).
    return {
      ok: true,
      base: this.conexion ? this.conexion.readyState === 1 : null,
    };
  }
}
