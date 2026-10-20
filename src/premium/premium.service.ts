import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { mesDe } from '../motor';
import {
  GastoDb,
  MesGasto,
  Suscripcion,
  UsoIa,
  Usuario,
} from '../datos/esquemas';
import { urlApp } from '../auth/correo';
import { MercadoPago, PreapprovalMp } from './mercadopago';
import {
  ClienteIa,
  GastoContexto,
  interpretarHerramienta,
  MensajeChat,
  mensajesApi,
  MODELO_IA,
  PRECIOS,
  promptSistema,
  Propuesta,
} from './asistente';

const DIA_MS = 24 * 60 * 60 * 1000;
export const FUNCIONES = ['metricas', 'asistente'] as const;
export type Funcion = (typeof FUNCIONES)[number];

const precioArs = () => Number(process.env.PREMIUM_PRECIO_ARS ?? 3000);
const presupuestoDiario = () => Number(process.env.IA_PRESUPUESTO_DIARIO_USD ?? 1);
const MENSAJES_DIARIOS_PREMIUM = 60;

@Injectable()
export class PremiumService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(GastoDb.name) private readonly gastos: Model<GastoDb>,
    @InjectModel(MesGasto.name) private readonly meses: Model<MesGasto>,
    @InjectModel(Suscripcion.name) private readonly suscripciones: Model<Suscripcion>,
    @InjectModel(UsoIa.name) private readonly usosIa: Model<UsoIa>,
    private readonly mp: MercadoPago,
    private readonly ia: ClienteIa,
  ) {}

  hoy(): Date {
    return new Date();
  }

  private async usuario(usuarioId: string) {
    if (!Types.ObjectId.isValid(usuarioId)) throw new UnauthorizedException();
    const u = await this.usuarios.findById(usuarioId);
    if (!u) throw new UnauthorizedException();
    return u;
  }

  private esPremium(u: Usuario) {
    return !!u.premiumHasta && u.premiumHasta.getTime() > Date.now();
  }

  /**
   * Gasta un uso gratis de una función premium (o nada si es premium). Devuelve si puede
   * usarla y cuántos le quedan. El contador vive en la base, no en el navegador.
   */
  async usar(usuarioId: string, funcion: Funcion) {
    const u = await this.usuario(usuarioId);
    if (this.esPremium(u)) return { permitido: true, premium: true, quedan: null };
    const campo = `usosGratis.${funcion}`;
    const r = await this.usuarios.findOneAndUpdate(
      { _id: u._id, $or: [{ [campo]: { $gt: 0 } }, { [campo]: { $exists: false } }] },
      { $inc: { [campo]: -1 } },
      { new: true },
    );
    if (!r) return { permitido: false, premium: false, quedan: 0 };
    // Si el campo no existía, $inc arrancó de 0: se corrige al default menos uno.
    const quedan = r.usosGratis?.[funcion] ?? 0;
    if (quedan < 0) {
      const inicial = funcion === 'metricas' ? 3 : 10;
      await this.usuarios.updateOne({ _id: u._id }, { $set: { [campo]: inicial - 1 } });
      return { permitido: true, premium: false, quedan: inicial - 1 };
    }
    return { permitido: true, premium: false, quedan };
  }

  private async devolverUso(usuarioId: Types.ObjectId, funcion: Funcion) {
    await this.usuarios.updateOne({ _id: usuarioId }, { $inc: { [`usosGratis.${funcion}`]: 1 } });
  }

  // ---- Asistente (S3) ----

  async asistente(usuarioId: string, chat: MensajeChat[]) {
    if (!this.ia.configurado())
      throw new ServiceUnavailableException('El asistente todavía no está activo');
    const mensajes = mensajesApi(chat);
    if (!mensajes.length) throw new BadRequestException('Escribí algo');
    const hoy = this.hoy();
    const dia = hoy.toISOString().slice(0, 10);
    const [gastado] = await this.usosIa.aggregate<{ total: number }>([
      { $match: { dia } },
      { $group: { _id: null, total: { $sum: '$costoUsd' } } },
    ]);
    if ((gastado?.total ?? 0) >= presupuestoDiario())
      throw new HttpException(
        'Mona está descansando por hoy. Probá mañana 🍌',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    const u = await this.usuario(usuarioId);
    const premium = this.esPremium(u);
    if (premium) {
      const hoyUsados = await this.usosIa.countDocuments({ usuarioId: u._id, dia });
      if (hoyUsados >= MENSAJES_DIARIOS_PREMIUM)
        throw new HttpException(
          'Por hoy ya charlamos un montón. Mañana seguimos 🍌',
          HttpStatus.TOO_MANY_REQUESTS,
        );
    }
    const uso = await this.usar(usuarioId, 'asistente');
    if (!uso.permitido)
      return { texto: null, propuestas: [], requierePremium: true, quedan: 0 };

    const gastos = await this.contexto(u._id, mesDe(hoy));
    let respuesta;
    try {
      respuesta = await this.ia.preguntar(
        promptSistema({ hoy, moneda: u.moneda, idioma: u.idioma, nombre: u.nombre, gastos }),
        mensajes,
      );
    } catch (e) {
      console.error('[asistente] falló la IA', e);
      if (!premium) await this.devolverUso(u._id, 'asistente');
      throw new ServiceUnavailableException('Mona no pudo pensar ahora. Probá de nuevo.');
    }
    const [pEntrada, pSalida] = PRECIOS[MODELO_IA];
    const entrada = respuesta.usage.input_tokens;
    const salida = respuesta.usage.output_tokens;
    await this.usosIa.create({
      usuarioId: u._id,
      dia,
      modelo: MODELO_IA,
      entrada,
      salida,
      costoUsd: (entrada * pEntrada + salida * pSalida) / 1e6,
    });
    if (respuesta.stop_reason === 'refusal')
      return {
        texto: u.idioma === 'en'
          ? "🙈 I can't help with that. Shall we add an expense?"
          : '🙈 De eso no puedo hablar. ¿Cargamos algún gasto?',
        propuestas: [],
        quedan: uso.quedan,
      };
    const textos: string[] = [];
    const propuestas: Propuesta[] = [];
    for (const b of respuesta.content) {
      if (b.type === 'text') textos.push(b.text);
      if (b.type === 'tool_use') {
        const p = interpretarHerramienta(b.name, b.input, gastos, hoy);
        if (p) propuestas.push(p);
      }
    }
    return { texto: textos.join('\n').trim() || null, propuestas, quedan: uso.quedan };
  }

  private async contexto(usuarioId: Types.ObjectId, mes: string): Promise<GastoContexto[]> {
    const gs = await this.gastos
      .find({
        usuarioId,
        archivado: false,
        $or: [{ mesFin: null }, { mesFin: { $gte: mes } }],
      })
      .limit(80)
      .lean();
    const pagados = await this.meses
      .find({ usuarioId, mes, pagado: true }, { gastoId: 1 })
      .lean();
    const idsPagados = new Set(pagados.map((p) => String(p.gastoId)));
    return gs
      .filter((g) => g.tipo !== 'puntual' || g.mesInicio >= mes)
      .map((g) => ({
        id: String(g._id),
        nombre: g.nombre,
        emoji: g.emoji,
        tipo: g.tipo,
        monto: g.monto,
        mesInicio: g.mesInicio,
        mesFin: g.mesFin,
        pagadoEsteMes: idsPagados.has(String(g._id)),
      }));
  }

  // ---- Suscripción web con Mercado Pago (S8) ----

  config() {
    return {
      pagos: this.mp.configurado(),
      precio: { monto: precioArs(), moneda: 'ARS' },
      asistente: this.ia.configurado(),
    };
  }

  async suscribir(usuarioId: string, emailPago: string | null) {
    if (!this.mp.configurado())
      throw new ServiceUnavailableException('Los pagos todavía no están activos');
    const u = await this.usuario(usuarioId);
    const pre = await this.mp.crearSuscripcion({
      usuarioId: String(u._id),
      emailPago: emailPago ?? u.email,
      monto: precioArs(),
      volverA: `${urlApp()}/#premium`,
    });
    await this.suscripciones.create({
      usuarioId: u._id,
      proveedor: 'mercadopago',
      externoId: pre.id,
      estado: pre.status ?? 'pending',
      monto: precioArs(),
      moneda: 'ARS',
    });
    if (!pre.init_point) throw new ServiceUnavailableException('Mercado Pago no devolvió el link');
    return { url: pre.init_point };
  }

  /** Lee el estado real en Mercado Pago y actualiza la suscripción y el premium. */
  async refrescar(preapprovalId: string) {
    const pre = await this.mp.leer(preapprovalId);
    const s = await this.suscripciones.findOne({ externoId: pre.id });
    if (!s) {
      console.warn(`[pagos] suscripción desconocida ${pre.id}`);
      return null;
    }
    if (pre.external_reference && pre.external_reference !== String(s.usuarioId)) {
      console.error(`[pagos] ${pre.id} no coincide con el usuario`);
      return null;
    }
    s.estado = pre.status;
    s.proximoCobro = pre.next_payment_date ? new Date(pre.next_payment_date) : null;
    await s.save();
    if (pre.status === 'authorized') await this.extenderPremium(s.usuarioId, pre);
    return s;
  }

  private async extenderPremium(usuarioId: Types.ObjectId, pre: PreapprovalMp) {
    // Vale hasta el próximo cobro, con 3 días de gracia por si el cobro se demora.
    const base = pre.next_payment_date
      ? new Date(pre.next_payment_date).getTime()
      : Date.now() + 31 * DIA_MS;
    const hasta = new Date(Math.max(base, Date.now()) + 3 * DIA_MS);
    await this.usuarios.updateOne(
      { _id: usuarioId, $or: [{ premiumHasta: null }, { premiumHasta: { $lt: hasta } }] },
      { $set: { premiumHasta: hasta } },
    );
  }

  /** Notificación de Mercado Pago: puede ser de la suscripción o de un cobro mensual. */
  async notificacion(tipo: string, id: string) {
    if (!this.mp.configurado() || !id) return;
    try {
      if (tipo === 'subscription_preapproval') await this.refrescar(id);
      else if (tipo === 'subscription_authorized_payment') {
        const pre = await this.mp.suscripcionDePago(id);
        if (pre) await this.refrescar(pre);
      }
    } catch (e) {
      console.error('[pagos] no se pudo procesar la notificación', e);
    }
  }

  /** Al volver de Mercado Pago, sin esperar la notificación. */
  async sincronizar(usuarioId: string) {
    const u = await this.usuario(usuarioId);
    const ultima = await this.suscripciones
      .findOne({ usuarioId: u._id })
      .sort({ createdAt: -1 });
    if (ultima?.externoId && this.mp.configurado()) await this.refrescar(ultima.externoId);
    return this.estado(usuarioId);
  }

  async estado(usuarioId: string) {
    const u = await this.usuario(usuarioId);
    const s = await this.suscripciones
      .findOne({ usuarioId: u._id, estado: { $in: ['authorized', 'paused'] } })
      .sort({ createdAt: -1 })
      .lean();
    return {
      premium: this.esPremium(u),
      hasta: u.premiumHasta,
      suscripcion: s
        ? { estado: s.estado, proximoCobro: s.proximoCobro, monto: s.monto, moneda: s.moneda }
        : null,
      usosGratis: { metricas: u.usosGratis?.metricas ?? 3, asistente: u.usosGratis?.asistente ?? 10 },
    };
  }

  /** Antes de borrar la cuenta: que no se siga cobrando, y fuera sus registros. */
  async borrarDatos(usuarioId: string) {
    const id = new Types.ObjectId(usuarioId);
    const activas = await this.suscripciones.find({
      usuarioId: id,
      estado: { $in: ['authorized', 'paused', 'pending'] },
    });
    for (const s of activas)
      if (s.externoId && this.mp.configurado())
        await this.mp.cancelar(s.externoId).catch((e) =>
          console.error(`[pagos] no se pudo cancelar ${s.externoId}`, e),
        );
    await Promise.all([
      this.suscripciones.deleteMany({ usuarioId: id }),
      this.usosIa.deleteMany({ usuarioId: id }),
    ]);
  }

  /** Cancela la renovación; premium sigue hasta el final de lo pagado. */
  async cancelar(usuarioId: string) {
    const u = await this.usuario(usuarioId);
    const s = await this.suscripciones
      .findOne({ usuarioId: u._id, estado: { $in: ['authorized', 'paused'] } })
      .sort({ createdAt: -1 });
    if (!s?.externoId) throw new BadRequestException('No tenés una suscripción activa');
    await this.mp.cancelar(s.externoId);
    s.estado = 'cancelled';
    await s.save();
    return this.estado(usuarioId);
  }
}
