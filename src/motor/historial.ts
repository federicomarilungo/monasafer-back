import { sumarMeses } from './meses';
import { vigente } from './balance';
import { EstadoMes, Gasto, Mes, TipoGasto, UsoReserva } from './tipos';

/** Gasto con lo necesario para mirar meses pasados, archivados incluidos. */
export interface GastoHistorial extends Gasto {
  emoji?: string;
  /** Mes en que se archivó (borró). Sin valor: sigue activo. */
  mesArchivo?: Mes | null;
}

export interface LineaHistorial {
  gastoId: string;
  nombre: string;
  emoji: string;
  tipo: TipoGasto;
  monto: number;
  pagado: boolean;
}

export interface MesHistorial {
  mes: Mes;
  gastos: LineaHistorial[];
  total: number;
}

/**
 * Lo que se gastó en meses que ya pasaron. No hay saldo de esos meses (no se guarda),
 * así que solo se reconstruyen los gastos:
 * - cada gasto vigente en el mes, con el monto de ese mes si se cambió;
 * - una reserva manual cuenta lo usado (lo que no se usó quedó ahorrado), salvo que se
 *   haya marcado pagada; una proporcional se consumió entera;
 * - un gasto borrado cuenta hasta el mes anterior al borrado y, en el mes en que se
 *   borró, solo si se pagó o se usó (si no, probablemente se cargó por error).
 */
export function historial(
  datos: { gastos: GastoHistorial[]; estados: EstadoMes[]; usos: UsoReserva[] },
  desde: Mes,
  hasta: Mes,
): MesHistorial[] {
  const meses: MesHistorial[] = [];
  for (let mes = desde; mes <= hasta; mes = sumarMeses(mes, 1)) {
    const gastos: LineaHistorial[] = [];
    for (const g of datos.gastos) {
      if (!vigente(g, mes)) continue;
      if (g.mesArchivo && mes > g.mesArchivo) continue;
      const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
      const pagado = !!estado?.pagado;
      const usado = datos.usos
        .filter((u) => u.gastoId === g.id && u.mes === mes)
        .reduce((s, u) => s + u.monto, 0);
      if (g.mesArchivo === mes && !pagado && !usado) continue;
      const monto =
        g.tipo === 'reserva' && g.modoReserva === 'manual' && !pagado
          ? usado
          : (estado?.montoDelMes ?? g.monto);
      if (monto <= 0) continue;
      gastos.push({ gastoId: g.id, nombre: g.nombre, emoji: g.emoji ?? '', tipo: g.tipo, monto, pagado });
    }
    meses.push({ mes, gastos, total: gastos.reduce((s, l) => s + l.monto, 0) });
  }
  return meses;
}
