import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import crypto from 'crypto';
import { Ahorro, mesDe } from '../motor';
import { Usuario } from '../datos/esquemas';
import { Bolsillo, MovimientoCajon } from './esquemas';

function oid(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
  return new Types.ObjectId(id);
}

/** Los totales editados a mano (`ajustar`): pueden dejar el bolsillo en negativo. */
const esAjuste = (tipo: string) => tipo === 'gasto' || tipo === 'ingreso';

export interface NuevoBolsillo {
  nombre: string;
  emoji: string;
  unidad: string;
  decimales: number;
  cotizacion?: { moneda: string; valor: number } | null;
}

@Injectable()
export class CajonService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(Bolsillo.name) private readonly bolsillos: Model<Bolsillo>,
    @InjectModel(MovimientoCajon.name)
    private readonly movimientos: Model<MovimientoCajon>,
  ) {}

  hoy(): Date {
    return new Date();
  }

  /** Bolsillos con su cantidad y los últimos movimientos (la auditoría). */
  async cajon(usuarioId: string) {
    const id = oid(usuarioId);
    const [bolsillos, cantidades, movimientos] = await Promise.all([
      this.bolsillos.find({ usuarioId: id }).sort({ createdAt: 1 }).lean(),
      this.cantidades(id),
      this.movimientos
        .find({ usuarioId: id })
        .sort({ createdAt: -1 })
        .limit(300)
        .lean(),
    ]);
    return {
      bolsillos: bolsillos
        .filter((b) => !b.archivado)
        .map((b) => ({
          id: String(b._id),
          nombre: b.nombre,
          emoji: b.emoji,
          unidad: b.unidad,
          decimales: b.decimales,
          cotizacion: b.cotizacion ?? null,
          generico: b.generico,
          cantidad: cantidades.get(String(b._id)) ?? 0,
        })),
      movimientos: movimientos.map((m) => this.movimientoPublico(m)),
    };
  }

  /** Lo ahorrado desde el saldo en un mes, para partir el balance (GET /datos). */
  async ahorrosDesde(usuarioId: string, mes: string): Promise<Ahorro[]> {
    const lista = await this.movimientos
      .find({ usuarioId: oid(usuarioId), tipo: 'ahorro', mes: { $gte: mes } })
      .lean();
    return lista.map((m) => ({
      mes: m.mes,
      monto: -m.deltaSaldo,
      origen: m.origen === 'mes' ? 'mes' : 'acumulado',
    }));
  }

  async crearBolsillo(usuarioId: string, b: NuevoBolsillo) {
    const id = oid(usuarioId);
    if (
      (await this.bolsillos.countDocuments({
        usuarioId: id,
        archivado: false,
      })) >= 30
    )
      throw new BadRequestException('Hasta 30 bolsillos');
    const creado = await this.bolsillos.create({ ...b, usuarioId: id });
    return { ...this.bolsilloPublico(creado.toObject()), cantidad: 0 };
  }

  async editarBolsillo(
    usuarioId: string,
    bolsilloId: string,
    cambios: Partial<
      Pick<
        NuevoBolsillo,
        'nombre' | 'emoji' | 'unidad' | 'decimales' | 'cotizacion'
      >
    >,
  ) {
    // Cambiar la unidad es renombrarla (lo guardado sigue igual). Los decimales cambian
    // cómo se leen las cantidades guardadas, así que solo se tocan con el bolsillo vacío.
    if (cambios.unidad !== undefined || cambios.decimales !== undefined) {
      const actual = await this.bolsilloDe(usuarioId, bolsilloId);
      if (actual.generico)
        throw new BadRequestException(
          '"Sin asignar" va en la moneda de la cuenta',
        );
      if (
        cambios.decimales !== undefined &&
        cambios.decimales !== actual.decimales &&
        (await this.cantidadDe(actual._id)) !== 0
      )
        throw new ConflictException(
          'Para cambiar los decimales vaciá el bolsillo',
        );
    }
    const b = await this.bolsillos
      .findOneAndUpdate(
        { _id: oid(bolsilloId), usuarioId: oid(usuarioId), archivado: false },
        { $set: cambios },
        { new: true },
      )
      .lean();
    if (!b) throw new NotFoundException();
    return this.bolsilloPublico(b);
  }

  /** Solo se borra un bolsillo vacío: lo que tiene se gasta, se retira o se pasa a otro. */
  async borrarBolsillo(usuarioId: string, bolsilloId: string) {
    const b = await this.bolsilloDe(usuarioId, bolsilloId);
    if ((await this.cantidadDe(b._id)) !== 0)
      throw new ConflictException('Primero vaciá el bolsillo');
    await this.bolsillos.updateOne(
      { _id: b._id },
      { $set: { archivado: true } },
    );
    return { ok: true };
  }

  /**
   * Saca `monto` centavos del saldo y los guarda. Sin bolsillo va a "Sin asignar" (en la
   * moneda de la cuenta); con bolsillo, `cantidad` es lo que quedó en su unidad.
   */
  async ahorrar(
    usuarioId: string,
    a: {
      monto: number;
      origen: 'mes' | 'acumulado';
      bolsilloId: string | null;
      cantidad: number | null;
      detalle: string;
    },
  ) {
    if (a.monto <= 0) throw new BadRequestException('monto tiene que ser > 0');
    const id = oid(usuarioId);
    let bolsillo;
    let cantidad: number;
    if (a.bolsilloId) {
      bolsillo = await this.bolsilloDe(usuarioId, a.bolsilloId);
      cantidad = a.cantidad ?? (bolsillo.generico ? a.monto : 0);
    } else {
      bolsillo = await this.generico(id);
      cantidad = a.monto;
    }
    if (cantidad <= 0)
      throw new BadRequestException(
        'cantidad: ¿cuánto te quedó en el bolsillo?',
      );
    const m = await this.movimientos.create({
      usuarioId: id,
      bolsilloId: bolsillo._id,
      tipo: 'ahorro',
      cantidad,
      deltaSaldo: -a.monto,
      origen: a.origen,
      mes: mesDe(this.hoy()),
      detalle: a.detalle,
    });
    await this.usuarios.updateOne({ _id: id }, { $inc: { saldo: -a.monto } });
    return this.movimientoPublico(m.toObject());
  }

  /**
   * Edita el total de un bolsillo. Si baja, la diferencia es un gasto del ahorro (con su
   * detalle: "viaje"); si sube, un ingreso que no vino del saldo. El saldo no cambia.
   * Puede quedar en negativo: plata de otro que tenés guardada y resta del total (Fede).
   */
  async ajustar(
    usuarioId: string,
    bolsilloId: string,
    nueva: number,
    detalle: string,
  ) {
    const b = await this.bolsilloDe(usuarioId, bolsilloId);
    const diferencia = nueva - (await this.cantidadDe(b._id));
    if (diferencia === 0) throw new BadRequestException('No cambió nada');
    const m = await this.movimientos.create({
      usuarioId: b.usuarioId,
      bolsilloId: b._id,
      tipo: diferencia < 0 ? 'gasto' : 'ingreso',
      cantidad: diferencia,
      mes: mesDe(this.hoy()),
      detalle,
    });
    return this.movimientoPublico(m.toObject());
  }

  /** Saca `cantidad` del bolsillo y suma `monto` centavos al saldo (vendiste dólares). */
  async retirar(
    usuarioId: string,
    bolsilloId: string,
    cantidad: number,
    monto: number,
    detalle: string,
  ) {
    const b = await this.bolsilloDe(usuarioId, bolsilloId);
    if (cantidad <= 0)
      throw new BadRequestException('cantidad tiene que ser > 0');
    if (cantidad > (await this.cantidadDe(b._id)))
      throw new ConflictException('No tenés tanto en ese bolsillo');
    const m = await this.movimientos.create({
      usuarioId: b.usuarioId,
      bolsilloId: b._id,
      tipo: 'retiro',
      cantidad: -cantidad,
      deltaSaldo: monto,
      mes: mesDe(this.hoy()),
      detalle,
    });
    await this.usuarios.updateOne(
      { _id: b.usuarioId },
      { $inc: { saldo: monto } },
    );
    return this.movimientoPublico(m.toObject());
  }

  /** De un bolsillo a otro: repartir lo de "Sin asignar", o pasar de pesos a dólares. */
  async traspasar(
    usuarioId: string,
    t: {
      desde: string;
      hacia: string;
      cantidad: number;
      cantidadEntra: number | null;
      detalle: string;
    },
  ) {
    const desde = await this.bolsilloDe(usuarioId, t.desde);
    const hacia = await this.bolsilloDe(usuarioId, t.hacia);
    if (desde._id.equals(hacia._id))
      throw new BadRequestException('Elegí otro bolsillo');
    const mismaUnidad =
      desde.unidad === hacia.unidad && desde.decimales === hacia.decimales;
    const entra = t.cantidadEntra ?? (mismaUnidad ? t.cantidad : 0);
    if (t.cantidad <= 0 || entra <= 0)
      throw new BadRequestException('cantidad tiene que ser > 0');
    if (t.cantidad > (await this.cantidadDe(desde._id)))
      throw new ConflictException('No tenés tanto en ese bolsillo');
    const grupo = crypto.randomUUID();
    const comun = {
      usuarioId: desde.usuarioId,
      tipo: 'traspaso',
      mes: mesDe(this.hoy()),
      detalle: t.detalle,
      grupo,
    };
    const [sale, llega] = await this.movimientos.create([
      { ...comun, bolsilloId: desde._id, cantidad: -t.cantidad },
      { ...comun, bolsilloId: hacia._id, cantidad: entra },
    ]);
    return [sale, llega].map((m) => this.movimientoPublico(m.toObject()));
  }

  /**
   * Corrige un movimiento: cantidad, monto (lo que salió o volvió al saldo) o detalle. Si
   * cambia el monto, el saldo se corrige por la diferencia. Los traspasos se corrigen
   * borrándolos y haciéndolos de nuevo.
   */
  async editarMovimiento(
    usuarioId: string,
    movimientoId: string,
    c: { cantidad?: number; monto?: number; detalle?: string },
  ) {
    const m = await this.movimientos.findOne({
      _id: oid(movimientoId),
      usuarioId: oid(usuarioId),
    });
    if (!m) throw new NotFoundException();
    const cambios: Partial<MovimientoCajon> = {};
    if (c.detalle !== undefined) cambios.detalle = c.detalle;
    if (c.cantidad !== undefined) {
      if (m.tipo === 'traspaso')
        throw new BadRequestException(
          'Un traspaso se borra y se hace de nuevo',
        );
      if (c.cantidad <= 0)
        throw new BadRequestException('cantidad tiene que ser > 0');
      // Se guarda con el signo del tipo: lo que sale es negativo.
      cambios.cantidad = m.cantidad < 0 ? -c.cantidad : c.cantidad;
    }
    let delta = 0;
    if (c.monto !== undefined) {
      if (m.tipo !== 'ahorro' && m.tipo !== 'retiro')
        throw new BadRequestException('Este movimiento no tocó el saldo');
      if (c.monto <= 0)
        throw new BadRequestException('monto tiene que ser > 0');
      cambios.deltaSaldo = m.tipo === 'ahorro' ? -c.monto : c.monto;
      delta = cambios.deltaSaldo - m.deltaSaldo;
    }
    // Un ajuste a mano puede dejarlo en negativo (como en `ajustar`); lo demás, no.
    if (cambios.cantidad !== undefined && !esAjuste(m.tipo)) {
      const quedaria =
        (await this.cantidadDe(m.bolsilloId)) - m.cantidad + cambios.cantidad;
      if (quedaria < 0)
        throw new ConflictException('El bolsillo quedaría en negativo');
    }
    await this.movimientos.updateOne({ _id: m._id }, { $set: cambios });
    if (delta)
      await this.usuarios.updateOne(
        { _id: m.usuarioId },
        { $inc: { saldo: delta } },
      );
    return this.movimientoPublico({ ...m.toObject(), ...cambios });
  }

  /** Borra un movimiento (o el traspaso entero) y devuelve al saldo lo que había movido. */
  async borrarMovimiento(usuarioId: string, movimientoId: string) {
    const m = await this.movimientos
      .findOne({ _id: oid(movimientoId), usuarioId: oid(usuarioId) })
      .lean();
    if (!m) throw new NotFoundException();
    const todos = m.grupo
      ? await this.movimientos
          .find({ usuarioId: m.usuarioId, grupo: m.grupo })
          .lean()
      : [m];
    for (const x of todos)
      if (
        x.cantidad > 0 &&
        !esAjuste(x.tipo) &&
        (await this.cantidadDe(x.bolsilloId)) < x.cantidad
      )
        throw new ConflictException(
          'Ese ahorro ya se usó: el bolsillo quedaría en negativo',
        );
    await this.movimientos.deleteMany({
      _id: { $in: todos.map((x) => x._id) },
    });
    const delta = todos.reduce((s, x) => s + x.deltaSaldo, 0);
    if (delta)
      await this.usuarios.updateOne(
        { _id: m.usuarioId },
        { $inc: { saldo: -delta } },
      );
    return { ok: true };
  }

  async borrarDatos(usuarioId: string) {
    const id = oid(usuarioId);
    await Promise.all([
      this.bolsillos.deleteMany({ usuarioId: id }),
      this.movimientos.deleteMany({ usuarioId: id }),
    ]);
  }

  // ---- Ayudantes ----

  private async generico(usuarioId: Types.ObjectId) {
    const ya = await this.bolsillos.findOne({ usuarioId, generico: true });
    if (ya) {
      if (ya.archivado)
        await this.bolsillos.updateOne(
          { _id: ya._id },
          { $set: { archivado: false } },
        );
      return ya;
    }
    const u = await this.usuarios.findById(usuarioId, { moneda: 1 }).lean();
    try {
      return await this.bolsillos.create({
        usuarioId,
        nombre: 'Sin asignar',
        emoji: '🍌',
        unidad: u?.moneda ?? 'USD',
        decimales: 2,
        generico: true,
      });
    } catch {
      // Dos ahorros a la vez: el otro ya lo creó.
      return (await this.bolsillos.findOne({ usuarioId, generico: true }))!;
    }
  }

  private async bolsilloDe(usuarioId: string, bolsilloId: string) {
    const b = await this.bolsillos.findOne({
      _id: oid(bolsilloId),
      usuarioId: oid(usuarioId),
      archivado: false,
    });
    if (!b) throw new NotFoundException();
    return b;
  }

  private async cantidades(usuarioId: Types.ObjectId) {
    const filas = await this.movimientos.aggregate<{
      _id: Types.ObjectId;
      total: number;
    }>([
      { $match: { usuarioId } },
      { $group: { _id: '$bolsilloId', total: { $sum: '$cantidad' } } },
    ]);
    return new Map(filas.map((f) => [String(f._id), f.total]));
  }

  private async cantidadDe(bolsilloId: Types.ObjectId) {
    const [f] = await this.movimientos.aggregate<{ total: number }>([
      { $match: { bolsilloId } },
      { $group: { _id: null, total: { $sum: '$cantidad' } } },
    ]);
    return f?.total ?? 0;
  }

  private bolsilloPublico(b: Bolsillo & { _id: unknown }) {
    return {
      id: String(b._id),
      nombre: b.nombre,
      emoji: b.emoji,
      unidad: b.unidad,
      decimales: b.decimales,
      cotizacion: b.cotizacion ?? null,
      generico: b.generico,
    };
  }

  private movimientoPublico(
    m: MovimientoCajon & { _id: unknown; createdAt?: Date },
  ) {
    return {
      id: String(m._id),
      bolsilloId: String(m.bolsilloId),
      tipo: m.tipo,
      cantidad: m.cantidad,
      monto: Math.abs(m.deltaSaldo),
      origen: m.origen,
      mes: m.mes,
      detalle: m.detalle,
      grupo: m.grupo,
      fecha: m.createdAt ?? null,
    };
  }
}
