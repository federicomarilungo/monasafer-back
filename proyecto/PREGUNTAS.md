# Preguntas abiertas

Todas las preguntas para avanzar, agrupadas por tarea del [BACKLOG.md](BACKLOG.md), cada
una con mi recomendación. Respondé en el hilo con algo como `A3.1 ok · C1.1 b`.

**Marcas**: 🔴 bloquea (cuesta plata, no se deshace o es decisión de producto) · 🟢 sigo
con la recomendación si no respondés en el ciclo siguiente.

---

## Nuevas

### A1 · Repos
- **A1.1** 🔴 Instalar la app de GitHub de Claude en `monasafer-back` y `monasafer-front`
  (desde https://claude.ai/connect-github). Sin eso no puedo pushear.

### A3 · Base en Atlas
- **A3.1** 🔴 La API de Atlas no deja entrar al entorno cloud (access list por IP). Te
  sugiero crear vos el usuario desde la web: Database Access → Add New Database User,
  `monasafer_app`, contraseña autogenerada, rol "readWrite" sobre la base `monasafer`. Y
  pegar la cadena de conexión como `MONGO_URI` en la app de DO cuando exista (A4).

### Producto (seguidas con la recomendación, 20/10/2026)
- **P.1** 🟢 Multiusuario con email y contraseña desde el día 1.
- **P.2** 🟢 Moneda una por usuario (USD o ARS), USD por defecto.
- **P.3** 🟢 Pagar un gasto lo descuenta del saldo automáticamente.
- **P.4** 🟢 Ingreso mensual con día de cobro; se marca cobrado al sumarse al saldo.
- **P.5** 🟢 El mono se llama "Mona" salvo que Fede prefiera otro nombre.
- **P.6** 🟢 Ciclo autónomo a las 8, 14 y 20 (hora Argentina), en un hilo propio.

## Respondidas

- **Stack** (20/10/2026): back NestJS, front HTML puro (sin React). Dos repos como abisal.
- **Costo** (20/10/2026): la app de DO de ~USD 5/mes está ok.
