# Preguntas abiertas

Todas las preguntas para avanzar, agrupadas por tarea del [BACKLOG.md](BACKLOG.md), cada
una con mi recomendación. Respondé en el hilo con algo como `A3.1 ok · C1.1 b`.

**Marcas**: 🔴 bloquea (cuesta plata, no se deshace o es decisión de producto) · 🟢 sigo
con la recomendación si no respondés en el ciclo siguiente.

---

## Nuevas

### Producto (seguidas con la recomendación, 20/10/2026)
- **P.1** 🟢 Multiusuario con email y contraseña desde el día 1.
- **P.2** 🟢 Moneda una por usuario (USD o ARS), USD por defecto.
- **P.3** 🟢 Pagar un gasto lo descuenta del saldo automáticamente.
- **P.4** 🟢 Ingreso mensual con día de cobro; se marca cobrado al sumarse al saldo.
- **P.5** 🟢 El mono se llama "Mona" salvo que Fede prefiera otro nombre.
- **P.6** 🟢 Ciclo autónomo a las 8, 14 y 20 (hora Argentina), en un hilo propio.

### Login con Google (B7, 20/10/2026)
- **B7.1** 🔴 Crear el ID de cliente de OAuth (Aplicación web) en Google Cloud Console con
  los orígenes `https://monasafer.com`, `https://www.monasafer.com`,
  `https://monasafer-4lh7x.ondigitalocean.app` y `http://localhost:5173`, y pasar el ID
  (no el secreto). Va en el código: no es secreto.

### Salida a producción (épica L, 20/10/2026)
- **L.1** ✅ (20/10) Responsable en los textos legales: "Monasafer" (Fede).
- **L.2** 🔴 Resend: crear cuenta (gratis), agregar el dominio `monasafer.com`, cargar
  en Cloudflare los registros DNS que te muestra y poner `RESEND_API_KEY` en la app de
  DO (tarea local). Sin eso el recupero no manda emails.
- **L.3** 🔴 Email `hola@monasafer.com`: Cloudflare → Email → Email Routing, reenviar a
  tu Gmail. Las páginas legales ya lo nombran.
- **L.4** 🔴 Cuenta de Google Play Developer (USD 25) y verificación de identidad.

### Premium web (20/10/2026, tareas de Fede)
- **S.7** 🔴 Mercado Pago: en https://www.mercadopago.com.ar/developers creá una
  aplicación ("Suscripciones"), copiá el **Access Token de producción** y cargalo en DO
  como `MP_ACCESS_TOKEN` (secreto). En la app de MP, Webhooks: URL
  `https://monasafer.com/api/pagos/mercadopago`, eventos "Planes y suscripciones".
  Tarea local.
- **S.8** 🔴 Precio: hoy USD 2 ≈ `PREMIUM_PRECIO_ARS=3000` (default). Si querés otro,
  cargá esa variable en DO.
- **S.9** 🔴 IA: crear una API key en https://console.anthropic.com (con un límite de
  gasto mensual, por ejemplo USD 20) y cargarla en DO como `ANTHROPIC_API_KEY` (secreto).
  El tope diario es `IA_PRESUPUESTO_DIARIO_USD` (default 1).
- **S.10** 🔴 Arrepentimiento: los términos prometen devolver lo cobrado si alguien se
  arrepiente dentro de los 10 días de la primera suscripción (lo pide la ley argentina).
  La devolución se hace a mano desde Mercado Pago. ¿Ok?

### Premium y Play Store (épica S, 20/10/2026)
- **S.1** 🔴 ¿Qué entra en premium? Recomiendo: asistente IA (3 usos gratis) y métricas
  de análisis (por categoría, comparar meses, proyección a fin de año; 2 vistas gratis).
  El gráfico de ahorro a 12 meses (D2) queda gratis.
- **S.2** 🔴 Precio: USD 2/mes. ¿También anual (por ejemplo USD 18)? Recomiendo sumar el
  anual desde el principio: Play lo soporta igual y retiene más.
- **S.3** 🔴 Cuenta de Google Play Developer (USD 25, una vez, a nombre de Fede). Hace
  falta para S6 y S7.
- **S.4** 🔴 Publicidad: recomiendo no ponerla hasta tener uso real, y si va, un solo
  lugar fijo. ¿Ok?
- **S.5** 🔴 Asistente IA: Claude Haiku con un presupuesto diario (como abisal, por
  ejemplo USD 1/día al principio). Necesita una API key en DO (tarea local).
- **S.6** 🟢 La web sigue gratis y sin cobro propio hasta que S8 se decida; premium se
  compra en la app de Play.

## Respondidas

- **A3.1** (20/10/2026): Fede creó el usuario de Atlas y cargó `MONGO_URI`, `AUTH_SECRET` y `ADMIN_API_KEY` en la app de DO. `/api/salud` da `base: true`.
- **A1.1** (20/10/2026): Fede le dio acceso a la app de GitHub de Claude a los dos repos.
- **Stack** (20/10/2026): back NestJS, front HTML puro (sin React). Dos repos como abisal.
- **Costo** (20/10/2026): la app de DO de ~USD 5/mes está ok.
