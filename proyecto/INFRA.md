# Infraestructura

Sin valores secretos: las credenciales viven como variables del entorno cloud de Claude
Code y de la app de DigitalOcean.

## DigitalOcean App Platform

App `monasafer` (pendiente, tarea A4), región `atl`, con `deploy_on_push` en `main`:

| Componente | Tipo | Repo | Notas |
|---|---|---|---|
| `back` | service, `apps-s-1vcpu-0.5gb` (~USD 5/mes, autorizado por Fede el 20/10/2026), puerto 3001 | `monasafer-back` | `npm run build` / `npm run start:prod` |
| `front` | static site, `npm run build` → `dist/` | `monasafer-front` | gratis |

Variables: back `MONGO_URI`, `CORS_ORIGINS`; front `VITE_API_URL` (en build).

## MongoDB Atlas

Mismo proyecto y cluster que abisal (`abisal-cluster`, M0 gratis, AWS us-east-1), base
**`monasafer`**, usuario propio `monasafer_app` con readWrite solo sobre `monasafer`
(pendiente, tarea A3). Colecciones previstas: `usuarios`, `gastos`, `meses_gasto`,
`usos_reserva`.

## Entorno cloud de Claude Code

Se usa el entorno `abisal` (tiene `DO_TOKEN` y las keys de Atlas). Medido el 20/10/2026:
- La API de Atlas rechaza al sandbox por IP (la API key tiene access list). El usuario de
  la base lo crea Fede desde la web de Atlas, o suma la IP de salida a la key.
- GitHub: los repos `monasafer-*` necesitan la app de GitHub de Claude instalada para
  poder pushear.
