import Anthropic from '@anthropic-ai/sdk';
import { mesDe, sumarMeses, esMesValido } from '../motor';
import { GastoEntrada } from '../datos/validar';

// Asistente de carga (S3): Claude propone, la persona confirma con un toque. Acá van el
// prompt, las herramientas y la validación de lo que devuelve; nada de Nest ni Mongo.

export const MODELO_IA = 'claude-haiku-5-5';
/** USD por millón de tokens (entrada, salida) para el contador de gasto. */
export const PRECIOS: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
};

export interface MensajeChat {
  rol: 'usuario' | 'mona';
  texto: string;
}

/** Captura que manda la persona (premium): va solo con el último mensaje y no se guarda. */
export interface ImagenChat {
  tipo: 'image/jpeg' | 'image/png' | 'image/webp';
  datos: string;
}

/** Un CEDEAR de la captura del broker: cantidad si se ve; si no, lo que vale en pesos. */
export interface PosicionCartera {
  ticker: string;
  nombre: string;
  cantidad: number | null;
  valor: number | null;
}

export interface GastoContexto {
  id: string;
  nombre: string;
  emoji: string;
  tipo: string;
  monto: number;
  mesInicio: string;
  mesFin: string | null;
  pagadoEsteMes: boolean;
}

export type Propuesta =
  | { accion: 'crear_gasto'; gasto: GastoEntrada }
  | { accion: 'pagar'; gastoId: string; mes: string; nombre: string }
  | { accion: 'usar_reserva'; gastoId: string; monto: number; nota: string; nombre: string }
  | {
      accion: 'editar_gasto';
      gastoId: string;
      nombre: string;
      cambios: { nombre?: string; emoji?: string; monto?: number };
    }
  | { accion: 'monto_del_mes'; gastoId: string; mes: string; monto: number; nombre: string }
  | { accion: 'terminar_gasto'; gastoId: string; mesFin: string; nombre: string }
  | { accion: 'borrar_gasto'; gastoId: string; nombre: string }
  | { accion: 'cambiar_saldo'; saldo: number }
  | { accion: 'sumar_ingreso'; monto: number; detalle: string }
  | { accion: 'cambiar_ingreso'; monto: number; diaCobro: number }
  | { accion: 'cargar_cartera'; posiciones: PosicionCartera[] };

