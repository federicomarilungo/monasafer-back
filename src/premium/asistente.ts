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
  | { accion: 'usar_reserva'; gastoId: string; monto: number; nota: string; nombre: string };

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
];

export function promptSistema(p: {
  hoy: Date;
  moneda: string;
  idioma: string;
  nombre: string;
  gastos: GastoContexto[];
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
Tu trabajo: ayudar a cargar gastos, marcarlos como pagados y cargar usos de reservas, con las herramientas. Las herramientas solo PROPONEN: la persona confirma con un botón, así que nunca digas que ya quedó guardado; decí algo como "¿lo agrego así?".
Reglas:
- Si falta un dato necesario (sobre todo el monto, o cuántas cuotas), preguntalo en una frase antes de proponer. No inventes montos.
- Cuotas: "6 cuotas" = gasto fijo de 6 meses; si te dan el total, monto_mensual = total / cuotas (redondeá a 2 decimales).
- Montos en ${p.moneda}, sin centavos de más. Mes actual: ${mes}. Fecha de hoy: ${p.hoy.toISOString().slice(0, 10)}.
- Para pagar o usar una reserva, elegí el gasto de la lista por su id. Si hay dudas entre dos, preguntá.
- Respuestas cortas, cálidas y con un toque de humor de mona, en ${p.idioma === 'en' ? 'inglés' : 'castellano rioplatense'}. Nada de consejos financieros ni temas ajenos a la app.
La persona se llama ${p.nombre || '(sin nombre)'}. Sus gastos activos:
${lista}`;
}

/** Historial del chat → mensajes de la API: empieza con el usuario, alterna y termina con el usuario. */
export function mensajesApi(chat: MensajeChat[]): Anthropic.MessageParam[] {
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
  const g = gastos.find((x) => x.id === e.gasto_id);
  if (!g) return null;
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
