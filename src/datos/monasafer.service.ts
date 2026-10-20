import {
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Datos, mesDe, proyectar, resumenDelMes, sumarMeses } from '../motor';
import { hashClave, Tokens, verificarClave } from '../auth/tokens';
import { googleClientId, VerificadorGoogle } from '../auth/google';
import { Sesiones } from '../auth/usuario.guard';
import { Correo, emailRecupero, urlApp } from '../auth/correo';
import crypto from 'crypto';
import { GastoDb, MesGasto, UsoReservaDb, Usuario } from './esquemas';
import { GastoEntrada } from './validar';

const MESES_MAXIMOS = 24;

const sha256 = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex');

function oid(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
  return new Types.ObjectId(id);
}

@Injectable()
export class MonasaferService implements Sesiones {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(GastoDb.name) private readonly gastos: Model<GastoDb>,
    @InjectModel(MesGasto.name) private readonly meses: Model<MesGasto>,
    @InjectModel(UsoReservaDb.name) private readonly usos: Model<UsoReservaDb>,
    private readonly tokens: Tokens,
    private readonly google: VerificadorGoogle,
    private readonly correo: Correo,
  ) {}

  /** Cache corta de `sesionesDesde` para no ir a la base en cada request. */
  private readonly cacheSesiones = new Map<string, { desde: number; hasta: number }>();

  hoy(): Date {
    return new Date();
  }

  // ---- Usuarios y perfil ----

  async registrar(email: string, clave: string, nombre: string, idioma = 'es') {
    if (await this.usuarios.exists({ email }))
      throw new ConflictException('Ya hay una cuenta con ese email');
    const u = await this.usuarios.create({
      email,
      nombre,
      idioma,
      hashClave: hashClave(clave),
    });
    return { token: this.tokens.generar(u.id), perfil: this.perfilPublico(u) };
  }

  async login(email: string, clave: string) {
    const u = await this.usuarios.findOne({ email });
    if (u && !u.hashClave)
      throw new UnauthorizedException('Esta cuenta entra con Google');
    if (!u || !verificarClave(clave, u.hashClave!))
      throw new UnauthorizedException('Email o contraseña incorrectos');
    return { token: this.tokens.generar(u.id), perfil: this.perfilPublico(u) };
  }

  /**
   * Entrar con Google: busca la cuenta por `sub`, si no por email (y la vincula), si no la
   * crea. Al vincular una cuenta que tenía contraseña, la contraseña se borra y las
   * sesiones anteriores se cierran: el email de esa cuenta nunca se verificó, así que
   * pudo haberla creado otra persona para quedarse adentro cuando llegue el dueño.
   */
  async loginGoogle(credencial: string) {
    const clientId = googleClientId();
    if (!clientId)
      throw new ServiceUnavailableException('Login con Google no configurado');
    const g = await this.google.verificar(credencial, clientId);
    if (!g) throw new UnauthorizedException('No pudimos verificar tu cuenta de Google');
    let u = await this.usuarios.findOne({ googleSub: g.sub });
    let nuevo = false;
    if (!u) {
      const existente = await this.usuarios.findOne({ email: g.email });
      if (existente) {
        u = await this.usuarios.findByIdAndUpdate(
          existente._id,
          {
            $set: {
              googleSub: g.sub,
              hashClave: null,
              sesionesDesde: new Date(Math.floor(Date.now() / 1000) * 1000),
              ...(existente.nombre ? {} : { nombre: g.nombre }),
            },
          },
          { new: true },
        );
        this.cacheSesiones.delete(existente.id);
      } else {
        u = await this.usuarios.create({
          email: g.email,
          nombre: g.nombre,
          googleSub: g.sub,
        });
        nuevo = true;
      }
    }
    return {
      token: this.tokens.generar(u!.id),
      perfil: this.perfilPublico(u!),
      nuevo,
    };
  }

  /**
   * Manda el link de recupero si hay una cuenta con ese email. Responde lo mismo haya o no,
   * para no revelar qué emails están registrados. El código va después del `#`.
   */
  async olvideClave(email: string) {
    const u = await this.usuarios.findOne({ email });
    if (!u) return { ok: true };
    const codigo = crypto.randomBytes(32).toString('base64url');
    await this.usuarios.updateOne(
      { _id: u._id },
      {
        $set: {
          recuperoHash: sha256(codigo),
          recuperoVence: new Date(Date.now() + 60 * 60 * 1000),
        },
      },
    );
    await this.correo.enviar(
      u.email,
      'Cambiá tu contraseña de Monasafer',
      emailRecupero(`${urlApp()}/#recuperar=${codigo}`, u.nombre),
    );
    return { ok: true };
  }

  /** Usa el link: guarda la contraseña nueva, invalida el link y cierra las otras sesiones. */
  async recuperarClave(codigo: string, clave: string) {
    const u = await this.usuarios.findOneAndUpdate(
      { recuperoHash: sha256(codigo), recuperoVence: { $gt: new Date() } },
      {
        $set: {
          hashClave: hashClave(clave),
          recuperoHash: null,
          recuperoVence: null,
          sesionesDesde: new Date(Math.floor(Date.now() / 1000) * 1000),
        },
      },
      { new: true },
    );
    if (!u)
      throw new BadRequestException(
        'El link venció o ya se usó. Pedí uno nuevo.',
      );
    this.cacheSesiones.delete(u.id);
    return { token: this.tokens.generar(u.id), perfil: this.perfilPublico(u) };
  }

  /** Borra la cuenta y todo lo que cargó (Play lo exige). Para confirmar, el email de la cuenta. */
  async borrarCuenta(usuarioId: string, confirmacion: string) {
    const u = await this.usuario(usuarioId);
    if (confirmacion.trim().toLowerCase() !== u.email)
      throw new BadRequestException('Escribí tu email para confirmar');
    await Promise.all([
      this.gastos.deleteMany({ usuarioId: u._id }),
      this.meses.deleteMany({ usuarioId: u._id }),
      this.usos.deleteMany({ usuarioId: u._id }),
    ]);
    await this.usuarios.deleteOne({ _id: u._id });
    this.cacheSesiones.delete(u.id);
    console.log(`[cuenta] borrada ${u.id}`);
    return { ok: true };
  }

  async vigente(usuarioId: string, emitido: number): Promise<boolean> {
    const ahora = Date.now();
    let c = this.cacheSesiones.get(usuarioId);
    if (!c || c.hasta < ahora) {
      if (!Types.ObjectId.isValid(usuarioId)) return false;
      const u = await this.usuarios
        .findById(usuarioId, { sesionesDesde: 1 })
        .lean();
      if (!u) return false;
      c = { desde: u.sesionesDesde?.getTime() ?? 0, hasta: ahora + 60_000 };
      if (this.cacheSesiones.size > 5000) this.cacheSesiones.clear();
      this.cacheSesiones.set(usuarioId, c);
    }
    return emitido >= c.desde;
  }

  async perfil(usuarioId: string) {
    return this.perfilPublico(await this.usuario(usuarioId));
  }

  async actualizarPerfil(
    usuarioId: string,
    cambios: Partial<
      Pick<Usuario, 'nombre' | 'moneda' | 'idioma' | 'saldo' | 'ingresoMensual'>
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
      google: !!u.googleSub,
      moneda: u.moneda,
      idioma: u.idioma ?? 'es',
      premium: {
        activo: !!u.premiumHasta && u.premiumHasta.getTime() > Date.now(),
        hasta: u.premiumHasta ?? null,
      },
      usosGratis: {
        metricas: u.usosGratis?.metricas ?? 3,
        asistente: u.usosGratis?.asistente ?? 10,
      },
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
