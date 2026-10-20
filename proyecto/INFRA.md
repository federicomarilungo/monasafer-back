# Infraestructura

Sin valores secretos: las credenciales viven como variables del entorno cloud de Claude
Code y de la app de DigitalOcean.

## DigitalOcean App Platform

App `monasafer`, id `2a6adb40-44d9-495f-8a21-90e022323162`, región `atl`, creada el 20/10/2026,
con `deploy_on_push` en `main`. URL: https://monasafer-4lh7x.ondigitalocean.app

Back y front comparten dominio: el back está en la ruta `/api` (DO saca el prefijo, así que
`/api/ping` llega como `/ping`) y el front en `/`. Por eso no hace falta CORS en prod.


| Componente | Tipo | Repo | Notas |
|---|---|---|---|
| `back` (`/api`) | service, `apps-s-1vcpu-0.5gb` (~USD 5/mes, autorizado por Fede el 20/10/2026), puerto 3001 | `monasafer-back` | `npm run build` / `npm run start:prod` |
| `front` (`/`) | static site, `npm run build` → `dist/` | `monasafer-front` | gratis |

Variables (cargadas por Fede el 20/10/2026, base conectada): back `MONGO_URI` `ADMIN_API_KEY` (consultas de Claude, ver CLAUDE.md) y `AUTH_SECRET` (firma los logins, 32+ caracteres); front `VITE_API_URL=/api` (en build).

## MongoDB Atlas

Mismo proyecto y cluster que abisal (`abisal-cluster`, M0 gratis, AWS us-east-1), base
**`monasafer`**, usuario propio `monasafer_app` con readWrite solo sobre `monasafer`
(creado por Fede el 20/10/2026). Colecciones previstas: `usuarios`, `gastos`, `meses_gasto`,
`usos_reserva`.

## Entorno cloud de Claude Code

Se usa el entorno `abisal` (tiene `DO_TOKEN` y las keys de Atlas). Medido el 20/10/2026:
- Escribir variables secretas en la app de DO lo bloquea el modo automático (igual que en
  abisal): las carga Fede, o una sesión en su Mac. También bloquea usar el DO_TOKEN como
  llave de la API o derivar AUTH_SECRET de MONGO_URI (probado el 20/10/2026).
- La API de Atlas rechaza al sandbox por IP (la API key tiene access list). El usuario de
  la base lo crea Fede desde la web de Atlas, o suma la IP de salida a la key.
- GitHub: Fede le dio acceso a la app de Claude sobre los repos `monasafer-*` el 20/10.
