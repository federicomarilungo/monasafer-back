import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

// Cajón de bananas: donde va lo que la persona ahorra. Cada bolsillo guarda su cantidad en
// su propia unidad (USD, BTC, gramos de oro…) como entero de unidades mínimas: 230 USD
// con 2 decimales es 23000; 0,0031 BTC con 8 es 310000. La cantidad no se guarda: es la
// suma de los movimientos, que son la auditoría de cómo cambió el ahorro.

@Schema({ collection: 'bolsillos', timestamps: true })
export class Bolsillo {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true, trim: true }) nombre: string;
  @Prop({ default: '' }) emoji: string;
  @Prop({ required: true, trim: true }) unidad: string;
  @Prop({ required: true, min: 0, max: 8 }) decimales: number;
  /** "Sin asignar": adonde va lo que se ahorra sin elegir dónde (Omitir). Uno por usuario. */
  @Prop({ default: false }) generico: boolean;
  @Prop({ default: false }) archivado: boolean;
}
export const BolsilloSchema = SchemaFactory.createForClass(Bolsillo);
BolsilloSchema.index(
  { usuarioId: 1, generico: 1 },
  { unique: true, partialFilterExpression: { generico: true } },
);

export const TIPOS_MOVIMIENTO = [
  'ahorro', // entra desde el saldo
  'retiro', // vuelve al saldo
  'gasto', // se usó el ahorro (no es un gasto de los meses)
  'ingreso', // apareció plata que no vino del saldo (intereses, regalo)
  'traspaso', // de un bolsillo a otro (dos movimientos con el mismo grupo)
] as const;

@Schema({ collection: 'movimientos_cajon', timestamps: true })
export class MovimientoCajon {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true })
  bolsilloId: Types.ObjectId;
  @Prop({ required: true, enum: TIPOS_MOVIMIENTO }) tipo: string;
  /** En unidades mínimas del bolsillo, con signo. */
  @Prop({ required: true }) cantidad: number;
  /** Centavos que se movieron en el saldo (ahorro: negativo, retiro: positivo). */
  @Prop({ default: 0 }) deltaSaldo: number;
  /** Ahorro: de qué parte del balance salió (ver motor/ahorro.ts). */
  @Prop({ type: String, default: null, enum: ['mes', 'acumulado', null] })
  origen: string | null;
  @Prop({ required: true }) mes: string;
  @Prop({ default: '' }) detalle: string;
  @Prop({ type: String, default: null }) grupo: string | null;
}
export const MovimientoCajonSchema =
  SchemaFactory.createForClass(MovimientoCajon);
