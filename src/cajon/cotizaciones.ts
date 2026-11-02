import { Injectable } from '@nestjs/common';

// Cotizaciones del día para valuar el cajón en una moneda base (pedido de Fede, 23/10/2026).
// Todo se expresa como "cuántas unidades de X compra 1 USD". Son tipos de cambio, no plata:
// el front redondea a centavos al convertir. Fuentes gratis y sin clave:
// - Monedas y cripto: Coinbase; si falla, open.er-api (monedas) y CoinGecko (las cripto
//   que ofrece el front).
// - Oro (XAU, onza troy): gold-api.com; si falla, CoinGecko (PAX Gold, 1 onza).
// - Las cripto más comunes de Binance (CRIPTO_BINANCE, Fede 02/11/2026) que no traiga
//   Coinbase (TRX, por ejemplo) salen de la API pública de datos de Binance, en USDT.
// - ARS: dólar MEP (dolarapi.com, venta), que es el que usa la gente para ahorrar.
// Se cachea una hora; si todo falla se devuelve la última buena.

export interface Cotizaciones {
  base: 'USD';
  /** Unidades de cada código por 1 USD (ARS 1550, EUR 0.89, BTC 0.0000122, XAU 0.000248). */
  porUsd: Record<string, number>;
  fecha: string;
}

const UNA_HORA = 60 * 60 * 1000;

/** Las cripto que ofrece el front, por id de CoinGecko (Coinbase ya trae cientos). */
const CRIPTO_RESPALDO: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  tether: 'USDT',
  'usd-coin': 'USDC',
  solana: 'SOL',
};

/**
 * Las cripto más comunes de Binance, que el front ofrece como inversión. Si Coinbase no
 * trae alguna, se completa con Binance. Las que la gente pida de más llegan como pedido.
 */
export const CRIPTO_BINANCE = [
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'DOGE',
  'ADA',
  'TRX',
  'TON',
  'AVAX',
  'LINK',
  'DOT',
  'SHIB',
  'LTC',
  'BCH',
  'POL',
  'UNI',
  'NEAR',
  'ATOM',
  'XLM',
  'SUI',
  'APT',
  'PEPE',
  'ARB',
];

async function json(url: string): Promise<unknown> {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

const positivo = (n: unknown) => {
  const x = Number(n);
  return Number.isFinite(x) && x > 0 ? x : null;
};

@Injectable()
export class FuenteCotizaciones {
  private cache: Cotizaciones | null = null;
  private buscando: Promise<Cotizaciones | null> | null = null;

  async obtener(): Promise<Cotizaciones | null> {
    if (this.cache && Date.now() - Date.parse(this.cache.fecha) < UNA_HORA)
      return this.cache;
    this.buscando ??= this.buscar().finally(() => (this.buscando = null));
    return this.buscando;
  }

  private async buscar(): Promise<Cotizaciones | null> {
    const porUsd: Record<string, number> = {};
    const anotar = (codigo: string, valor: unknown) => {
      const x = positivo(valor);
      if (x) porUsd[codigo.toUpperCase()] = x;
    };
    const [general, oro, mep] = await Promise.allSettled([
      this.monedasYCripto(),
      this.oroPorOnza(),
      json('https://dolarapi.com/v1/dolares/bolsa'),
    ]);
    if (general.status === 'fulfilled')
      for (const [k, v] of Object.entries(general.value)) anotar(k, v);
    const faltan = CRIPTO_BINANCE.filter((c) => !porUsd[c]);
    if (faltan.length)
      for (const [k, v] of Object.entries(await this.binance(faltan)))
        anotar(k, v);
    if (oro.status === 'fulfilled') anotar('XAU', 1 / oro.value);
    if (mep.status === 'fulfilled')
      anotar('ARS', (mep.value as { venta?: unknown }).venta);
    if (!porUsd.EUR) {
      console.error('[cotizaciones] no se pudieron leer', general, oro);
      return this.cache;
    }
    porUsd.USD = 1;
    this.cache = { base: 'USD', porUsd, fecha: new Date().toISOString() };
    return this.cache;
  }

  private async monedasYCripto(): Promise<Record<string, unknown>> {
    try {
      const r = (await json(
        'https://api.coinbase.com/v2/exchange-rates?currency=USD',
      )) as { data: { rates: Record<string, unknown> } };
      return r.data.rates;
    } catch (e) {
      console.error('[cotizaciones] Coinbase falló, uso los respaldos', e);
      const [fiat, precios] = await Promise.all([
        json('https://open.er-api.com/v6/latest/USD') as Promise<{
          rates: Record<string, unknown>;
        }>,
        json(
          `https://api.coingecko.com/api/v3/simple/price?ids=${Object.keys(CRIPTO_RESPALDO).join(',')}&vs_currencies=usd`,
        ).catch(() => ({})) as Promise<Record<string, { usd?: number }>>,
      ]);
      const cripto: Record<string, number> = {};
      for (const [id, codigo] of Object.entries(CRIPTO_RESPALDO)) {
        const usd = positivo(precios[id]?.usd);
        if (usd) cripto[codigo] = 1 / usd;
      }
      return { ...fiat.rates, ...cripto };
    }
  }

  /** Unidades por 1 USD de las cripto pedidas, con el precio en USDT de Binance. */
  private async binance(simbolos: string[]): Promise<Record<string, number>> {
    try {
      const pares = JSON.stringify(simbolos.map((s) => `${s}USDT`));
      const filas = (await json(
        `https://data-api.binance.vision/api/v3/ticker/price?symbols=${encodeURIComponent(pares)}`,
      )) as { symbol?: string; price?: unknown }[];
      const r: Record<string, number> = {};
      for (const f of filas) {
        const p = positivo(f.price);
        if (p && f.symbol?.endsWith('USDT')) r[f.symbol.slice(0, -4)] = 1 / p;
      }
      return r;
    } catch (e) {
      console.error('[cotizaciones] Binance falló', e);
      return {};
    }
  }

  /** USD por onza troy de oro. */
  private async oroPorOnza(): Promise<number> {
    try {
      const r = (await json('https://api.gold-api.com/price/XAU')) as {
        price?: unknown;
      };
      const p = positivo(r.price);
      if (p) return p;
      throw new Error('gold-api sin precio');
    } catch {
      const r = (await json(
        'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd',
      )) as { 'pax-gold'?: { usd?: unknown } };
      const p = positivo(r['pax-gold']?.usd);
      if (!p) throw new Error('sin precio del oro');
      return p;
    }
  }
}
