import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Datos, mesDe, proyectar, resumenDelMes, sumarMeses } from '../motor';
import { hashClave, Tokens, verificarClave } from '../auth/tokens';
import { GastoDb, MesGasto, UsoReservaDb, Usuario } from './esquemas';
import { GastoEntrada } from './validar';

const MESES_MAXIMOS = 24;

function oid(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
  return new Types.ObjectId(id);
}

@Injectable()
export class MonasaferService {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(GastoDb.name) private readonly gastos: Model<GastoDb>,
    @InjectModel(MesGasto.name) private readonly meses: Model<MesGasto>,
    @InjectModel(UsoReservaDb.name) private readonly usos: Model<UsoReservaDb>,
    private readonly tokens: Tokens,
  ) {}

  hoy(): Date {
    return new Date();
  }

  // ---- Usuarios y perfil ----

  async registrar(email: string, clave: string, nombre: string) {
    if (await this.usuarios.exists({ email }))
      throw new ConflictException('Ya hay una cuenta con ese email');
    const u = await this.usuarios.create({
      email,
      nombre,
      hashClave: hashClave(clave),
    });
    return { token: this.tokens.generar(u.id), perfil: this.perfilPublico(u) };
  }

  async login(email: string, clave: string) {
    const u = await this.usuarios.findOne({ email });
    if (!u || !verificarClave(clave, u.hashClave))
      throw new UnauthorizedException('Email o contraseña incorrectos');
    return { token: this.tokens.generar(u.id), perfil: this.perfilPublico(u) };
  }

  async perfil(usuarioId: string) {
    return this.perfilPublico(await this.usuario(usuarioId));
  }

  async actualizarPerfil(
    usuarioId: string,
    cambios: Partial<
      Pick<Usuario, 'nombre' | 'moneda' | 'saldo' | 'ingresoMensual'>
    >,
  ) {
    const u = await this.usuarios.findByIdAndUpdate(
      oid(usuarioId),
      { $set: cambios },
      { new: true },
    );
    if (!u) throw new UnauthorizedException();
    return this.perfilPublico(u);
  }

  /** Suma el ingreso del mes actual al saldo, una sola vez por mes. */
  async cobrarIngreso(usuarioId: string) {
    const actual = mesDe(this.hoy());
    const u = await this.usuario(usuarioId);
    if (!u.ingresoMensual)
      throw new BadRequestException('No hay ingreso mensual configurado');
    const r = await this.usuarios.findOneAndUpdate(
      { _id: u._id, ingresoCobradoMes: { $ne: actual } },
      {
        $inc: { saldo: u.ingresoMensual.monto },
        $set: { ingresoCobradoMes: actual },
      },
      { new: true },
    );
    if (!r) throw new ConflictException('El ingreso de este mes ya se cobró');
    return this.perfilPublico(r);
  }

  // ---- Gastos ----

  async listarGastos(usuarioId: string) {
    const lista = await this.gastos
      .find({ usuarioId: oid(usuarioId), archivado: false })
      .sort({ createdAt: 1 })
      .lean();
    return lista.map((g) => this.gastoPublico(g));
  }

  async crearGasto(usuarioId: string, g: Partial<GastoEntrada>) {
    const creado = await this.gastos.create({
      ...g,
      usuarioId: oid(usuarioId),
    });
    return this.gastoPublico(creado.toObject());
  }

  async editarGasto(
    usuarioId: string,
    gastoId: string,
    cambios: Partial<GastoEntrada>,
  ) {
    const g = await this.gastos
      .findOneAndUpdate(
        { _id: oid(gastoId), usuarioId: oid(usuarioId), archivado: false },
        { $set: cambios },
        { new: true, runValidators: true },
      )
      .lean();
    if (!g) throw new NotFoundException();
    if (g.mesFin && g.mesFin < g.mesInicio)
      throw new BadRequestException('mesFin no puede ser antes de mesInicio');
    return this.gastoPublico(g);
  }

  /** Borrar = archivar: se deja de ver desde ya, el historial queda. */
  async archivarGasto(usuarioId: string, gastoId: string) {
    const r = await this.gastos.updateOne(
      { _id: oid(gastoId), usuarioId: oid(usuarioId) },
      { $set: { archivado: true } },
    );
    if (!r.matchedCount) throw new NotFoundException();
    return { ok: true };
  }

  private async gastoDe(usuarioId: string, gastoId: string) {
    const g = await this.gastos
      .findOne({
        _id: oid(gastoId),
        usuarioId: oid(usuarioId),
        archivado: false,
      })
      .lean();
    if (!g) throw new NotFoundException();
    return g;
  }

  /** Cambia el monto de un gasto solo en un mes (null vuelve al monto normal). */
  async montoDelMes(
    usuarioId: string,
    gastoId: string,
    mes: string,
    monto: number | null,
  ) {
    const g = await this.gastoDe(usuarioId, gastoId);
    await this.meses.updateOne(
      { gastoId: g._id, mes },
      {
        $set: { montoDelMes: monto },
        $setOnInsert: { usuarioId: g.usuarioId },
      },
      { upsert: true },
    );
    return { ok: true };
  }

  /** Marca pagado y descuenta del saldo: el balance no se mueve. */
  async pagar(usuarioId: string, gastoId: string, mes: string) {
    if (mes < mesDe(this.hoy()))
      throw new BadRequestException('No se pagan meses pasados');
    const g = await this.gastoDe(usuarioId, gastoId);
    if (g.tipo === 'reserva')
      throw new BadRequestException('Las reservas se usan cargando usos');
    const estado = await this.meses.findOne({ gastoId: g._id, mes }).lean();
    if (estado?.pagado) throw new ConflictException('Ya estaba pagado');
    const monto = estado?.montoDelMes ?? g.monto;
    const r = await this.meses.updateOne(
      { gastoId: g._id, mes, pagado: { $ne: true } },
      {
        $set: { pagado: true, pagadoEn: new Date(), montoPagado: monto },
        $setOnInsert: { usuarioId: g.usuarioId },
      },
      { upsert: true },
    );
    if (!r.modifiedCount && !r.upsertedCount)
      throw new ConflictException('Ya estaba pagado');
    await this.usuarios.updateOne(
      { _id: g.usuarioId },
      { $inc: { saldo: -monto } },
    );
    return this.perfil(usuarioId);
  }

  /** Desmarca un pago y devuelve al saldo lo que se había descontado. */
  async despagar(usuarioId: string, gastoId: string, mes: string) {
    const g = await this.gastoDe(usuarioId, gastoId);
    const estado = await this.meses.findOneAndUpdate(
      { gastoId: g._id, mes, pagado: true },
      { $set: { pagado: false, pagadoEn: null, montoPagado: 0 } },
    );
    if (!estado) throw new ConflictException('No estaba pagado');
    await this.usuarios.updateOne(
      { _id: g.usuarioId },
      { $inc: { saldo: estado.montoPagado } },
    );
    return this.perfil(usuarioId);
  }

  // ---- Reservas ----

  async agregarUso(
    usuarioId: string,
    gastoId: string,
    mes: string,
    monto: number,
    nota: string,
  ) {
    const g = await this.gastoDe(usuarioId, gastoId);
    if (g.tipo !== 'reserva')
      throw new BadRequestException('Solo las reservas tienen usos');
    const uso = await this.usos.create({
      usuarioId: g.usuarioId,
      gastoId: g._id,
      mes,
      monto,
      nota,
    });
    await this.usuarios.updateOne(
      { _id: g.usuarioId },
      { $inc: { saldo: -monto } },
    );
    return { id: uso.id, gastoId, mes, monto, nota };
  }

  async listarUsos(usuarioId: string, gastoId: string, mes: string) {
    const lista = await this.usos
      .find({ usuarioId: oid(usuarioId), gastoId: oid(gastoId), mes })
      .sort({ createdAt: -1 })
      .lean();
    return lista.map((u) => ({
      id: String(u._id),
      gastoId,
      mes: u.mes,
      monto: u.monto,
      nota: u.nota,
    }));
  }

  async borrarUso(usuarioId: string, usoId: string) {
    const uso = await this.usos.findOneAndDelete({
      _id: oid(usoId),
      usuarioId: oid(usuarioId),
    });
    if (!uso) throw new NotFoundException();
    await this.usuarios.updateOne(
      { _id: uso.usuarioId },
      { $inc: { saldo: uso.monto } },
    );
    return { ok: true };
  }

  // ---- Cálculo ----

  /**
   * Todo lo que el motor necesita, desde el mes actual. El front lo usa para calcular al
   * instante. Los usos traen también el mes anterior, para sugerir subir una reserva que
   * se pasó (M2); el motor solo mira los del mes que calcula.
   */
  async datos(usuarioId: string): Promise<Datos & { mesActual: string }> {
    const id = oid(usuarioId);
    const actual = mesDe(this.hoy());
    const [u, gastos, estados, usos] = await Promise.all([
      this.usuario(usuarioId),
      this.gastos.find({ usuarioId: id, archivado: false }).lean(),
      this.meses.find({ usuarioId: id, mes: { $gte: actual } }).lean(),
      this.usos
        .find({ usuarioId: id, mes: { $gte: sumarMeses(actual, -1) } })
        .lean(),
    ]);
    return {
      mesActual: actual,
      perfil: {
        saldo: u.saldo,
        ingresoMensual: u.ingresoMensual,
        ingresoCobradoMes: u.ingresoCobradoMes,
      },
      gastos: gastos.map((g) => this.gastoPublico(g)),
      estados: estados.map((e) => ({
        gastoId: String(e.gastoId),
        mes: e.mes,
        pagado: e.pagado,
        montoDelMes: e.montoDelMes,
      })),
      usos: usos.map((x) => ({
        gastoId: String(x.gastoId),
        mes: x.mes,
        monto: x.monto,
      })),
    };
  }

  async resumen(usuarioId: string, mes: string) {
    const r = resumenDelMes(await this.datos(usuarioId), this.hoy(), mes);
    if (!r) throw new BadRequestException('Los meses pasados no se proyectan');
    if (mes > sumarMeses(mesDe(this.hoy()), MESES_MAXIMOS))
      throw new BadRequestException(`Hasta ${MESES_MAXIMOS} meses adelante`);
    return r;
  }

  async proyeccion(usuarioId: string, hasta: string) {
    const tope = sumarMeses(mesDe(this.hoy()), MESES_MAXIMOS);
    const resumenes = proyectar(
      await this.datos(usuarioId),
      this.hoy(),
      hasta > tope ? tope : hasta,
    );
    return resumenes.map(
      ({ mes, inicio, ingreso, totalPendiente, balance }) => ({
        mes,
        inicio,
        ingreso,
        totalPendiente,
        balance,
      }),
    );
  }

  // ---- Ayudantes ----

  private async usuario(usuarioId: string) {
    const u = await this.usuarios.findById(oid(usuarioId));
    if (!u) throw new UnauthorizedException();
    return u;
  }

  private perfilPublico(u: Usuario & { _id: unknown }) {
    return {
      id: String(u._id),
      email: u.email,
      nombre: u.nombre,
      moneda: u.moneda,
      saldo: u.saldo,
      ingresoMensual: u.ingresoMensual
        ? { monto: u.ingresoMensual.monto, diaCobro: u.ingresoMensual.diaCobro }
        : null,
      ingresoCobradoMes: u.ingresoCobradoMes,
    };
  }

  private gastoPublico(g: GastoDb & { _id: unknown }) {
    return {
      id: String(g._id),
      nombre: g.nombre,
      emoji: g.emoji,
      monto: g.monto,
      tipo: g.tipo as 'puntual' | 'fijo' | 'reserva',
      mesInicio: g.mesInicio,
      mesFin: g.mesFin,
      modoReserva: (g.modoReserva ?? undefined) as
        'proporcional' | 'manual' | undefined,
      recurrente: g.recurrente,
    };
  }
}
