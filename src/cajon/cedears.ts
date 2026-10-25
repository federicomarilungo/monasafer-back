import { Injectable } from '@nestjs/common';

// Precios de CEDEARs en pesos para la cartera de inversiones (pedido de Fede, 25/10/2026).
// Fuente: data912.com (gratis, sin clave, precios de BYMA con unos minutos de demora). Trae
// cada CEDEAR tres veces: en pesos (SPY), en dólar MEP (SPYD) y en cable (SPYC); nos
// quedamos con el de pesos y el front lo pasa a la moneda base con el MEP, como el resto.
// Fuera de horario es el último precio operado. Se cachea 20 minutos; si falla, la última
// buena.

export interface PreciosCedears {
  moneda: 'ARS';
  /** Centavos de peso por 1 CEDEAR. */
  precios: Record<string, number>;
  fecha: string;
}

const VEINTE_MINUTOS = 20 * 60 * 1000;

interface Fila {
  symbol?: unknown;
  c?: unknown;
  px_bid?: unknown;
  px_ask?: unknown;
}

const positivo = (n: unknown) => {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : null;
};

/** Último precio o, si no operó, el medio entre compra y venta. */
function precio(f: Fila): number | null {
  const ultimo = positivo(f.c);
  if (ultimo) return ultimo;
  const compra = positivo(f.px_bid);
  const venta = positivo(f.px_ask);
  return compra && venta ? (compra + venta) / 2 : null;
}

/** Arma la tabla en centavos y saca las versiones en dólares (SPYD, SPYC). */
export function leerCedears(filas: Fila[]): Record<string, number> {
  const pesos = new Map<string, number>();
  for (const f of filas) {
    const p = precio(f);
    if (typeof f.symbol === 'string' && p) pesos.set(f.symbol.toUpperCase(), p);
  }
  const precios: Record<string, number> = {};
  for (const [s, p] of pesos) {
    const base = pesos.get(s.slice(0, -1));
    // SPYD vale 1/1500 de SPY: es la misma especie en dólares. AMD, en cambio, no tiene "AM".
    if (/[CD]$/.test(s) && base && p < base / 100) continue;
    precios[s] = Math.round(p * 100);
  }
  return precios;
}

@Injectable()
export class FuenteCedears {
  private cache: PreciosCedears | null = null;
  private buscando: Promise<PreciosCedears | null> | null = null;

  async obtener(): Promise<PreciosCedears | null> {
    if (
      this.cache &&
      Date.now() - Date.parse(this.cache.fecha) < VEINTE_MINUTOS
    )
      return this.cache;
    this.buscando ??= this.buscar().finally(() => (this.buscando = null));
    return this.buscando;
  }

  private async buscar(): Promise<PreciosCedears | null> {
    try {
      const r = await fetch('https://data912.com/live/arg_cedears', {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`data912: ${r.status}`);
      const precios = leerCedears((await r.json()) as Fila[]);
      if (Object.keys(precios).length < 50)
        throw new Error('data912 trajo muy pocos CEDEARs');
      this.cache = { moneda: 'ARS', precios, fecha: new Date().toISOString() };
    } catch (e) {
      console.error('[cedears] no se pudieron leer, uso los últimos', e);
    }
    return this.cache;
  }
}
