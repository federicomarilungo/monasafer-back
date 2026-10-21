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
export const USOS_GRATIS = { metricas: 3, asistente: 10 };

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
    await this.revisarVencido(usuarioId);
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
        promptSistema({
          hoy,
          moneda: u.moneda,
          idioma: u.idioma,
          nombre: u.nombre,
          gastos,
          saldo: u.saldo,
          ingreso: u.ingresoMensual ?? null,
        }),
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

  /**
   * Arranca la suscripción en Mercado Pago. Si el cobro no se puede iniciar (pagos sin
   * configurar o MP falla), no bloqueamos a nadie: se reinician los usos gratis y la
   * persona sigue usando premium (Fede, 21/10). El límite de 5 intentos por hora del
   * controller acota cuántas veces se pueden reiniciar.
   */
  async suscribir(usuarioId: string) {
    const u = await this.usuario(usuarioId);
    let plan: { id: string; init_point?: string } | null = null;
    if (this.mp.configurado()) {
      try {
        plan = await this.mp.crearPlan({ monto: precioArs(), volverA: `${urlApp()}/#premium` });
      } catch (e) {
        console.error(`[pagos] no se pudo crear el plan de ${u._id}: ${(e as Error).message}`);
      }
    }
    if (!plan?.init_point) {
      const usosGratis = { ...USOS_GRATIS };
      await this.usuarios.updateOne({ _id: u._id }, { $set: { usosGratis } });
      return { url: null, regalo: true, usosGratis };
    }
    await this.suscripciones.create({
      usuarioId: u._id,
      proveedor: 'mercadopago',
      planId: plan.id,
      externoId: null,
      estado: 'pending',
      monto: precioArs(),
      moneda: 'ARS',
    });
    return { url: plan.init_point };
  }

  /** Lee el estado real en Mercado Pago y actualiza la suscripción y el premium. */
  async refrescar(preapprovalId: string) {
    const pre = await this.mp.leer(preapprovalId);
    let s = await this.suscripciones.findOne({ externoId: pre.id });
    if (!s && pre.preapproval_plan_id) {
      // Primera noticia de una suscripción que nació de nuestro plan.
      const delPlan = await this.suscripciones.findOne({ planId: pre.preapproval_plan_id });
      if (delPlan && !delPlan.externoId) {
        delPlan.externoId = pre.id;
        s = delPlan;
      } else if (delPlan) {
        s = await this.suscripciones.create({
          usuarioId: delPlan.usuarioId,
          proveedor: 'mercadopago',
          planId: delPlan.planId,
          externoId: pre.id,
          monto: delPlan.monto,
          moneda: delPlan.moneda,
        });
      }
    }
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
    // Vale hasta el próximo cobro, con 3 días de gracia por si el cobro se demora. Si el
    // próximo cobro ya pasó (MP está reintentando una tarjeta rechazada), no se extiende.
    const base = pre.next_payment_date
      ? new Date(pre.next_payment_date).getTime()
      : Date.now() + 31 * DIA_MS;
    if (base <= Date.now()) return;
    const hasta = new Date(base + 3 * DIA_MS);
    await this.usuarios.updateOne(
      { _id: usuarioId, $or: [{ premiumHasta: null }, { premiumHasta: { $lt: hasta } }] },
      { $set: { premiumHasta: hasta } },
    );
  }

  /**
   * Red de seguridad por si se perdió una notificación: si a alguien se le venció premium
   * hace menos de 40 días y tiene una suscripción activa, se le pregunta a Mercado Pago
   * antes de tratarlo como gratis. Como mucho una vez por hora por usuario.
   */
  private readonly ultimaRevision = new Map<string, number>();
  async revisarVencido(usuarioId: string) {
    if (!this.mp.configurado() || !Types.ObjectId.isValid(usuarioId)) return;
    await this.revisarPendiente(usuarioId);
    const u = await this.usuarios.findById(usuarioId, { premiumHasta: 1 }).lean();
    const hasta = u?.premiumHasta?.getTime();
    const ahora = Date.now();
    if (!hasta || hasta > ahora || ahora - hasta > 40 * DIA_MS) return;
    if (ahora - (this.ultimaRevision.get(usuarioId) ?? 0) < 60 * 60 * 1000) return;
    this.ultimaRevision.set(usuarioId, ahora);
    const s = await this.suscripciones
      .findOne({ usuarioId: u!._id, estado: { $in: ['authorized', 'paused'] } })
      .sort({ createdAt: -1 })
      .lean();
    if (s?.externoId)
      await this.refrescar(s.externoId).catch((e) =>
        console.error('[pagos] no se pudo revisar el vencimiento', e),
      );
  }

  /**
   * Pagó pero no volvió a la web (el checkout de MP no siempre redirige) y la notificación
   * no llegó: si tiene un plan de los últimos 7 días sin suscripción asociada, se busca en
   * MP por el plan. Como mucho una vez por minuto por usuario (Fede, prueba del 21/10).
   */
  private readonly ultimaPendiente = new Map<string, number>();
  private async revisarPendiente(usuarioId: string) {
    const ahora = Date.now();
    if (ahora - (this.ultimaPendiente.get(usuarioId) ?? 0) < 60 * 1000) return;
    this.ultimaPendiente.set(usuarioId, ahora);
    const s = await this.suscripciones
      .findOne({
        usuarioId: new Types.ObjectId(usuarioId),
        planId: { $ne: null },
        externoId: null,
        createdAt: { $gte: new Date(ahora - 7 * DIA_MS) },
      })
      .sort({ createdAt: -1 })
      .lean();
    if (!s?.planId) return;
    try {
      for (const pre of await this.mp.buscarPorPlan(s.planId)) await this.refrescar(pre.id);
    } catch (e) {
      console.error('[pagos] no se pudo revisar el plan pendiente', e);
    }
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
    else if (ultima?.planId && this.mp.configurado()) {
      // Volvió del checkout antes de que llegue la notificación: buscamos por el plan.
      for (const pre of await this.mp.buscarPorPlan(ultima.planId)) await this.refrescar(pre.id);
    }
    return this.estado(usuarioId);
  }

  async estado(usuarioId: string) {
    await this.revisarVencido(usuarioId);
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
