import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

// Montos en centavos (enteros) y meses 'AAAA-MM'. Ver proyecto/README.md.

@Schema({ _id: false })
export class IngresoMensual {
  @Prop({ required: true }) monto: number;
  @Prop({ required: true, min: 1, max: 31 }) diaCobro: number;
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
  @Prop({ default: 'USD', enum: ['USD', 'ARS'] }) moneda: string;
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
  @Prop({ default: false, index: true }) archivado: boolean;
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
