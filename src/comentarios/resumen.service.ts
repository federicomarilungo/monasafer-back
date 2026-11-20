import {
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Correo } from '../auth/correo';
import { Comentario } from './esquemas';
import { armarResumen, turnoDe } from './resumen';

const CADA = 30 * 60 * 1000;

/**
 * Manda el resumen semanal (resumen.ts). Cada 30 min mira si ya pasó el lunes a las 9 y
 * si ese turno no se mandó: la marca en `envios_resumen` (_id = clave del turno, única)
 * hace que salga una sola vez aunque haya reinicios o más de una instancia. Si el email
 * falla, se borra la marca y se reintenta en la próxima vuelta.
 */
@Injectable()
export class ResumenSemanalService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private reloj?: NodeJS.Timeout;
  private arranque?: NodeJS.Timeout;

  constructor(
    @InjectModel(Comentario.name)
    private readonly comentarios: Model<Comentario>,
    @InjectConnection() private readonly conexion: Connection,
    private readonly correo: Correo,
  ) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test' || process.env.RESUMEN_SEMANAL === '0')
      return;
    const vuelta = () =>
      this.revisar().catch((e) => console.error('[resumen] falló', e));
    this.arranque = setTimeout(vuelta, 60 * 1000);
    this.reloj = setInterval(vuelta, CADA);
    this.arranque.unref();
    this.reloj.unref();
  }

  onModuleDestroy() {
    clearTimeout(this.arranque);
    clearInterval(this.reloj);
  }

  /** Para quién: RESUMEN_PARA, si no COMENTARIOS_PARA, si no admin@ (reenvía al Gmail de Fede). */
  para() {
    return (
      process.env.RESUMEN_PARA ??
      process.env.COMENTARIOS_PARA ??
      'admin@monasafer.com'
    );
  }

  /** Manda el turno que toca si todavía no salió. Devuelve si mandó. */
  async revisar(ahora = new Date()): Promise<boolean> {
    if (this.conexion.readyState !== 1) return false;
    const { clave, desde } = turnoDe(ahora);
    const envios = this.conexion.collection<{ _id: string }>('envios_resumen');
    try {
      await envios.insertOne({ _id: clave, en: ahora } as never);
    } catch (e) {
      if ((e as { code?: number }).code === 11000) return false; // ya salió
      throw e;
    }
    const ok = await this.mandar(desde);
    if (!ok) await envios.deleteOne({ _id: clave });
    else console.log(`[resumen] semana ${clave} mandada a ${this.para()}`);
    return ok;
  }

  /** Arma y manda el resumen con todo lo que sigue en estado "nuevo". */
  async mandar(desde = turnoDe(new Date()).desde): Promise<boolean> {
    const pendientes = await this.comentarios
      .find({ estado: 'nuevo' })
      .sort({ createdAt: 1 })
      .limit(200)
      .lean();
    const r = armarResumen(pendientes as never, desde);
    return this.correo.enviar(this.para(), r.asunto, r.html);
  }
}
