import { Datos, Mes, ResumenMes } from './tipos';

/**
 * Plata que salió del saldo hacia el cajón de bananas en un mes. `origen` dice de qué
 * parte del balance salió: del resultado del mes o de lo que venía de meses anteriores.
 */
export interface Ahorro {
  mes: Mes;
  monto: number;
  origen: 'mes' | 'acumulado';
}

export interface BalancePartido {
  /** Lo que da el mes solo: ingreso menos gastos del mes y lo ahorrado "del mes". */
  delMes: number;
  /** Lo que viene de antes (sobrantes de meses anteriores y ajustes de saldo). */
  acumulado: number;
  /** delMes + acumulado: el balance de siempre. */
  total: number;
}

/**
 * Parte el balance de un mes en dos. El del mes cuenta cada gasto entero (pagado o no) y
 * cada reserva entera o lo usado si se pasó, así pagar o usar no lo mueve. El acumulado es
 * lo que falta para llegar al balance: en un mes futuro, el balance del mes anterior.
 */
export function partirBalance(
  datos: Datos,
  r: ResumenMes,
  ahorros: Ahorro[] = [],
): BalancePartido {
  const ingreso = datos.perfil.ingresoMensual?.monto ?? 0;
  const gastos = r.gastos.reduce(
    (s, l) =>
      s + (l.tipo === 'reserva' ? Math.max(l.monto, l.usado ?? 0) : l.monto),
    0,
  );
  const ahorrado = ahorros
    .filter((a) => a.mes === r.mes && a.origen === 'mes')
    .reduce((s, a) => s + a.monto, 0);
  const delMes = ingreso - gastos - ahorrado;
  return { delMes, acumulado: r.balance - delMes, total: r.balance };
}
