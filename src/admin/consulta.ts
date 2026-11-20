// Validación de las consultas de lectura que corre Claude sobre la base (POST /admin/consulta).
// El protocolo de Mongo no sale del entorno cloud, así que los datos se miran por acá.
// Solo lectura: nada que escriba ni que ejecute JavaScript en el servidor.

export type Operacion = 'colecciones' | 'find' | 'count' | 'aggregate';

export interface Consulta {
  operacion: Operacion;
  coleccion?: string;
  filtro: Record<string, unknown>;
  proyeccion?: Record<string, unknown>;
  orden?: Record<string, 1 | -1>;
  pipeline: Record<string, unknown>[];
  limite: number;
}

export const LIMITE_MAXIMO = 500;
const OPERACIONES: Operacion[] = ['colecciones', 'find', 'count', 'aggregate'];
// Etapas que escriben y operadores que ejecutan código en el servidor.
const PROHIBIDOS = new Set([
  '$out',
  '$merge',
  '$where',
  '$function',
  '$accumulator',
]);

export class ConsultaInvalida extends Error {}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Recorre el valor y falla si aparece una clave prohibida en cualquier nivel. */
export function revisarProhibidos(valor: unknown): void {
  if (Array.isArray(valor)) return valor.forEach(revisarProhibidos);
  if (!esObjeto(valor)) return;
  for (const [clave, v] of Object.entries(valor)) {
    if (PROHIBIDOS.has(clave))
      throw new ConsultaInvalida(`${clave} no está permitido`);
    revisarProhibidos(v);
  }
}

export function validarConsulta(body: unknown): Consulta {
  if (!esObjeto(body))
    throw new ConsultaInvalida('El cuerpo tiene que ser un objeto JSON');
  const operacion = body.operacion as Operacion;
  if (!OPERACIONES.includes(operacion)) {
    throw new ConsultaInvalida(
      `operacion tiene que ser una de: ${OPERACIONES.join(', ')}`,
    );
  }
  const consulta: Consulta = {
    operacion,
    filtro: {},
    pipeline: [],
    limite: 50,
  };
  if (operacion === 'colecciones') return consulta;

  const coleccion = body.coleccion;
  if (
    typeof coleccion !== 'string' ||
    !/^[a-zA-Z][\w.-]{0,63}$/.test(coleccion) ||
    coleccion.startsWith('system.')
  ) {
    throw new ConsultaInvalida('coleccion inválida');
  }
  consulta.coleccion = coleccion;

  if (body.filtro !== undefined) {
    if (!esObjeto(body.filtro))
      throw new ConsultaInvalida('filtro tiene que ser un objeto');
    consulta.filtro = body.filtro;
  }
  if (body.proyeccion !== undefined) {
    if (!esObjeto(body.proyeccion))
      throw new ConsultaInvalida('proyeccion tiene que ser un objeto');
    consulta.proyeccion = body.proyeccion;
  }
  if (body.orden !== undefined) {
    if (
      !esObjeto(body.orden) ||
      !Object.values(body.orden).every((v) => v === 1 || v === -1)
    ) {
      throw new ConsultaInvalida('orden tiene que ser un objeto de 1 / -1');
    }
    consulta.orden = body.orden as Record<string, 1 | -1>;
  }
  if (operacion === 'aggregate') {
    if (!Array.isArray(body.pipeline) || !body.pipeline.every(esObjeto)) {
      throw new ConsultaInvalida('pipeline tiene que ser una lista de etapas');
    }
    consulta.pipeline = body.pipeline;
  }
  if (body.limite !== undefined) {
    const n = Number(body.limite);
    if (!Number.isInteger(n) || n < 1)
      throw new ConsultaInvalida('limite tiene que ser un entero positivo');
    consulta.limite = Math.min(n, LIMITE_MAXIMO);
  }
  revisarProhibidos([consulta.filtro, consulta.proyeccion, consulta.pipeline]);
  return consulta;
}

// Consulta abierta (Fede, 20/11/2026): sin ADMIN_API_KEY, para leer desde la nube mientras la
// app está en desarrollo. Solo ve lo de las cuentas cuyo email (en sha256) está en
// CUENTAS_ABIERTAS: el filtro se fuerza a ese usuario, así que no expone a nadie más.
// Se apaga con CONSULTA_ABIERTA=0. Hay que sacarla antes de lanzar (backlog, tarea L14).
export const CUENTAS_ABIERTAS = new Set([
  '49c020ad2b87ae983de7a8e4aaf2cb90caf5d677e5aacaae38aea380df98b6f7',
]);
export const COLECCIONES_ABIERTAS = new Set([
  'usuarios',
  'gastos',
  'meses_gasto',
  'usos_reserva',
  'ingresos_extra',
  'cuentas',
  'suscripciones',
  'uso_ia',
  'bolsillos',
  'grupos_cajon',
  'movimientos_cajon',
  'comentarios',
]);
/** Etapas que leen otras colecciones o sacan el filtro del usuario de encima. */
const CRUZAN = new Set(['$lookup', '$unionWith', '$graphLookup', '$facet']);
/** Lo que nunca sale de usuarios, aunque sea la propia cuenta. */
export const OCULTOS_USUARIO = { hashClave: 0, recuperoHash: 0 };

export function validarAbierta(c: Consulta): void {
  if (c.operacion === 'colecciones') return;
  if (!COLECCIONES_ABIERTAS.has(c.coleccion!))
    throw new ConsultaInvalida(
      'coleccion no disponible en la consulta abierta',
    );
  const revisar = (v: unknown): void => {
    if (Array.isArray(v)) return v.forEach(revisar);
    if (!esObjeto(v)) return;
    for (const [k, x] of Object.entries(v)) {
      if (CRUZAN.has(k))
        throw new ConsultaInvalida(`${k} no está permitido acá`);
      revisar(x);
    }
  };
  revisar(c.pipeline);
}
