import { BadRequestException } from '@nestjs/common';
import { esMesValido } from '../motor';

// Validación a mano de lo que manda el front: chico, explícito y testeado.

type Obj = Record<string, unknown>;

export function objeto(body: unknown): Obj {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new BadRequestException('Se espera un objeto JSON');
  return body as Obj;
}

export function monto(v: unknown, campo = 'monto'): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1e13) {
    throw new BadRequestException(
      `${campo} tiene que ser un entero de centavos >= 0`,
    );
  }
  return v;
}

export function saldo(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || Math.abs(v) > 1e13) {
    throw new BadRequestException('saldo tiene que ser un entero de centavos');
  }
  return v;
}

export function mes(v: unknown, campo = 'mes'): string {
  if (!esMesValido(v))
    throw new BadRequestException(`${campo} tiene que ser AAAA-MM`);
  return v;
}

export function texto(
  v: unknown,
  campo: string,
  max = 80,
  requerido = true,
): string {
  if (v === undefined && !requerido) return '';
  if (typeof v !== 'string' || (requerido && !v.trim()) || v.length > max) {
    throw new BadRequestException(
      `${campo} tiene que ser un texto de hasta ${max} caracteres`,
    );
  }
  return v.trim();
}

export function email(v: unknown): string {
  const e = texto(v, 'email', 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new BadRequestException('email inválido');
  return e;
}

export function clave(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8 || v.length > 200) {
    throw new BadRequestException(
      'La contraseña tiene que tener entre 8 y 200 caracteres',
    );
  }
  return v;
}

export interface GastoEntrada {
  nombre: string;
  emoji: string;
  monto: number;
  tipo: 'puntual' | 'fijo' | 'reserva';
  mesInicio: string;
  mesFin: string | null;
  modoReserva: 'proporcional' | 'manual' | null;
  recurrente: boolean;
  cambiosMonto?: { desde: string; monto: number }[];
}

/** Cambios de monto desde un mes: uno por mes, ordenados. */
function cambiosMonto(v: unknown): { desde: string; monto: number }[] {
  if (!Array.isArray(v) || v.length > 120)
    throw new BadRequestException('cambiosMonto: lista de hasta 120 cambios');
  const porMes = new Map<string, number>();
  for (const c of v) {
    const o = objeto(c);
    porMes.set(mes(o.desde, 'cambiosMonto.desde'), monto(o.monto));
  }
  return [...porMes]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([desde, m]) => ({ desde, monto: m }));
}

/** Valida un gasto entero (alta) o parcial (edición, `parcial = true`). */
export function gasto(body: unknown, parcial = false): Partial<GastoEntrada> {
  const b = objeto(body);
  const out: Partial<GastoEntrada> = {};
  const tiene = (k: string) => b[k] !== undefined;
  if (!parcial || tiene('nombre')) out.nombre = texto(b.nombre, 'nombre');
  if (tiene('emoji')) out.emoji = texto(b.emoji, 'emoji', 16, false);
  if (!parcial || tiene('monto')) out.monto = monto(b.monto);
  if (!parcial || tiene('tipo')) {
    if (!['puntual', 'fijo', 'reserva'].includes(b.tipo as string))
      throw new BadRequestException('tipo: puntual, fijo o reserva');
    out.tipo = b.tipo as GastoEntrada['tipo'];
  }
  if (!parcial || tiene('mesInicio'))
    out.mesInicio = mes(b.mesInicio, 'mesInicio');
  if (tiene('mesFin'))
    out.mesFin = b.mesFin === null ? null : mes(b.mesFin, 'mesFin');
  // `modoReserva: null` es "no es reserva", igual que `mesFin: null`, y es lo que manda el
  // front cuando confirma un gasto propuesto por Mona. Vale lo mismo que no mandarlo: al
  // alta se normaliza más abajo según el tipo.
  if (tiene('modoReserva') && b.modoReserva !== null) {
    if (!['proporcional', 'manual'].includes(b.modoReserva as string))
      throw new BadRequestException('modoReserva: proporcional o manual');
    out.modoReserva = b.modoReserva as 'proporcional' | 'manual';
  }
  if (tiene('recurrente')) out.recurrente = b.recurrente === true;
  if (tiene('cambiosMonto')) out.cambiosMonto = cambiosMonto(b.cambiosMonto);
  if (!parcial) {
    if (out.tipo === 'reserva' && !out.modoReserva)
      out.modoReserva = 'proporcional';
    if (out.tipo !== 'reserva') out.modoReserva = null;
    if (out.tipo === 'puntual') out.mesFin = null;
  }
  if (out.mesFin && out.mesInicio && out.mesFin < out.mesInicio)
    throw new BadRequestException('mesFin no puede ser antes de mesInicio');
  return out;
}
