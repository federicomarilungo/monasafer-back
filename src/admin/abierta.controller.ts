import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Optional,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import type { Connection } from 'mongoose';
import { Public } from '../auth/public.decorator';
import {
  CUENTAS_ABIERTAS,
  ConsultaInvalida,
  OCULTOS_USUARIO,
  validarAbierta,
  validarConsulta,
} from './consulta';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * `POST /admin/consulta-abierta {email, operacion, coleccion, ...}`: como /admin/consulta pero
 * sin clave, y solo sobre los datos de una cuenta de CUENTAS_ABIERTAS (ver consulta.ts).
 */
@Public()
@Controller('admin')
export class AbiertaController {
  constructor(
    @Optional() @InjectConnection() private readonly conexion?: Connection,
  ) {}

  @Post('consulta-abierta')
  @HttpCode(200)
  async consulta(@Body() body: Record<string, unknown>) {
    if (process.env.CONSULTA_ABIERTA === '0') throw new NotFoundException();
    const email = String(body?.email ?? '')
      .trim()
      .toLowerCase();
    if (!CUENTAS_ABIERTAS.has(sha(email))) throw new ForbiddenException();
    let c;
    try {
      c = validarConsulta(body);
      validarAbierta(c);
    } catch (e) {
      if (e instanceof ConsultaInvalida)
        throw new BadRequestException(e.message);
      throw e;
    }
    const db = this.conexion?.db;
    if (!db || this.conexion?.readyState !== 1)
      throw new ServiceUnavailableException('Base no conectada');
    const u = await db
      .collection('usuarios')
      .findOne({ email }, { projection: { _id: 1 } });
    if (!u) throw new NotFoundException();
    console.log(`[admin abierta] ${c.operacion} ${c.coleccion ?? ''}`);
    if (c.operacion === 'colecciones') return { colecciones: [] };
    const propio =
      c.coleccion === 'usuarios' ? { _id: u._id } : { usuarioId: u._id };
    const col = db.collection(c.coleccion!);
    const filtro = { $and: [c.filtro, propio] };
    if (c.operacion === 'count')
      return { total: await col.countDocuments(filtro) };
    const ocultos =
      c.coleccion === 'usuarios' ? [{ $project: OCULTOS_USUARIO }] : [];
    if (c.operacion === 'find') {
      const pipeline: Record<string, unknown>[] = [
        { $match: filtro },
        ...ocultos,
      ];
      if (c.orden) pipeline.push({ $sort: c.orden });
      pipeline.push({ $limit: c.limite });
      if (c.proyeccion) pipeline.push({ $project: c.proyeccion });
      return {
        documentos: await col
          .aggregate([...pipeline], { maxTimeMS: 10000 })
          .toArray(),
      };
    }
    const documentos = await col
      .aggregate(
        [{ $match: propio }, ...ocultos, ...c.pipeline, { $limit: c.limite }],
        { maxTimeMS: 10000 },
      )
      .toArray();
    return { documentos };
  }
}
