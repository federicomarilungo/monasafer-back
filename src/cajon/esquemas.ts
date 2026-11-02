import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/** Los mercados de la cartera de inversiones (Fede: CEDEARs 25/10, acciones y cripto 02/11). */
export const MERCADOS_BOLSILLO = ['cedear', 'byma', 'usa', 'cripto'] as const;
export type MercadoBolsillo = (typeof MERCADOS_BOLSILLO)[number];

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
  /**
   * Cuánto vale 1 unidad, puesto a mano (centavos de `moneda`). Para lo que no tiene
   * cotización de mercado o si la persona prefiere su propio valor: manda sobre el mercado.
   */
  @Prop({
    type: { moneda: String, valor: Number, _id: false },
    default: null,
  })
  cotizacion: { moneda: string; valor: number } | null;
  /**
   * Inversiones (ver MERCADOS_BOLSILLO): la unidad es el ticker o el símbolo y se valúa
   * sola con el precio del día. 'cedear' (BYMA, pesos), 'byma' (acciones argentinas,
   * pesos), 'usa' (acciones de EE.UU., dólares) y 'cripto' (con /cajon/cotizaciones).
   */
  @Prop({ type: String, default: null, enum: [...MERCADOS_BOLSILLO, null] })
  mercado: MercadoBolsillo | null;
  /** "Sin asignar": adonde va lo que se ahorra sin elegir dónde (Omitir). Uno por usuario. */
  @Prop({ default: false }) generico: boolean;
  @Prop({ default: false }) archivado: boolean;
  /** Lugar en el cajón (lo elige la persona); empata por fecha de creación. */
  @Prop({ default: 0 }) orden: number;
  /** Grupo del cajón en el que está (ej. "Cartera IOL" con SPY y GOOGL adentro). */
  @Prop({ type: Types.ObjectId, default: null }) grupoId: Types.ObjectId | null;
}
export const BolsilloSchema = SchemaFactory.createForClass(Bolsillo);
BolsilloSchema.index(
  { usuarioId: 1, generico: 1 },
  { unique: true, partialFilterExpression: { generico: true } },
);

/**
 * Grupo del cajón (Fede, 2/11): junta bolsillos, sobre todo inversiones ("Cartera IOL" con
 * los índices adentro). No guarda plata: vale lo que sumen sus bolsillos. Comparte el orden
 * con los bolsillos sueltos.
 */
@Schema({ collection: 'grupos_cajon', timestamps: true })
export class GrupoCajon {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  usuarioId: Types.ObjectId;
  @Prop({ required: true, trim: true }) nombre: string;
  @Prop({ default: '' }) emoji: string;
  @Prop({ default: 0 }) orden: number;
}
export const GrupoCajonSchema = SchemaFactory.createForClass(GrupoCajon);

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