export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: 'crear_gasto',
    description:
      'Propone un gasto nuevo para que la persona lo confirme. Usala solo cuando tenés el monto. Para compras en cuotas: tipo "fijo", cantidad_meses = cuotas y monto_mensual = total / cuotas.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Corto, como lo diría la persona: "Campera", "Luz"' },
        emoji: { type: 'string', description: 'Un emoji que lo represente' },
        monto_mensual: { type: 'number', description: 'Monto de cada mes en la moneda de la persona (no centavos)' },
        tipo: {
          type: 'string',
          enum: ['puntual', 'fijo', 'reserva'],
          description: 'puntual = una vez; fijo = se repite cada mes; reserva = presupuesto para ir gastando (súper, nafta)',
        },
        mes_inicio: { type: 'string', description: 'AAAA-MM; por defecto el mes actual' },
        cantidad_meses: {
          type: ['integer', 'null'],
          description: 'Cuántos meses dura (cuotas). null = para siempre. Ignorado si es puntual',
        },
        modo_reserva: {
          type: ['string', 'null'],
          enum: ['proporcional', 'manual', null],
          description: 'Solo reservas: proporcional se consume solo con los días; manual se baja cargando usos',
        },
      },
      required: ['nombre', 'emoji', 'monto_mensual', 'tipo', 'mes_inicio', 'cantidad_meses', 'modo_reserva'],
      additionalProperties: false,
    },
  },
  {
    name: 'pagar_gasto',
    description: 'Propone marcar como pagado un gasto (no reserva) de la lista en un mes.',
    input_schema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        mes: { type: 'string', description: 'AAAA-MM' },
      },
      required: ['gasto_id', 'mes'],
      additionalProperties: false,
    },
  },
  {
    name: 'usar_reserva',
    description: 'Propone cargar un uso de una reserva de la lista (por ejemplo "gasté 30 de nafta").',
    input_schema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        monto: { type: 'number', description: 'En la moneda de la persona (no centavos)' },
        nota: { type: 'string' },
      },
      required: ['gasto_id', 'monto', 'nota'],
      additionalProperties: false,
    },
  },
  {
    name: 'editar_gasto',
    description:
      'Propone cambiar el nombre, el emoji o el monto de un gasto de la lista. Lo que no cambia va en null. Si cambia el monto de un gasto que se repite, al confirmar la app le pregunta a la persona si es solo este mes, de este mes en adelante o todos: no hace falta que lo preguntes vos. Si ya dijo que es solo un mes, usá monto_del_mes.',
    input_schema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        nombre: { type: ['string', 'null'] },
        emoji: { type: ['string', 'null'] },
        monto_mensual: { type: ['number', 'null'], description: 'En la moneda de la persona (no centavos)' },
      },
      required: ['gasto_id', 'nombre', 'emoji', 'monto_mensual'],
      additionalProperties: false,
    },
  },
  {
    name: 'monto_del_mes',
    description:
      'Propone un monto distinto solo para un mes de un gasto fijo o reserva ("este mes la luz vino 80"). Monto 0 = ese mes no se paga.',
    input_schema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        mes: { type: 'string', description: 'AAAA-MM' },
        monto: { type: 'number', description: 'En la moneda de la persona (no centavos); 0 para saltear el mes' },
      },
      required: ['gasto_id', 'mes', 'monto'],
      additionalProperties: false,
    },
  },
  {
    name: 'terminar_gasto',
    description:
      'Propone que un gasto que se repite deje de estar después de un mes ("dejo Netflix desde diciembre" = ultimo_mes noviembre).',
    input_schema: {
      type: 'object',
      properties: {
        gasto_id: { type: 'string' },
        ultimo_mes: { type: 'string', description: 'AAAA-MM: el último mes en que todavía está' },
      },
      required: ['gasto_id', 'ultimo_mes'],
      additionalProperties: false,
    },
  },
  {
    name: 'borrar_gasto',
    description:
      'Propone sacar un gasto de la lista por completo, también de los meses anteriores. Para un gasto de un solo mes, uno que todavía no empezó, o si la persona pide explícitamente borrar también lo pasado.',
    input_schema: {
      type: 'object',
      properties: { gasto_id: { type: 'string' } },
      required: ['gasto_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'cambiar_saldo',
    description: 'Propone corregir el saldo de hoy: la plata real que tiene en cuenta ahora.',
    input_schema: {
      type: 'object',
      properties: { saldo: { type: 'number', description: 'En la moneda de la persona (no centavos)' } },
      required: ['saldo'],
      additionalProperties: false,
    },
  },
  {
    name: 'sumar_ingreso',
    description:
      'Propone sumar al saldo una plata que entró aparte del ingreso mensual (una changa, un reintegro, un regalo, un aguinaldo). Para corregir el saldo usá cambiar_saldo.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'En la moneda de la persona (no centavos)' },
        detalle: { type: 'string', description: 'De dónde vino, corto: "Changa", "Aguinaldo"' },
      },
      required: ['monto'],
      additionalProperties: false,
    },
  },
  {
    name: 'cargar_cartera',
    description:
      'Propone cargar o actualizar los CEDEARs de la cartera de inversiones, casi siempre desde una captura del portafolio del broker (Invertir Online, Balanz, Cocos…). Una posición por ticker con lo que tiene HOY: si ya estaba en la cartera, se reemplaza la cantidad.',
    input_schema: {
      type: 'object',
      properties: {
        posiciones: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              ticker: { type: 'string', description: 'Símbolo del CEDEAR en BYMA, sin sufijo D ni C: SPY, GOOGL, MELI' },
              nombre: { type: 'string', description: 'Nombre corto: "S&P 500", "Google"' },
              cantidad: {
                type: ['integer', 'null'],
                description: 'Unidades que tiene (columna Cantidad o Nominales). null si en la captura no se ve',
              },
              valor_pesos: {
                type: ['number', 'null'],
                description: 'Valor actual de la posición en pesos, solo si no se ve la cantidad (la app la deduce con el precio de hoy)',
              },
            },
            required: ['ticker', 'nombre', 'cantidad', 'valor_pesos'],
            additionalProperties: false,
          },
        },
      },
      required: ['posiciones'],
      additionalProperties: false,
    },
  },
  {
    name: 'cambiar_ingreso',
    description: 'Propone cambiar el ingreso mensual (sueldo) y el día del mes en que cobra.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'En la moneda de la persona (no centavos)' },
        dia_cobro: { type: 'integer', description: '1 a 31' },
      },
      required: ['monto', 'dia_cobro'],
      additionalProperties: false,
    },
  },
];

