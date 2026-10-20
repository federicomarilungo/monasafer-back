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

Endpoints actuales: `GET /ping`, `GET /salud` (dice si la base está conectada).

Para probar con base sin tocar Atlas: `mongodb-memory-server`. Desde el entorno cloud
Atlas no se alcanza en forma directa (solo sale HTTPS por proxy).
