import { Mes } from './tipos';

export function mesDe(fecha: Date): Mes {
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${fecha.getFullYear()}-${m}`;
}

export function sumarMeses(mes: Mes, n: number): Mes {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function diasDelMes(mes: Mes): number {
  const [a, m] = mes.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

export function esMesValido(mes: unknown): mes is Mes {
  return typeof mes === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}
