import { Injectable } from '@nestjs/common';

// Precios de la cartera de inversiones (CEDEARs: Fede, 25/10/2026; acciones argentinas y
// de EE.UU.: Fede, 02/11/2026). Fuente: data912.com (gratis, sin clave, unos minutos de
// demora). Cada mercado es una tabla entera que se cachea 20 minutos; si falla, la última
// buena. Las cripto no van acá: se valúan con /cajon/cotizaciones (Coinbase y Binance).
// - cedear: CEDEARs de BYMA en pesos. data912 trae cada uno tres veces: en pesos (SPY), en
//   dólar MEP (SPYD) y en cable (SPYC); nos quedamos con el de pesos y el front lo pasa a
//   la moneda base con el MEP, como el resto.
// - byma: acciones argentinas (panel general de BYMA) en pesos, sin las versiones en
//   dólares (GGALD).
// - usa: acciones y ADRs de EE.UU. (NYSE, Nasdaq) en dólares.

export const MERCADOS = ['cedear', 'byma', 'usa'] as const;
export type Mercado = (typeof MERCADOS)[number];

export interface PreciosMercado {
  moneda: 'ARS' | 'USD';
  /** Centavos de `moneda` por 1 unidad (acción o CEDEAR). */
  precios: Record<string, number>;
  fecha: string;
}

const FUENTES: Record<
  Mercado,
  { moneda: 'ARS' | 'USD'; urls: string[]; minimo: number; sinDolares: boolean }
> = {
  cedear: {
    moneda: 'ARS',
    urls: ['https://data912.com/live/arg_cedears'],
    minimo: 50,
    sinDolares: true,
  },
  byma: {
    moneda: 'ARS',
    urls: ['https://data912.com/live/arg_stocks'],
    minimo: 20,
    sinDolares: true,
  },
  usa: {
    moneda: 'USD',
    urls: [
      'https://data912.com/live/usa_stocks',
      'https://data912.com/live/usa_adrs',
    ],
    minimo: 200,
    sinDolares: false,
  },
};

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

/**
 * Arma la tabla en centavos. Con `sinDolares` saca las versiones en dólares de BYMA (SPYD,
 * SPYC, GGALD): valen 1/1000 de la especie en pesos. AMD, en cambio, no tiene "AM".
 */
export function leerPrecios(
  filas: Fila[],
  sinDolares = true,
): Record<string, number> {
  const tabla = new Map<string, number>();
  for (const f of filas) {
    const p = precio(f);
    if (typeof f.symbol === 'string' && p) tabla.set(f.symbol.toUpperCase(), p);
  }
  const precios: Record<string, number> = {};
  for (const [s, p] of tabla) {
    const base = tabla.get(s.slice(0, -1));
    if (sinDolares && /[CD]$/.test(s) && base && p < base / 100) continue;
    precios[s] = Math.round(p * 100);
  }
  return precios;
}

/** Los CEDEARs, como siempre. */
export const leerCedears = (filas: Fila[]) => leerPrecios(filas, true);

@Injectable()
export class FuenteMercados {
  private cache = new Map<Mercado, PreciosMercado>();
  private buscando = new Map<Mercado, Promise<PreciosMercado | null>>();

  async obtener(mercado: Mercado): Promise<PreciosMercado | null> {
    const c = this.cache.get(mercado);
    if (c && Date.now() - Date.parse(c.fecha) < VEINTE_MINUTOS) return c;
    let p = this.buscando.get(mercado);
    if (!p) {
      p = this.buscar(mercado).finally(() => this.buscando.delete(mercado));
      this.buscando.set(mercado, p);
    }
    return p;
  }

  private async buscar(mercado: Mercado): Promise<PreciosMercado | null> {
    const fuente = FUENTES[mercado];
    try {
      const tablas = await Promise.all(
        fuente.urls.map(async (url) => {
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) throw new Error(`data912 ${url}: ${r.status}`);
          return (await r.json()) as Fila[];
        }),
      );
      const precios = leerPrecios(tablas.flat(), fuente.sinDolares);
      if (Object.keys(precios).length < fuente.minimo)
        throw new Error(`data912 trajo muy pocos precios de ${mercado}`);
      this.cache.set(mercado, {
        moneda: fuente.moneda,
        precios,
        fecha: new Date().toISOString(),
      });
    } catch (e) {
      console.error(
        `[mercados] no se pudo leer ${mercado}, uso los últimos`,
        e,
      );
    }
    return this.cache.get(mercado) ?? null;
  }
}
