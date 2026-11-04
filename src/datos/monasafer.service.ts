import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Datos, historial, mesDe, montoBase, proyectar, resumenDelMes, sumarMeses } from '../motor';
import { hashClave, Tokens, verificarClave } from '../auth/tokens';
import { googleClientId, VerificadorGoogle } from '../auth/google';
import { Sesiones } from '../auth/usuario.guard';
import { Correo, emailRecupero, urlApp } from '../auth/correo';
import crypto from 'crypto';
import { Cuenta, GastoDb, IngresoExtraDb, MesGasto, UsoReservaDb, Usuario } from './esquemas';
import { GastoEntrada } from './validar';

const MESES_MAXIMOS = 24;

const sha256 = (s: string) =>
  crypto.createHash('sha256').update(s).digest('hex');

function oid(id: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
  return new Types.ObjectId(id);
}

/**
 * Fede (3/11): un gasto que sigue en los meses siguientes no entra en un grupo que termina
 * antes (el de "solo este mes"): el grupo tiene que existir esos meses también.
 */
function cabeEnGrupo(
  g: { tipo?: string; mesInicio?: string; mesFin?: string | null },
  grupo: { mesFin?: string | null },
) {
  if (!grupo.mesFin) return;
  const ultimo = g.tipo === 'puntual' ? g.mesInicio : g.mesFin;
  if (!ultimo || ultimo > grupo.mesFin)
    throw new BadRequestException(
      `El grupo termina en ${grupo.mesFin}: para meter un gasto que sigue después, el grupo tiene que existir esos meses también`,
    );
}

