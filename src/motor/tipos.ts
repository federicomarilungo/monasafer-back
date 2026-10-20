// Tipos del motor de cálculo. Montos en centavos (enteros) y meses como 'AAAA-MM'.

export type Mes = string;

export type TipoGasto = 'puntual' | 'fijo' | 'reserva';
export type ModoReserva = 'proporcional' | 'manual';

export interface Gasto {
  id: string;
  nombre: string;
  monto: number;
  tipo: TipoGasto;
  /** Mes en que se creó. Un puntual vive solo en este mes. */
  mesInicio: Mes;
  /** Último mes en que se ve un fijo (vencimiento). Sin valor: indefinido. */
  mesFin?: Mes | null;
  /** Solo reservas. Default: proporcional. */
  modoReserva?: ModoReserva;
  /** Las reservas se repiten todos los meses como un fijo si es true. */
  recurrente?: boolean;
}

/** Estado de un gasto en un mes puntual (meses_gasto). */
export interface EstadoMes {
  gastoId: string;
  mes: Mes;
  pagado: boolean;
  /** Si en ese mes el monto es distinto al del gasto. */
  montoDelMes?: number | null;
}

export interface UsoReserva {
  gastoId: string;
  mes: Mes;
  monto: number;
}

export interface Perfil {
  /** Plata real en cuenta hoy. */
  saldo: number;
  ingresoMensual?: { monto: number; diaCobro: number } | null;
  /** Último mes cuyo ingreso ya se sumó al saldo. */
  ingresoCobradoMes?: Mes | null;
}

export interface Datos {
  perfil: Perfil;
  gastos: Gasto[];
  estados: EstadoMes[];
  usos: UsoReserva[];
}

export interface LineaGasto {
  gastoId: string;
  nombre: string;
  tipo: TipoGasto;
  /** Monto del gasto en ese mes. */
  monto: number;
  pagado: boolean;
  /** Lo que todavía resta del balance (0 si está pagado). */
  pendiente: number;
  /** Solo reservas: lo usado en el mes. */
  usado?: number;
}

export interface ResumenMes {
  mes: Mes;
  /** Balance con que arranca el mes (para el actual, el saldo real). */
  inicio: number;
  /** Ingreso que se suma en el cálculo del mes (0 si ya se cobró). */
  ingreso: number;
  gastos: LineaGasto[];
  totalPendiente: number;
  /** Lo que sobra a fin de mes: el ahorro. */
  balance: number;
}
