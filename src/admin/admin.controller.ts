import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Optional,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AdminKeyGuard } from './admin.guard';
import { ConsultaInvalida, validarConsulta } from './consulta';

@Controller('admin')
@UseGuards(AdminKeyGuard)
export class AdminController {
  constructor(
    @Optional() @InjectConnection() private readonly conexion?: Connection,
  ) {}

  @Post('consulta')
  @HttpCode(200)
  async consulta(@Body() body: unknown) {
    let c;
    try {
      c = validarConsulta(body);
    } catch (e) {
      if (e instanceof ConsultaInvalida)
        throw new BadRequestException(e.message);
      throw e;
    }
    const db = this.conexion?.db;
    if (!db || this.conexion?.readyState !== 1)
      throw new ServiceUnavailableException('Base no conectada');

    // Queda en los logs de DO (type=RUN) quién consultó qué.
    console.log(
      `[admin] ${c.operacion} ${c.coleccion ?? ''} ${JSON.stringify(c.operacion === 'aggregate' ? c.pipeline : c.filtro).slice(0, 300)}`,
    );

    if (c.operacion === 'colecciones') {
      const lista = await db.listCollections({}, { nameOnly: true }).toArray();
      return { colecciones: lista.map((l) => l.name).sort() };
    }
    const col = db.collection(c.coleccion!);
    if (c.operacion === 'count')
      return { total: await col.countDocuments(c.filtro) };
    if (c.operacion === 'find') {
      const cursor = col.find(c.filtro, {
        projection: c.proyeccion,
        limit: c.limite,
        maxTimeMS: 10000,
      });
      if (c.orden) cursor.sort(c.orden);
      return { documentos: await cursor.toArray() };
    }
    const documentos = await col
      .aggregate([...c.pipeline, { $limit: c.limite }], { maxTimeMS: 10000 })
      .toArray();
    return { documentos };
  }
}