@Injectable()
export class MonasaferService implements Sesiones {
  constructor(
    @InjectModel(Usuario.name) private readonly usuarios: Model<Usuario>,
    @InjectModel(GastoDb.name) private readonly gastos: Model<GastoDb>,
    @InjectModel(MesGasto.name) private readonly meses: Model<MesGasto>,
    @InjectModel(UsoReservaDb.name) private readonly usos: Model<UsoReservaDb>,
    @InjectModel(IngresoExtraDb.name)
    private readonly ingresos: Model<IngresoExtraDb>,
    @InjectModel(Cuenta.name) private readonly cuentas: Model<Cuenta>,
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
      this.ingresos.deleteMany({ usuarioId: u._id }),
      this.cuentas.deleteMany({ usuarioId: u._id }),
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
      Pick<
        Usuario,
        | 'nombre'
        | 'moneda'
        | 'monedaCajon'
        | 'idioma'
        | 'saldo'
        | 'ingresoMensual'
        | 'nombreCuentaPrincipal'
      >
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

  /**
   * Plata que entró en cualquier momento del mes, aparte del ingreso mensual (un trabajo
   * extra, un reintegro, un regalo): se suma al saldo y queda anotada para poder deshacerla.
   * Con `cuentaId` entra a esa cuenta: `cantidad` en su moneda y `monto` lo mismo en la
   * moneda de la persona (lo pasa el front con la cotización del día, como en el cajón).
   */
  async agregarIngreso(
    usuarioId: string,
    monto: number,
    detalle: string,
    cuentaId: string | null = null,
    cantidad: number | null = null,
  ) {
    if (monto <= 0) throw new BadRequestException('monto tiene que ser mayor a 0');
    const u = await this.usuario(usuarioId);
    let cuenta: (Cuenta & { _id: Types.ObjectId }) | null = null;
    if (cuentaId) {
      cuenta = await this.cuentaDe(usuarioId, cuentaId);
      if (cuenta.moneda === u.moneda) cantidad = monto;
      if (!cantidad || cantidad <= 0)
        throw new BadRequestException('cantidad: lo que entró en la moneda de la cuenta');
    } else cantidad = null;
    const i = await this.ingresos.create({
      usuarioId: u._id,
      mes: mesDe(this.hoy()),
      monto,
      detalle,
      cuentaId: cuenta?._id ?? null,
      cantidad,
    });
    if (cuenta)
      await this.cuentas.updateOne({ _id: cuenta._id }, { $inc: { saldo: cantidad } });
    else await this.usuarios.updateOne({ _id: u._id }, { $inc: { saldo: monto } });
    return { ingreso: this.ingresoPublico(i), perfil: await this.perfil(usuarioId) };
  }

  async listarIngresos(usuarioId: string, mes: string) {
    const lista = await this.ingresos
      .find({ usuarioId: oid(usuarioId), mes })
      .sort({ createdAt: 1 })
      .lean();
    return lista.map((i) => this.ingresoPublico(i));
  }

  /** Borra un ingreso extra y se lo resta a la cuenta donde entró (el "Deshacer"). */
  async borrarIngreso(usuarioId: string, ingresoId: string) {
    const i = await this.ingresos.findOneAndDelete({
      _id: oid(ingresoId),
      usuarioId: oid(usuarioId),
    });
    if (!i) throw new NotFoundException();
    if (i.cuentaId)
      await this.cuentas.updateOne(
        { _id: i.cuentaId },
        { $inc: { saldo: -(i.cantidad ?? i.monto) } },
      );
    else
      await this.usuarios.updateOne(
        { _id: i.usuarioId },
        { $inc: { saldo: -i.monto } },
      );
    return { ok: true, perfil: await this.perfil(usuarioId) };
  }

  private ingresoPublico(i: {
    _id: Types.ObjectId;
    mes: string;
    monto: number;
    detalle?: string;
    cuentaId?: Types.ObjectId | null;
    cantidad?: number | null;
    createdAt?: Date;
  }) {
    return {
      id: String(i._id),
      mes: i.mes,
      monto: i.monto,
      detalle: i.detalle ?? '',
      cuentaId: i.cuentaId ? String(i.cuentaId) : null,
      cantidad: i.cantidad ?? null,
      creado: i.createdAt ?? null,
    };
  }

  // ---- Cuentas (el saldo repartido) ----

  async listarCuentas(usuarioId: string) {
    const lista = await this.cuentas
      .find({ usuarioId: oid(usuarioId), archivada: false })
      .sort({ createdAt: 1 })
      .lean();
    return lista.map((c) => this.cuentaPublica(c));
  }

  async crearCuenta(
    usuarioId: string,
    c: { nombre: string; emoji: string; moneda: string; saldo: number },
  ) {
    const u = await this.usuario(usuarioId);
    if ((await this.cuentas.countDocuments({ usuarioId: u._id, archivada: false })) >= 20)
      throw new BadRequestException('Hasta 20 cuentas');
    const creada = await this.cuentas.create({ ...c, usuarioId: u._id });
    return this.cuentaPublica(creada.toObject());
  }

  /** Cambia nombre, emoji, moneda o el saldo (corregirlo, como el saldo de la principal). */
  async editarCuenta(
    usuarioId: string,
    cuentaId: string,
    cambios: Partial<{ nombre: string; emoji: string; saldo: number; moneda: string }>,
  ) {
    const c = await this.cuentas.findOneAndUpdate(
      { _id: oid(cuentaId), usuarioId: oid(usuarioId), archivada: false },
      { $set: cambios },
      { new: true },
    );
    if (!c) throw new NotFoundException();
    return this.cuentaPublica(c.toObject());
  }

  /**
   * Se borra aunque tenga plata (Fede, 2/11): esa plata deja de contar en el saldo. El front
   * pide confirmar antes.
   */
  async archivarCuenta(usuarioId: string, cuentaId: string) {
    const c = await this.cuentaDe(usuarioId, cuentaId);
    await this.cuentas.updateOne({ _id: c._id }, { $set: { archivada: true } });
    return { ok: true };
  }

  /**
   * Pasa plata de una cuenta a otra ('principal' es `Usuario.saldo`). Entre monedas
   * distintas, `montoEntra` es lo que llegó (vendiste dólares a tal precio).
   */
  async traspasar(
    usuarioId: string,
    desde: string,
    hacia: string,
    monto: number,
    montoEntra: number | null,
  ) {
    if (desde === hacia) throw new BadRequestException('Elegí dos cuentas distintas');
    if (monto <= 0) throw new BadRequestException('monto tiene que ser mayor a 0');
    const u = await this.usuario(usuarioId);
    const de = desde === 'principal' ? null : await this.cuentaDe(usuarioId, desde);
    const a = hacia === 'principal' ? null : await this.cuentaDe(usuarioId, hacia);
    const monedaDe = de?.moneda ?? u.moneda;
    const monedaA = a?.moneda ?? u.moneda;
    const entra = monedaDe === monedaA ? monto : montoEntra;
    if (!entra || entra <= 0)
      throw new BadRequestException('montoEntra: lo que llegó en la otra moneda');
    const mover = (c: typeof de, delta: number) =>
      c
        ? this.cuentas.updateOne({ _id: c._id }, { $inc: { saldo: delta } })
        : this.usuarios.updateOne({ _id: u._id }, { $inc: { saldo: delta } });
    await mover(de, -monto);
    await mover(a, entra);
    return { ok: true };
  }

  private async cuentaDe(usuarioId: string, cuentaId: string) {
    const c = await this.cuentas
      .findOne({ _id: oid(cuentaId), usuarioId: oid(usuarioId), archivada: false })
      .lean();
    if (!c) throw new NotFoundException();
    return c;
  }

  /**
   * De dónde sale (o adónde vuelve) la plata de un pago o un uso: sin cuenta, la principal;
   * con cuenta, `cantidad` es lo mismo que `monto` en su moneda (el front lo convierte con la
   * cotización del día; en la misma moneda es el monto).
   */
  private async origenDelPago(
    usuarioId: string,
    monedaUsuario: string,
    cuentaId: string | null,
    monto: number,
    cantidad: number | null,
  ) {
    if (!cuentaId || cuentaId === 'principal') return { cuenta: null, cantidad: null };
    const cuenta = await this.cuentaDe(usuarioId, cuentaId);
    if (cuenta.moneda === monedaUsuario) cantidad = monto;
    if (cantidad == null || cantidad < 0 || (monto > 0 && cantidad === 0))
      throw new BadRequestException('cantidad: lo que sale en la moneda de la cuenta');
    return { cuenta, cantidad };
  }

  /** Suma (o resta, con delta negativo) a la cuenta, o a la principal si no hay. */
  private moverSaldo(
    usuarioId: Types.ObjectId,
    cuentaId: Types.ObjectId | null | undefined,
    delta: number,
  ) {
    return cuentaId
      ? this.cuentas.updateOne({ _id: cuentaId }, { $inc: { saldo: delta } })
      : this.usuarios.updateOne({ _id: usuarioId }, { $inc: { saldo: delta } });
  }

  private cuentaPublica(c: Cuenta & { _id: Types.ObjectId }) {
    return {
      id: String(c._id),
      nombre: c.nombre,
      emoji: c.emoji ?? '',
      moneda: c.moneda,
      saldo: c.saldo,
    };
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
    if (g.grupoId) cabeEnGrupo(g, await this.grupoDe(usuarioId, g.grupoId));
    const creado = await this.gastos.create({
      ...g,
      grupoId: g.grupoId ? oid(g.grupoId) : null,
      usuarioId: oid(usuarioId),
    });
    return this.gastoPublico(creado.toObject());
  }

  /** El grupo (ej. la Visa) en el que se quiere cargar un gasto: tiene que ser de la persona. */
  private async grupoDe(usuarioId: string, grupoId: string) {
    const grupo = await this.gastos
      .findOne({ _id: oid(grupoId), usuarioId: oid(usuarioId), archivado: false, tipo: 'grupo' })
      .lean();
    if (!grupo) throw new BadRequestException('grupoId: no es un grupo tuyo');
    return grupo;
  }

  async editarGasto(
    usuarioId: string,
    gastoId: string,
    cambios: Partial<GastoEntrada>,
  ) {
    // Pasar una reserva a "cargo cada uso" rige desde este mes: en el historial, los meses
    // anteriores siguen consumidos enteros (regla de Fede: editar no toca el pasado).
    const set: Record<string, unknown> = { ...cambios };
    if (cambios.grupoId !== undefined || cambios.tipo || cambios.mesFin !== undefined || cambios.tarjeta) {
      const antes = await this.gastoDe(usuarioId, gastoId);
      const tipo = cambios.tipo ?? antes.tipo;
      if (cambios.tarjeta && tipo !== 'grupo')
        throw new BadRequestException('Solo un grupo puede ser una tarjeta');
      if (tipo !== 'grupo') set.tarjeta = null;
      const grupoId = cambios.grupoId !== undefined ? cambios.grupoId : antes.grupoId;
      if (grupoId && (tipo === 'grupo' || tipo === 'reserva'))
        throw new BadRequestException('Un grupo o una reserva no van adentro de un grupo');
      if (grupoId && String(grupoId) === gastoId)
        throw new BadRequestException('Un gasto no va adentro de sí mismo');
      if (grupoId) {
        const grupo = await this.grupoDe(usuarioId, String(grupoId));
        cabeEnGrupo(
          {
            tipo,
            mesInicio: cambios.mesInicio ?? antes.mesInicio,
            mesFin: cambios.mesFin !== undefined ? cambios.mesFin : antes.mesFin,
          },
          grupo,
        );
      }
      if (cambios.grupoId) set.grupoId = oid(cambios.grupoId);
      // Un grupo que deja de serlo suelta sus gastos: siguen contando, sueltos.
      if (antes.tipo === 'grupo' && tipo !== 'grupo')
        await this.gastos.updateMany({ usuarioId: oid(usuarioId), grupoId: antes._id }, { $set: { grupoId: null } });
    }
    if (cambios.modoReserva) {
      const antes = await this.gastoDe(usuarioId, gastoId);
      if (cambios.modoReserva === 'manual' && antes.modoReserva !== 'manual') {
        const actual = mesDe(this.hoy());
        set.manualDesde = antes.mesInicio < actual ? actual : null;
      } else if (cambios.modoReserva !== 'manual') set.manualDesde = null;
    }
    const g = await this.gastos
      .findOneAndUpdate(
        { _id: oid(gastoId), usuarioId: oid(usuarioId), archivado: false },
        { $set: set },
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
    const cuando = this.hoy();
    const r = await this.gastos.updateOne(
      { _id: oid(gastoId), usuarioId: oid(usuarioId) },
      { $set: { archivado: true, archivadoEn: cuando } },
    );
    if (!r.matchedCount) throw new NotFoundException();
    // Borrar un grupo borra lo que tiene adentro (con la misma fecha, así Deshacer lo trae de vuelta).
    await this.gastos.updateMany(
      { usuarioId: oid(usuarioId), grupoId: oid(gastoId), archivado: false },
      { $set: { archivado: true, archivadoEn: cuando } },
    );
    return { ok: true };
  }

  /** Deshacer un borrado: el front lo ofrece unos segundos después de borrar. */
  async restaurarGasto(usuarioId: string, gastoId: string) {
    const g = await this.gastos
      .findOneAndUpdate(
        { _id: oid(gastoId), usuarioId: oid(usuarioId) },
        { $set: { archivado: false } },
        { new: true },
      )
      .lean();
    if (!g) throw new NotFoundException();
    if (g.tipo === 'grupo' && g.archivadoEn)
      await this.gastos.updateMany(
        { usuarioId: oid(usuarioId), grupoId: g._id, archivado: true, archivadoEn: g.archivadoEn },
        { $set: { archivado: false } },
      );
    return this.gastoPublico(g);
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

  /**
   * Marca pagado y descuenta del saldo: el balance no se mueve. Un grupo descuenta lo que le
   * falta (lo estimado o lo cargado, menos lo que ya se pagó de adentro) y cubre sus gastos;
   * un gasto de un grupo ya pagado entero no se paga de nuevo.
   */
  async pagar(
    usuarioId: string,
    gastoId: string,
    mes: string,
    cuentaId: string | null = null,
    cantidad: number | null = null,
  ) {
    if (mes < mesDe(this.hoy()))
      throw new BadRequestException('No se pagan meses pasados');
    const g = await this.gastoDe(usuarioId, gastoId);
    if (g.tipo === 'reserva')
      throw new BadRequestException('Las reservas se usan cargando usos');
    const estado = await this.meses.findOne({ gastoId: g._id, mes }).lean();
    if (estado?.pagado) throw new ConflictException('Ya estaba pagado');
    if (g.grupoId) {
      const grupo = await this.meses.findOne({ gastoId: g.grupoId, mes, pagado: true }).lean();
      if (grupo) throw new ConflictException('Ya pagaste el grupo entero');
      // Fede, 4/11: de una tarjeta se paga el total, no cada compra.
      if (await this.gastos.exists({ _id: g.grupoId, tarjeta: { $ne: null } }))
        throw new ConflictException('De una tarjeta se paga el total, no cada compra');
    }
    let monto = estado?.montoDelMes ?? montoBase(this.gastoPublico(g), mes);
    if (g.tipo === 'grupo') {
      const r = resumenDelMes(await this.datos(usuarioId), this.hoy(), mes);
      monto = r?.gastos.find((l) => l.gastoId === gastoId)?.pendiente ?? 0;
    }
    const u = await this.usuario(usuarioId);
    const origen = await this.origenDelPago(usuarioId, u.moneda, cuentaId, monto, cantidad);
    const r = await this.meses.updateOne(
      { gastoId: g._id, mes, pagado: { $ne: true } },
      {
        $set: {
          pagado: true,
          pagadoEn: new Date(),
          montoPagado: monto,
          cuentaId: origen.cuenta?._id ?? null,
          cantidadPagada: origen.cantidad,
        },
        $setOnInsert: { usuarioId: g.usuarioId },
      },
      { upsert: true },
    );
    if (!r.modifiedCount && !r.upsertedCount)
      throw new ConflictException('Ya estaba pagado');
    await this.moverSaldo(g.usuarioId, origen.cuenta?._id, -(origen.cantidad ?? monto));
    return this.perfil(usuarioId);
  }

  /** Desmarca un pago y devuelve al saldo lo que se había descontado. */
  async despagar(usuarioId: string, gastoId: string, mes: string) {
    const g = await this.gastoDe(usuarioId, gastoId);
    // Con el grupo pagado entero, lo que se pagó de adentro antes ya no está en lo que falta:
    // desmarcarlo devolvería plata sin volver a restarla.
    if (g.grupoId && (await this.meses.exists({ gastoId: g.grupoId, mes, pagado: true })))
      throw new ConflictException('El grupo está pagado entero: desmarcá primero el grupo');
    const estado = await this.meses.findOneAndUpdate(
      { gastoId: g._id, mes, pagado: true },
      {
        $set: {
          pagado: false,
          pagadoEn: null,
          montoPagado: 0,
          cuentaId: null,
          cantidadPagada: null,
        },
      },
    );
    if (!estado) throw new ConflictException('No estaba pagado');
    // Vuelve a la cuenta de donde salió (si la borraron, a la principal en su valor).
    const vuelve =
      estado.cuentaId && (await this.cuentas.exists({ _id: estado.cuentaId, archivada: false }))
        ? estado.cuentaId
        : null;
    await this.moverSaldo(
      g.usuarioId,
      vuelve,
      vuelve ? (estado.cantidadPagada ?? estado.montoPagado) : estado.montoPagado,
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
    cuentaId: string | null = null,
    cantidad: number | null = null,
  ) {
    const g = await this.gastoDe(usuarioId, gastoId);
    if (g.tipo !== 'reserva')
      throw new BadRequestException('Solo las reservas tienen usos');
    const u = await this.usuario(usuarioId);
    const origen = await this.origenDelPago(usuarioId, u.moneda, cuentaId, monto, cantidad);
    const uso = await this.usos.create({
      usuarioId: g.usuarioId,
      gastoId: g._id,
      mes,
      monto,
      nota,
      cuentaId: origen.cuenta?._id ?? null,
      cantidad: origen.cantidad,
    });
    await this.moverSaldo(g.usuarioId, origen.cuenta?._id, -(origen.cantidad ?? monto));
    return {
      id: uso.id,
      gastoId,
      mes,
      monto,
      nota,
      cuentaId: origen.cuenta ? String(origen.cuenta._id) : null,
    };
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
      cuentaId: u.cuentaId ? String(u.cuentaId) : null,
    }));
  }

  async borrarUso(usuarioId: string, usoId: string) {
    const uso = await this.usos.findOneAndDelete({
      _id: oid(usoId),
      usuarioId: oid(usuarioId),
    });
    if (!uso) throw new NotFoundException();
    const vuelve =
      uso.cuentaId && (await this.cuentas.exists({ _id: uso.cuentaId, archivada: false }))
        ? uso.cuentaId
        : null;
    await this.moverSaldo(uso.usuarioId, vuelve, vuelve ? (uso.cantidad ?? uso.monto) : uso.monto);
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
    const [u, gastos, estados, usos, ingresosExtra] = await Promise.all([
      this.usuario(usuarioId),
      this.gastos.find({ usuarioId: id, archivado: false }).lean(),
      this.meses.find({ usuarioId: id, mes: { $gte: actual } }).lean(),
      this.usos
        .find({ usuarioId: id, mes: { $gte: sumarMeses(actual, -1) } })
        .lean(),
      this.listarIngresos(usuarioId, actual),
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
      ingresosExtra,
    };
  }

  /**
   * Lo gastado en los últimos `meses` meses cerrados (sin el actual), con los gastos
   * borrados incluidos hasta que se borraron. Para las métricas: cuánto se ve lo decide
   * el front según premium, porque son datos de la misma persona.
   */
  async historial(usuarioId: string, meses: number) {
    const actual = mesDe(this.hoy());
    return this.historialEntre(usuarioId, sumarMeses(actual, -meses), sumarMeses(actual, -1));
  }

  /** Meses gratis hacia atrás en el calendario; con premium no hay tope (Fede, 2/11). */
  static readonly MESES_ATRAS_GRATIS = 3;

  /**
   * Un mes pasado para verlo en el calendario: lo gastado (como en el historial) y si hay
   * algún gasto que empezó antes, para saber si tiene sentido seguir para atrás. Hasta 3
   * meses atrás para todos; más allá, solo premium (403).
   */
  async mesPasado(usuarioId: string, mes: string) {
    const actual = mesDe(this.hoy());
    if (mes >= actual) throw new BadRequestException('mes tiene que ser un mes pasado');
    if (mes < sumarMeses(actual, -MonasaferService.MESES_ATRAS_GRATIS)) {
      const u = await this.usuarios.findById(oid(usuarioId), { premiumHasta: 1 }).lean();
      if (!u?.premiumHasta || u.premiumHasta.getTime() <= Date.now())
        throw new ForbiddenException('Ver más de 3 meses atrás es Premium');
    }
    const [[resumen], antes] = await Promise.all([
      this.historialEntre(usuarioId, mes, mes),
      this.gastos.exists({ usuarioId: oid(usuarioId), mesInicio: { $lt: mes } }),
    ]);
    return { ...resumen, hayAntes: !!antes };
  }

  private async historialEntre(usuarioId: string, desde: string, hasta: string) {
    const id = oid(usuarioId);
    const [gastos, estados, usos] = await Promise.all([
      this.gastos.find({ usuarioId: id, mesInicio: { $lte: hasta } }).lean(),
      this.meses.find({ usuarioId: id, mes: { $gte: desde, $lte: hasta } }).lean(),
      this.usos.find({ usuarioId: id, mes: { $gte: desde, $lte: hasta } }).lean(),
    ]);
    return historial(
      {
        gastos: gastos.map((g) => {
          const archivo = g.archivado
            ? (g.archivadoEn ?? (g as { updatedAt?: Date }).updatedAt ?? null)
            : null;
          return {
            ...this.gastoPublico(g),
            mesArchivo: archivo ? mesDe(new Date(archivo)) : null,
          };
        }),
        estados: estados.map((e) => ({
          gastoId: String(e.gastoId),
          mes: e.mes,
          pagado: e.pagado,
          montoDelMes: e.montoDelMes,
        })),
        usos: usos.map((x) => ({ gastoId: String(x.gastoId), mes: x.mes, monto: x.monto })),
      },
      desde,
      hasta,
    );
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
      monedaCajon: u.monedaCajon ?? u.moneda,
      nombreCuentaPrincipal: u.nombreCuentaPrincipal ?? '',
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
      tipo: g.tipo as 'puntual' | 'fijo' | 'reserva' | 'grupo',
      grupoId: g.grupoId ? String(g.grupoId) : null,
      ...(g.tipo === 'grupo' && g.tarjeta ? { tarjeta: g.tarjeta } : {}),
      mesInicio: g.mesInicio,
      mesFin: g.mesFin,
      modoReserva: (g.modoReserva ?? undefined) as
        'proporcional' | 'manual' | undefined,
      recurrente: g.recurrente,
      cambiosMonto: g.cambiosMonto ?? [],
      ...(g.manualDesde ? { manualDesde: g.manualDesde } : {}),
    };
  }
}
