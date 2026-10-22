import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// Montos en centavos (enteros) y meses 'AAAA-MM'. Ver proyecto/README.md.

@Schema({ _id: false })
export class IngresoMensual {
  @Prop({ required: true }) monto: number;
  @Prop({ required: true, min: 1, max: 31 }) diaCobro: number;
}

export const MONEDAS = ['USD', 'ARS', 'EUR', 'MXN', 'CLP', 'COP', 'UYU', 'PEN', 'BRL'];
export const IDIOMAS = ['es', 'en'];

/** Usos gratis de lo premium que le quedan a quien no paga (S1). */
@Schema({ _id: false })
export class UsosGratis {
  @Prop({ default: 3 }) metricas: number;
  @Prop({ default: 10 }) asistente: number;
}

@Schema({ collection: 'usuarios', timestamps: true })
export class Usuario {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;
  /** null = la cuenta entra solo con Google. */
  @Prop({ type: String, default: null }) hashClave: string | null;
  /** `sub` de la cuenta de Google vinculada. */
  @Prop({ type: String, default: null }) googleSub: string | null;
  /** Los tokens emitidos antes de esta fecha no valen (al vincular Google a una cuenta con contraseña). */
  @Prop({ type: Date, default: null }) sesionesDesde: Date | null;
  /** sha256 del código del último link de recupero, y hasta cuándo vale. */
  @Prop({ type: String, default: null }) recuperoHash: string | null;
  @Prop({ type: Date, default: null }) recuperoVence: Date | null;
  @Prop({ default: '' }) nombre: string;
  @Prop({ default: 'USD', enum: MONEDAS }) moneda: string;
  @Prop({ default: 'es', enum: IDIOMAS }) idioma: string;
  /** Premium vale hasta esta fecha (la renueva cada pago de la suscripción). */
  @Prop({ type: Date, default: null }) premiumHasta: Date | null;
  @Prop({ type: SchemaFactory.createForClass(UsosGratis), default: () => ({}) })
  usosGratis: UsosGratis;
  @Prop({ default: 0 }) saldo: number;
  @Prop({ type: SchemaFactory.createForClass(IngresoMensual), default: null })
  ingresoMensual: IngresoMensual | null;
  @Prop({ type: String, default: null }) ingresoCobradoMes: string | null;
}
export type UsuarioDoc = HydratedDocument<Usuario>;
export const UsuarioSchema = SchemaFactory.createForClass(Usuario);
UsuarioSchema.index(
  { googleSub: 1 },
  { unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } },
);

@Schema({ collection: 'gastos', timestamps: true })
export class GastoDb {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true, trim: true }) nombre: string;
  @Prop({ default: '' }) emoji: string;
  @Prop({ required: true }) monto: number;
  @Prop({ required: true, enum: ['puntual', 'fijo', 'reserva'] }) tipo: string;
  @Prop({ required: true }) mesInicio: string;
  @Prop({ type: String, default: null }) mesFin: string | null;
  @Prop({ type: String, default: null, enum: ['proporcional', 'manual', null] })
  modoReserva: string | null;
  @Prop({ default: false }) recurrente: boolean;
  /** Cambios de monto desde un mes (ver motor): editar no toca los meses anteriores. */
  @Prop({ type: [{ desde: String, monto: Number, _id: false }], default: [] })
  cambiosMonto: { desde: string; monto: number }[];
  @Prop({ default: false, index: true }) archivado: boolean;
  /** Cuándo se archivó, para el historial. Los viejos no lo tienen: se usa updatedAt. */
  @Prop({ type: Date, default: null }) archivadoEn: Date | null;
}
export type GastoDoc = HydratedDocument<GastoDb>;
export const GastoSchema = SchemaFactory.createForClass(GastoDb);

@Schema({ collection: 'meses_gasto', timestamps: true })
export class MesGasto {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) gastoId: Types.ObjectId;
  @Prop({ required: true }) mes: string;
  @Prop({ default: false }) pagado: boolean;
  @Prop({ type: Date, default: null }) pagadoEn: Date | null;
  /** Monto descontado del saldo al pagar (para devolverlo si se desmarca). */
  @Prop({ default: 0 }) montoPagado: number;
  @Prop({ type: Number, default: null }) montoDelMes: number | null;
}
export const MesGastoSchema = SchemaFactory.createForClass(MesGasto);
MesGastoSchema.index({ gastoId: 1, mes: 1 }, { unique: true });

@Schema({ collection: 'usos_reserva', timestamps: true })
export class UsoReservaDb {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) gastoId: Types.ObjectId;
  @Prop({ required: true }) mes: string;
  @Prop({ required: true }) monto: number;
  @Prop({ default: '' }) nota: string;
}
export const UsoReservaSchema = SchemaFactory.createForClass(UsoReservaDb);

/** Suscripción premium pagada por la web (S8). Una por cada intento de suscribirse. */
@Schema({ collection: 'suscripciones', timestamps: true })
export class Suscripcion {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true, default: 'mercadopago' }) proveedor: string;
  @Prop({ type: String, default: null, index: true }) externoId: string | null;
  /** Plan de MP que se creó para esta persona; la suscripción nace de ahí. */
  @Prop({ type: String, default: null, index: true }) planId: string | null;
  /** pending · authorized · paused · cancelled (los de Mercado Pago). */
  @Prop({ default: 'pending' }) estado: string;
  @Prop({ required: true }) monto: number;
  @Prop({ required: true }) moneda: string;
  @Prop({ type: Date, default: null }) proximoCobro: Date | null;
}
export const SuscripcionSchema = SchemaFactory.createForClass(Suscripcion);

/** Una llamada a la IA: tokens y costo estimado, para el tope diario (S3). */
@Schema({ collection: 'uso_ia', timestamps: true })
export class UsoIa {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true, index: true }) dia: string;
  @Prop({ required: true }) modelo: string;
  @Prop({ default: 0 }) entrada: number;
  @Prop({ default: 0 }) salida: number;
  @Prop({ default: 0 }) costoUsd: number;
}
export const UsoIaSchema = SchemaFactory.createForClass(UsoIa);
