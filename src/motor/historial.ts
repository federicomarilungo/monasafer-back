import { sumarMeses } from './meses';
import { itemsPorGrupo, montoBase, vigente } from './balance';
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
  /** Solo grupos: los gastos de adentro. */
  items?: LineaHistorial[];
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
 *   haya marcado pagada; una proporcional se consumió entera (también los meses antes de
 *   `manualDesde`, si pasó de proporcional a manual);
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
    const vivos = datos.gastos.filter(
      (g) => vigente(g, mes) && !(g.mesArchivo && mes > g.mesArchivo),
    );
    const porGrupo = itemsPorGrupo(vivos, mes);
    const adentro = new Set([...porGrupo.values()].flat().map((g) => g.id));
    const gastos: LineaHistorial[] = [];
    for (const g of vivos) {
      if (adentro.has(g.id)) continue;
      const l = lineaHistorial(datos, g, mes);
      if (g.tipo === 'grupo') {
        // Un grupo cuenta lo que sumaron sus gastos, o lo estimado si era más.
        const items = (porGrupo.get(g.id) ?? [])
          .map((i) => lineaHistorial(datos, i, mes))
          .filter((i): i is LineaHistorial => !!i);
        const base = l?.monto ?? 0;
        const suma = items.reduce((s, i) => s + i.monto, 0);
        if (g.mesArchivo === mes && !l?.pagado && !items.length) continue;
        const monto = Math.max(base, suma);
        if (monto <= 0) continue;
        gastos.push({
          gastoId: g.id,
          nombre: g.nombre,
          emoji: g.emoji ?? '',
          tipo: g.tipo,
          monto,
          pagado: !!l?.pagado,
          items,
        });
        continue;
      }
      if (l) gastos.push(l);
    }
    meses.push({ mes, gastos, total: gastos.reduce((s, l) => s + l.monto, 0) });
  }
  return meses;
}

/** Un gasto en un mes pasado, o null si no cuenta (ver historial()). */
function lineaHistorial(
  datos: { estados: EstadoMes[]; usos: UsoReserva[] },
  g: GastoHistorial,
  mes: Mes,
): LineaHistorial | null {
  const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
  const pagado = !!estado?.pagado;
  const usado = datos.usos
    .filter((u) => u.gastoId === g.id && u.mes === mes)
    .reduce((s, u) => s + u.monto, 0);
  const monto =
    g.tipo === 'reserva' &&
    g.modoReserva === 'manual' &&
    !(g.manualDesde && mes < g.manualDesde) &&
    !pagado
      ? usado
      : (estado?.montoDelMes ?? montoBase(g, mes));
  if (g.tipo === 'grupo')
    return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji ?? '', tipo: g.tipo, monto, pagado };
  if (g.mesArchivo === mes && !pagado && !usado) return null;
  if (monto <= 0) return null;
  return { gastoId: g.id, nombre: g.nombre, emoji: g.emoji ?? '', tipo: g.tipo, monto, pagado };
}
