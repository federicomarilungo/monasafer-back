# monasafer-back — para la IA que trabaje en este repositorio

API de **Monasafer** (NestJS + MongoDB Atlas). La consume `monasafer-front` (HTML, CSS y JS
sin framework, con Vite). Este repo guarda además los documentos del proyecto entero en
[`proyecto/`](proyecto/): backlog, preguntas para Fede, infraestructura. Empezá por
[proyecto/README.md](proyecto/README.md).

## Qué es Monasafer

Gestión de gastos previsoria: tenés tu saldo (plata real en cuenta), cargás los gastos que
vas a tener y la app te dice cuánto te sobra a fin de mes. Eso es el ahorro. El personaje
es un mono que te cuida la plata. Reglas completas en `proyecto/README.md`.

## Reglas

1. **`main` es producción** (cuando exista la app de DO con `deploy_on_push`). Antes de
   pushear: `npx tsc --noEmit`, `npx jest` y `npm run build` tienen que pasar. Después:
   verificar en prod (skill `deploy-verificar`).
2. **Si un cambio toca back y front, primero el back**, retrocompatible.
3. **El balance no se guarda, se calcula** con el motor de `src/motor/` (funciones puras,
   sin Nest ni Mongo). Toda regla nueva de cálculo va ahí con su test en
   `balance.spec.ts`, con montos y fechas de casos reales.
4. **Montos en centavos (enteros)** y meses como texto `AAAA-MM`. Nunca floats para plata.
5. **Todo endpoint nace privado** (cuando exista el login, B2): cada usuario ve solo lo
   suyo; lo público se marca a propósito.
6. Documentos y commits en castellano rioplatense, con el porqué.

## Comandos

```bash
npm ci
npx tsc --noEmit
npx jest
npm run build
MONGO_URI=... npm run start:dev    # local, puerto 3001
```

Endpoints actuales: `GET /ping`, `GET /salud` (dice si la base está conectada) y
`POST /admin/consulta` (abajo). En prod todo cuelga de `/api`
(https://monasafer-4lh7x.ondigitalocean.app/api/...).

## Consultas a la base desde el entorno cloud

El protocolo de Mongo no sale del entorno cloud (solo HTTPS por proxy), así que Claude
mira los datos con `POST /api/admin/consulta` y el header `X-Admin-Key: $ADMIN_API_KEY`
(la misma clave en la app de DO y en el entorno cloud). Solo lectura: `colecciones`,
`find`, `count` y `aggregate`, hasta 500 documentos y 10 s; rechaza `$out`, `$merge`,
`$where`, `$function` y `$accumulator` (`src/admin/consulta.ts`). Cada consulta queda en
los logs de DO. Sin `ADMIN_API_KEY` (o con menos de 24 caracteres) responde 503.

```bash
curl -s -X POST https://monasafer-4lh7x.ondigitalocean.app/api/admin/consulta \
  -H "X-Admin-Key: $ADMIN_API_KEY" -H 'Content-Type: application/json' \
  -d '{"operacion":"find","coleccion":"gastos","filtro":{"tipo":"fijo"},"limite":20}'
```

Para algo que necesite escribir o acceso total: Remote Control en la PC de Fede, con
`mongosh` y su `MONGO_URI`, siempre con su OK.

Para probar con base sin tocar Atlas: `mongodb-memory-server`. Desde el entorno cloud
Atlas no se alcanza en forma directa (solo sale HTTPS por proxy).
