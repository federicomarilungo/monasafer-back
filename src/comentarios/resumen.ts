/**
 * Resumen semanal de comentarios y pedidos (Fede, 20/11/2026): los lunes a las 9 (hora
 * argentina) llega un email con lo que la gente mandó y sigue en estado "nuevo".
 * Funciones puras, para probar sin reloj ni base.
 */

const ARG = -3 * 60 * 60 * 1000; // Argentina no tiene horario de verano: UTC-3 fijo.
const SEMANA = 7 * 24 * 60 * 60 * 1000;
export const HORA_ENVIO = 9;

/**
 * El último lunes a las 9 de Argentina que ya pasó, como `AAAA-MM-DD` (la clave del envío)
 * y como fecha. Si hoy es lunes antes de las 9, es el de la semana anterior.
 */
export function turnoDe(ahora: Date): { clave: string; desde: Date } {
  const local = new Date(ahora.getTime() + ARG); // los getUTC* dan la hora argentina
  const diasDesdeLunes = (local.getUTCDay() + 6) % 7;
  const lunes = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - diasDesdeLunes,
    HORA_ENVIO,
  );
  let turno = lunes; // en "hora argentina como si fuera UTC"
  if (local.getTime() < turno) turno -= SEMANA;
  const desde = new Date(turno - ARG);
  return { clave: new Date(turno).toISOString().slice(0, 10), desde };
}

export interface ComentarioResumen {
  _id: unknown;
  tipo: string;
  texto: string;
  email: string;
  nombre?: string;
  pantalla?: string;
  createdAt?: Date;
}

const escapar = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const TITULO: Record<string, string> = {
  pedido: '🙋 Pedidos para inversiones',
  error: '🐛 Algo no anda',
  idea: '💡 Ideas',
  otro: '💬 Comentarios',
};

const fecha = (d?: Date) =>
  d
    ? new Date(d).toLocaleDateString('es-AR', {
        day: 'numeric',
        month: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
      })
    : '';

/**
 * Arma asunto y HTML con los pendientes (estado "nuevo"), agrupados por tipo. Marca con
 * "nuevo" los que llegaron en la última semana, para ver de un vistazo qué cambió.
 */
export function armarResumen(
  pendientes: ComentarioResumen[],
  semanaDesde: Date,
): { asunto: string; html: string; total: number; deLaSemana: number } {
  const nuevos = pendientes.filter(
    (c) => c.createdAt && new Date(c.createdAt) >= new Date(semanaDesde.getTime() - SEMANA),
  ).length;
  const total = pendientes.length;
  const asunto = total
    ? `🐒 Resumen semanal: ${total} pendiente${total === 1 ? '' : 's'}${nuevos ? ` (${nuevos} de esta semana)` : ''}`
    : '🐒 Resumen semanal: nada pendiente';

  const bloques = Object.keys(TITULO)
    .map((tipo) => {
      const delTipo = pendientes.filter((c) => c.tipo === tipo);
      if (!delTipo.length) return '';
      const items = delTipo
        .map((c) => {
          const reciente =
            c.createdAt && new Date(c.createdAt) >= new Date(semanaDesde.getTime() - SEMANA);
          const quien = c.nombre ? `${c.nombre} (${c.email})` : c.email;
          return `<li style="margin:0 0 12px">
<div style="white-space:pre-wrap;background:#fff6e5;padding:10px 14px;border-radius:12px">${escapar(c.texto)}</div>
<div style="color:#8a7a66;font-size:13px;margin-top:4px">${reciente ? '<b style="color:#2f9e6b">nuevo</b> · ' : ''}${escapar(quien)} · ${fecha(c.createdAt)}${c.pantalla ? ` · ${escapar(c.pantalla)}` : ''} · id ${String(c._id)}</div>
</li>`;
        })
        .join('');
      return `<h3 style="margin:20px 0 8px">${TITULO[tipo]} (${delTipo.length})</h3><ul style="list-style:none;padding:0;margin:0">${items}</ul>`;
    })
    .join('');

  const cuerpo = total
    ? `<p>Hay <b>${total}</b> comentario${total === 1 ? '' : 's'} sin revisar${nuevos ? `, ${nuevos} llegaron esta semana` : ''}.</p>${bloques}
<p style="color:#8a7a66;font-size:13px;margin-top:24px">Siguen acá hasta que pasen a estado "leido" o "hecho" en la colección <code>comentarios</code>.</p>`
    : '<p>Esta semana no llegó nada y no queda nada pendiente. Mona descansa. 🍌</p>';

  return {
    asunto,
    total,
    deLaSemana: nuevos,
    html: `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#2b2118">
<p style="font-size:40px;margin:0">🐒</p>
<h2 style="margin:4px 0 12px">Lo que mandó la gente</h2>${cuerpo}</div>`,
  };
}