export function promptSistema(p: {
  hoy: Date;
  moneda: string;
  idioma: string;
  nombre: string;
  gastos: GastoContexto[];
  saldo?: number;
  ingreso?: { monto: number; diaCobro: number } | null;
  cartera?: { ticker: string; cantidad: number }[];
}): string {
  const mes = mesDe(p.hoy);
  const lista = p.gastos.length
    ? p.gastos
        .map(
          (g) =>
            `- id=${g.id} | ${g.emoji} ${g.nombre} | ${g.tipo} | ${g.monto / 100} ${p.moneda} | desde ${g.mesInicio}${g.mesFin ? ` hasta ${g.mesFin}` : ''}${g.tipo !== 'reserva' ? (g.pagadoEsteMes ? ' | pagado este mes' : ' | sin pagar este mes') : ''}`,
        )
        .join('\n')
    : '(todavía no cargó gastos)';
  return `Sos Mona, la mona de Monasafer, una app de gastos previsorios: la persona carga los gastos que va a tener y la app le dice cuánto le sobra a fin de mes.
Tu trabajo: ayudar a cargar, editar, terminar y borrar gastos, marcarlos como pagados, cargar usos de reservas, corregir el saldo o el ingreso, sumar al saldo una plata que entró aparte del sueldo y cargar la cartera de inversiones (CEDEARs), con las herramientas. Las herramientas solo PROPONEN: la persona confirma con un botón, así que nunca digas que ya quedó guardado; decí algo como "¿lo agrego así?".
Reglas:
- Si falta un dato necesario (sobre todo el monto, o cuántas cuotas), preguntalo en una frase antes de proponer. No inventes montos.
- Cuotas: "6 cuotas" = gasto fijo de 6 meses; si te dan el total, monto_mensual = total / cuotas (redondeá a 2 decimales).
- Montos en ${p.moneda}, sin centavos de más. Mes actual: ${mes}. Fecha de hoy: ${p.hoy.toISOString().slice(0, 10)}.
- Para tocar un gasto que ya existe, elegilo de la lista por su id (buscalo por nombre aunque lo escriban distinto). Si hay dudas entre dos, preguntá.
- "Sacar" un gasto de un solo mes = borrar_gasto. Si se repite y quiere sacarlo solo de un mes = monto_del_mes con 0; desde un mes en adelante = terminar_gasto; del todo (también los meses pasados) = borrar_gasto.
- Si dice "borrá" o "sacá" un gasto que se repite y ya empezó antes de este mes, sin aclarar, lo más probable es que lo quiera terminar: terminar_gasto con ultimo_mes = el mes anterior (o este, si este mes ya lo pagó), así los meses pasados no quedan con información falsa. borrar_gasto solo si pide borrar todo.
- Si te mandan una captura: un ticket o factura es un gasto (crear_gasto, o usar_reserva si es de una reserva de la lista); un resumen de tarjeta puede tener varios gastos (proponé uno por cada consumo que valga la pena, las cuotas como fijo); el portafolio de un broker es cargar_cartera con todas las posiciones de CEDEARs que se vean. Leé los números con cuidado (en Argentina el punto separa miles y la coma, decimales). Si algo no se lee bien, decilo y preguntá en vez de inventar.
- Respuestas cortas, cálidas y con un toque de humor de mona, en ${p.idioma === 'en' ? 'inglés' : 'castellano rioplatense'}. Nada de consejos financieros ni temas ajenos a la app.
La persona se llama ${p.nombre || '(sin nombre)'}.${p.saldo !== undefined ? ` Saldo hoy: ${p.saldo / 100} ${p.moneda}.` : ''}${p.ingreso ? ` Ingreso: ${p.ingreso.monto / 100} ${p.moneda} por mes, cobra el día ${p.ingreso.diaCobro}.` : ''}
Sus gastos activos:
${lista}${p.cartera?.length ? `\nSu cartera de inversiones hoy: ${p.cartera.map((c) => `${c.ticker} ${c.cantidad}`).join(', ')}.` : ''}`;
}

