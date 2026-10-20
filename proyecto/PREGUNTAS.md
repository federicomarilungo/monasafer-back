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
