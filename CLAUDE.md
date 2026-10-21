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

## API

Sin `MONGO_URI` la API levanta solo con `GET /ping`, `GET /salud` y `POST /admin/consulta`
(`AppModule.crear()`). Con base suma `DatosModule` (`src/datos/`):

| Endpoint | Qué hace |
|---|---|
| `POST /auth/registro`, `POST /auth/login` (públicos) | `{email, clave, nombre?}` → `{token, perfil}`. Token JWT de 30 días firmado con `AUTH_SECRET` |
| `POST /auth/google` (público) | `{credencial}` (ID token del botón de Google) → `{token, perfil, nuevo}`. Verifica con `google-auth-library` contra el Client ID; busca por `googleSub`, si no por email (vincula, borra la contraseña y cierra sesiones viejas con `sesionesDesde`), si no crea la cuenta. Sin Firebase |
| `POST /auth/olvide` (público) | `{email}` → siempre `{ok:true}`; si hay cuenta manda con Resend (`RESEND_API_KEY`) un link `APP_URL/#recuperar=<código>` que vale 1 h y un uso |
| `POST /auth/recuperar` (público) | `{codigo, clave}` → `{token, perfil}`; cierra las otras sesiones |
| `DELETE /perfil` | `{confirmacion: <email>}` borra la cuenta y todos sus gastos, meses y usos (lo exige Play) |
| `GET /auth/config` (público) | `{googleClientId}`: el front muestra el botón solo si hay. Client ID en `src/auth/google.ts` o `GOOGLE_CLIENT_ID` |
| `GET/PATCH /perfil` | nombre, moneda (USD, ARS, EUR, MXN, CLP, COP, UYU, PEN, BRL), idioma (es, en), saldo, `ingresoMensual {monto, diaCobro}` |
| `POST /perfil/cobrar-ingreso` | suma el ingreso al saldo, una vez por mes |
| `GET/POST /gastos`, `PATCH/DELETE /gastos/:id` | alta, edición y archivado (DELETE archiva, también los meses pasados: para terminar un fijo se usa `mesFin`) |
| `POST /gastos/:id/restaurar` | desarchiva (el "Deshacer" del front) |
| `PUT /gastos/:id/meses/:mes` | `{montoDelMes}`: monto distinto solo ese mes (null lo saca) |
| `POST/DELETE /gastos/:id/meses/:mes/pagar` | pagar descuenta del saldo; desmarcar lo devuelve |
| `GET/POST /gastos/:id/usos`, `DELETE /usos/:id` | usos de reserva (bajan el saldo) |
| `GET /datos` | perfil + gastos + estados + usos desde el mes actual, para que el front calcule |
| `GET /meses/:mes`, `GET /proyeccion?hasta=AAAA-MM` | resumen con el motor (hasta 24 meses) |

## Premium (épica S)

`src/premium/`. Quien no paga tiene usos gratis guardados en el usuario (`usosGratis`:
3 vistas de métricas, 10 mensajes al asistente); premium vale hasta `premiumHasta`.
- `POST /premium/usar {funcion}`: gasta una vista gratis (o nada si es premium).
- `POST /asistente {mensajes:[{rol, texto}]}`: Claude Haiku 5.5 (`@anthropic-ai/sdk`,
  `ANTHROPIC_API_KEY`) con herramientas que solo **proponen** (`crear_gasto`,
  `pagar_gasto`, `usar_reserva`, `editar_gasto`, `monto_del_mes`, `terminar_gasto`, `borrar_gasto`,
  `cambiar_saldo`, `cambiar_ingreso`); el front muestra cada propuesta y la persona confirma con
  los endpoints de siempre. Prompt y validación en `src/premium/asistente.ts`. Cada llamada
  queda en `uso_ia` (tokens y costo); tope global `IA_PRESUPUESTO_DIARIO_USD` (default 1)
  y 60 mensajes por día por premium. Si cambiás de modelo, agregá su precio en `PRECIOS`.
- Suscripción web con Mercado Pago (`MP_ACCESS_TOKEN`, precio `PREMIUM_PRECIO_ARS`,
  default 3000): `POST /premium/suscribir` crea un plan de MP para esa persona (`preapproval_plan`, así
  paga con cualquier cuenta de MP) y devuelve el link; la suscripción que nace se asocia
  por `planId` (si
  el cobro no se puede iniciar, reinicia `usosGratis` y devuelve `{url:null, regalo:true}`:
  no se bloquea a nadie porque no le pudimos cobrar);
  `POST /pagos/mercadopago` (webhook público) relee la suscripción en la API de MP y, si
  está `authorized`, extiende premium hasta el próximo cobro + 3 días; `POST
  /premium/sincronizar` hace lo mismo al volver (si todavía no llegó la notificación, busca
  en MP por el plan); `POST /premium/cancelar` corta la
  renovación. Si se perdió una notificación, al leer el perfil o usar algo premium con
  premium vencido hace menos de 40 días y una suscripción activa, el back relee MP (una vez
  por hora por usuario). Si el próximo cobro ya pasó (tarjeta rechazada), no extiende.
  Borrar la cuenta cancela la suscripción. `GET /premium/config` (público)
  dice si pagos y asistente están activos.

Login, registro, Google y recupero tienen límite de intentos por IP y por email
(`src/auth/limite.ts`, en memoria; 429 al pasarse).

Todo pide `Authorization: Bearer <token>` (guard global `UsuarioGuard`) salvo lo marcado
con `@Public()`, y cada consulta filtra por el usuario: ver el test "un usuario no puede
ver ni tocar lo de otro" en `src/datos/api.spec.ts`, que prueba la API entera contra
`mongodb-memory-server`. Los meses se calculan en hora argentina (`TZ` en `main.ts`). En prod todo cuelga de `/api`
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