/** Historial del chat → mensajes de la API: empieza con el usuario, alterna y termina con el usuario. */
export function mensajesApi(chat: MensajeChat[], imagen?: ImagenChat | null): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of chat.slice(-20)) {
    const role = m.rol === 'mona' ? 'assistant' : 'user';
    const texto = m.texto.slice(0, 1000).trim();
    if (!texto) continue;
    if (!out.length && role === 'assistant') continue;
    const ultimo = out[out.length - 1];
    if (ultimo && ultimo.role === role) ultimo.content = `${ultimo.content as string}\n${texto}`;
    else out.push({ role, content: texto });
  }
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  const ultimo = out[out.length - 1];
  if (imagen && ultimo)
    ultimo.content = [
      { type: 'image', source: { type: 'base64', media_type: imagen.tipo, data: imagen.datos } },
      { type: 'text', text: ultimo.content as string },
    ];
  return out;
}

const aCentavos = (n: unknown) =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 1e9
    ? Math.round(n * 100)
    : null;

/** Valida lo que pidió el modelo; lo que no cierra se descarta. */
export function interpretarHerramienta(
  nombre: string,
  entrada: unknown,
  gastos: GastoContexto[],
  hoy: Date,
): Propuesta | null {
  const e = (entrada ?? {}) as Record<string, unknown>;
  const actual = mesDe(hoy);
  if (nombre === 'crear_gasto') {
    const monto = aCentavos(e.monto_mensual);
    const tipoPedido = e.tipo as string;
    if (!monto || !['puntual', 'fijo', 'reserva'].includes(tipoPedido)) return null;
    const nombreGasto = typeof e.nombre === 'string' ? e.nombre.trim().slice(0, 80) : '';
    if (!nombreGasto) return null;
    let mesInicio =
      typeof e.mes_inicio === 'string' && esMesValido(e.mes_inicio) ? e.mes_inicio : actual;
    if (mesInicio < actual) mesInicio = actual;
    const n =
      typeof e.cantidad_meses === 'number' && Number.isInteger(e.cantidad_meses)
        ? Math.min(Math.max(e.cantidad_meses, 1), 120)
        : null;
    let tipo = tipoPedido as GastoEntrada['tipo'];
    if (tipo === 'fijo' && n === 1) tipo = 'puntual';
    const reserva = tipo === 'reserva';
    return {
      accion: 'crear_gasto',
      gasto: {
        nombre: nombreGasto,
        emoji: typeof e.emoji === 'string' ? e.emoji.slice(0, 16) : '',
        monto,
        tipo,
        mesInicio,
        mesFin: tipo === 'puntual' || n === null ? null : sumarMeses(mesInicio, n - 1),
        modoReserva: reserva ? (e.modo_reserva === 'manual' ? 'manual' : 'proporcional') : null,
        recurrente: reserva ? n !== 1 : false,
      },
    };
  }
  if (nombre === 'cambiar_saldo') {
    const n = e.saldo;
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) >= 1e11) return null;
    return { accion: 'cambiar_saldo', saldo: Math.round(n * 100) };
  }
  if (nombre === 'sumar_ingreso') {
    const monto = aCentavos(e.monto);
    if (!monto) return null;
    const detalle = typeof e.detalle === 'string' ? e.detalle.trim().slice(0, 120) : '';
    return { accion: 'sumar_ingreso', monto, detalle };
  }
  if (nombre === 'cambiar_ingreso') {
    const monto = aCentavos(e.monto);
    const dia = e.dia_cobro;
    if (!monto || typeof dia !== 'number' || !Number.isInteger(dia)) return null;
    return { accion: 'cambiar_ingreso', monto, diaCobro: Math.min(Math.max(dia, 1), 31) };
  }
  if (nombre === 'cargar_cartera') {
    const lista = Array.isArray(e.posiciones) ? e.posiciones.slice(0, 30) : [];
    const posiciones: PosicionCartera[] = [];
    for (const x of lista as Record<string, unknown>[]) {
      const ticker = typeof x?.ticker === 'string' ? x.ticker.trim().toUpperCase() : '';
      if (!/^[A-Z0-9.]{1,10}$/.test(ticker) || posiciones.some((p) => p.ticker === ticker)) continue;
      const cantidad =
        typeof x.cantidad === 'number' && Number.isInteger(x.cantidad) && x.cantidad >= 0 && x.cantidad < 1e9
          ? x.cantidad
          : null;
      const valor = cantidad === null ? aCentavos(x.valor_pesos) : null;
      if (cantidad === null && valor === null) continue;
      const nombreP = typeof x.nombre === 'string' && x.nombre.trim() ? x.nombre.trim().slice(0, 40) : ticker;
      posiciones.push({ ticker, nombre: nombreP, cantidad, valor });
    }
    return posiciones.length ? { accion: 'cargar_cartera', posiciones } : null;
  }
  const g = gastos.find((x) => x.id === e.gasto_id);
  if (!g) return null;
  if (nombre === 'editar_gasto') {
    const cambios: { nombre?: string; emoji?: string; monto?: number } = {};
    if (typeof e.nombre === 'string' && e.nombre.trim()) cambios.nombre = e.nombre.trim().slice(0, 80);
    if (typeof e.emoji === 'string' && e.emoji.trim()) cambios.emoji = e.emoji.trim().slice(0, 16);
    const monto = aCentavos(e.monto_mensual);
    if (monto) cambios.monto = monto;
    if (!Object.keys(cambios).length) return null;
    return { accion: 'editar_gasto', gastoId: g.id, nombre: g.nombre, cambios };
  }
  if (nombre === 'monto_del_mes') {
    const mes = typeof e.mes === 'string' && esMesValido(e.mes) ? e.mes : actual;
    const m = e.monto;
    if (typeof m !== 'number' || !Number.isFinite(m) || m < 0 || m >= 1e9) return null;
    if (g.tipo === 'puntual' || mes < actual || mes < g.mesInicio || (g.mesFin && mes > g.mesFin)) return null;
    return { accion: 'monto_del_mes', gastoId: g.id, mes, monto: Math.round(m * 100), nombre: g.nombre };
  }
  if (nombre === 'terminar_gasto') {
    const ultimo = typeof e.ultimo_mes === 'string' && esMesValido(e.ultimo_mes) ? e.ultimo_mes : null;
    if (!ultimo || g.tipo === 'puntual') return null;
    // Terminar antes de que empiece es lo mismo que borrarlo.
    if (ultimo < g.mesInicio) return { accion: 'borrar_gasto', gastoId: g.id, nombre: g.nombre };
    return { accion: 'terminar_gasto', gastoId: g.id, mesFin: ultimo, nombre: g.nombre };
  }
  if (nombre === 'borrar_gasto') return { accion: 'borrar_gasto', gastoId: g.id, nombre: g.nombre };
  if (nombre === 'pagar_gasto') {
    const mes = typeof e.mes === 'string' && esMesValido(e.mes) ? e.mes : actual;
    if (g.tipo === 'reserva' || mes < actual) return null;
    return { accion: 'pagar', gastoId: g.id, mes, nombre: g.nombre };
  }
  if (nombre === 'usar_reserva') {
    const monto = aCentavos(e.monto);
    if (!monto || g.tipo !== 'reserva') return null;
    const nota = typeof e.nota === 'string' ? e.nota.slice(0, 100) : '';
    return { accion: 'usar_reserva', gastoId: g.id, monto, nota, nombre: g.nombre };
  }
  return null;
}

/** Cliente de Claude; se reemplaza en los tests. */
export class ClienteIa {
  private cliente: Anthropic | null = null;

  configurado(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async preguntar(system: string, messages: Anthropic.MessageParam[]): Promise<Anthropic.Message> {
    this.cliente ??= new Anthropic();
    return this.cliente.messages.create({
      model: MODELO_IA,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system,
      tools: HERRAMIENTAS,
      tool_choice: { type: 'auto' },
      messages,
    });
  }
}
