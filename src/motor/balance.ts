import { diasDelMes, mesDe, sumarMeses } from './meses';
import { Datos, Gasto, LineaGasto, Mes, ResumenMes } from './tipos';

/** ¿El gasto se ve en ese mes? Los meses 'AAAA-MM' se comparan como texto. */
export function vigente(g: Gasto, mes: Mes): boolean {
  if (mes < g.mesInicio) return false;
  if (g.tipo === 'puntual') return mes === g.mesInicio;
  if (g.tipo === 'reserva' && !g.recurrente) return mes === g.mesInicio;
  // Un grupo dura como un fijo (la Visa de todos los meses, o `mesFin = mesInicio` si es de uno).
  return !g.mesFin || mes <= g.mesFin;
}

/** Monto de un gasto en un mes: el último cambio que ya rige, o el monto con que nació. */
export function montoBase(g: Gasto, mes: Mes): number {
  let vigenteDesde = '';
  let monto = g.monto;
  for (const c of g.cambiosMonto ?? [])
    if (c.desde <= mes && c.desde > vigenteDesde) {
      vigenteDesde = c.desde;
      monto = c.monto;
    }
  return monto;
}

/**
 * Lo que queda de una reserva. En el mes actual baja según el modo: proporcional a los
 * días que pasaron (a mitad de mes queda la mitad) o según los usos cargados. En un mes
 * futuro está entera.
 */
export function restanteReserva(
  monto: number,
  modo: Gasto['modoReserva'],
  usado: number,
  mes: Mes,
  hoy: Date,
): number {
  if (mes !== mesDe(hoy)) return Math.max(0, monto - usado);
  if (modo === 'manual') return Math.max(0, monto - usado);
  const dias = diasDelMes(mes);
  return Math.round((monto * (dias - hoy.getDate())) / dias);
}

function linea(datos: Datos, g: Gasto, mes: Mes, hoy: Date): LineaGasto {
  const estado = datos.estados.find((e) => e.gastoId === g.id && e.mes === mes);
  const monto = estado?.montoDelMes ?? montoBase(g, mes);
  const pagado = !!estado?.pagado;
  if (g.tipo !== 'reserva') {
    return {
      gastoId: g.id,
      nombre: g.nombre,
      tipo: g.tipo,
      monto,
      pagado,
      pendiente: pagado ? 0 : monto,
    };
  }
  const usado = datos.usos
    .filter((u) => u.gastoId === g.id && u.mes === mes)
    .reduce((s, u) => s + u.monto, 0);
  const pendiente = pagado
    ? 0
    : restanteReserva(monto, g.modoReserva, usado, mes, hoy);
  return {
    gastoId: g.id,
    nombre: g.nombre,
    tipo: g.tipo,
    monto,
    pagado,
    pendiente,
    usado,
  };
}

/**
 * Un grupo vale lo que suman sus gastos, o lo estimado si es más (la Visa que calculás en
 * 300 aunque llevás cargados 100). Lo que falta es eso menos lo que ya pagaste de adentro;
 * pagado entero, no falta nada (y sus gastos cuentan como pagados).
 */
export function lineaGrupo(
  g: LineaGasto,
  items: LineaGasto[],
): LineaGasto {
  const deAdentro = g.pagado
    ? items.map((i) => ({ ...i, pagado: true, pendiente: 0 }))
    : items;
  const sumaItems = items.reduce((s, i) => s + i.monto, 0);
  const pagadoItems = items.reduce((s, i) => s + (i.pagado ? i.monto : 0), 0);
  const monto = Math.max(g.monto, sumaItems);
  return {
    ...g,
    monto,
    pendiente: g.pagado ? 0 : monto - pagadoItems,
    items: deAdentro,
    sumaItems,
  };
}

/** Gastos que caen adentro de un grupo vigente ese mes, por id de grupo. */
export function itemsPorGrupo<G extends Gasto>(gastos: G[], mes: Mes): Map<string, G[]> {
  const grupos = new Set(
    gastos.filter((g) => g.tipo === 'grupo' && vigente(g, mes)).map((g) => g.id),
  );
  const porGrupo = new Map<string, G[]>();
  for (const g of gastos)
    if (g.grupoId && grupos.has(g.grupoId) && vigente(g, mes))
      porGrupo.set(g.grupoId, [...(porGrupo.get(g.grupoId) ?? []), g]);
  return porGrupo;
}

function lineas(datos: Datos, mes: Mes, hoy: Date): LineaGasto[] {
  const porGrupo = itemsPorGrupo(datos.gastos, mes);
  const adentro = new Set([...porGrupo.values()].flat().map((g) => g.id));
  return datos.gastos
    .filter((g) => vigente(g, mes) && !adentro.has(g.id))
    .map((g) => {
      const l = linea(datos, g, mes, hoy);
      if (g.tipo !== 'grupo') return l;
      const items = (porGrupo.get(g.id) ?? []).map((i) => linea(datos, i, mes, hoy));
      return lineaGrupo(l, items);
    });
}

/**
 * Proyección desde el mes actual hasta `hasta` (inclusive). El mes actual arranca con el
 * saldo real; cada mes siguiente arranca con el balance del anterior y suma el ingreso.
 * Lo pagado (y lo usado de una reserva) ya salió del saldo, por eso no se vuelve a restar.
 */
export function proyectar(datos: Datos, hoy: Date, hasta: Mes): ResumenMes[] {
  const actual = mesDe(hoy);
  const ingresoMensual = datos.perfil.ingresoMensual?.monto ?? 0;
  const resumenes: ResumenMes[] = [];
  let inicio = datos.perfil.saldo;
  for (let mes = actual; mes <= hasta; mes = sumarMeses(mes, 1)) {
    const yaCobrado =
      mes === actual && datos.perfil.ingresoCobradoMes === actual;
    const ingreso = yaCobrado ? 0 : ingresoMensual;
    const gastos = lineas(datos, mes, hoy);
    const totalPendiente = gastos.reduce((s, l) => s + l.pendiente, 0);
    const balance = inicio + ingreso - totalPendiente;
    resumenes.push({ mes, inicio, ingreso, gastos, totalPendiente, balance });
    inicio = balance;
  }
  return resumenes;
}

/** Resumen de un mes (actual o futuro). Un mes pasado devuelve null: ya no se proyecta. */
export function resumenDelMes(
  datos: Datos,
  hoy: Date,
  mes: Mes,
): ResumenMes | null {
  if (mes < mesDe(hoy)) return null;
  const proyeccion = proyectar(datos, hoy, mes);
  return proyeccion[proyeccion.length - 1];
}
