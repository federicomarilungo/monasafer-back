# Backlog del MVP — Monasafer

Objetivo: un MVP que Fede use todos los días con sus gastos reales: cargar saldo, ingreso,
gastos y reservas, ver el balance del mes y moverse a meses futuros, con el mono.

Última actualización: 20/10/2026 (arranque). Cómo se trabaja: ver [README.md](README.md).
Preguntas abiertas: [PREGUNTAS.md](PREGUNTAS.md).

**Prioridad**: **P0** sin esto no hay MVP · **P1** parte del MVP que queremos mostrar ·
**P2** después.

**Estado**: `lista` · `preguntas` · `bloqueada` · `en curso` · `en revisión` · `hecha` ·
`descartada`. **Quién**: `Claude` · `Fede` · `Ambos`.

---

## Resumen

| ID | Tarea | Prio | Estado | Quién | Depende de |
|---|---|---|---|---|---|
| A1 | Repos `monasafer-back` y `monasafer-front` con acceso de Claude | P0 | hecha | Fede | |
| A2 | Esqueletos de los dos repos y documentos del proyecto | P0 | hecha | Claude | A1 |
| A3 | Base `monasafer` y usuario en Atlas | P0 | bloqueada | Fede | |
| A4 | App de DO (service + static site) y primer deploy | P0 | hecha | Claude | A1 |
| A5 | CI con tests en los dos repos | P1 | lista | Claude | A1 |
| A6 | Activar el ciclo autónomo (tarea programada) | P0 | lista | Ambos | A4 |
| B1 | Motor de cálculo (balance, fijos con vencimiento, reservas, proyección) | P0 | hecha | Claude | A2 |
| B2 | Login y registro (email + contraseña, token firmado) | P0 | lista | Claude | A3 |
| B3 | API de perfil: saldo, ingreso mensual, cobrar ingreso | P0 | lista | Claude | B2 |
| B4 | API de gastos puntuales y fijos (alta, edición, monto por mes, pagar) | P0 | lista | Claude | B1, B2 |
| B5 | API de reservas (proporcional y manual, usos) | P0 | lista | Claude | B4 |
| B6 | `GET /meses/:mes` y `GET /proyeccion` con el motor | P0 | lista | Claude | B4 |
| C1 | Propuestas visuales del mono y de la pantalla del mes | P0 | lista | Ambos | |
| C2 | Pantalla del mes: balance, mono y lista de gastos | P0 | lista | Claude | C1, B6 |
| C3 | Alta rápida de gasto | P0 | lista | Claude | C2 |
| C4 | Navegación entre meses con animación | P0 | lista | Claude | C2 |
| C5 | Reservas en el front (frasco que se vacía, cargar usos) | P0 | lista | Claude | C2, B5 |
| C6 | Login y onboarding (saldo, ingreso, primeros fijos) con el mono | P0 | lista | Claude | B2, C2 |
| C7 | Mobile primero y PWA instalable | P1 | lista | Claude | C2 |
| D1 | Estados y animaciones del mono según el balance | P1 | lista | Claude | C1, C2 |
| D2 | Gráfico de ahorro proyectado a 12 meses | P1 | lista | Claude | C4 |
| D3 | Logros y rachas de ahorro | P2 | lista | Claude | D1 |
| E1 | Recordatorio de vencimientos y día de cobro | P2 | lista | Claude | B4 |
| E2 | Cuenta compartida (pareja) | P2 | lista | Ambos | B2 |
| E3 | Dominio propio | P2 | bloqueada | Fede | |

Orden sugerido: A3 → B2 → B3 → B4 → B6 → C2 → C3 → B5 → C5 → C4 → C6; C1 en
paralelo desde ya, para que Fede elija el mono mientras se arma la API.

---

## Detalle

**A1 · Repos con acceso de Claude** — Fede creó los dos repos el 20/10/2026. Acceso de
Claude listo el mismo día.

**A2 · Esqueletos** — Hecha el 20/10/2026. Back: NestJS con
`/ping` y `/salud`, arranca sin `MONGO_URI`. Front: Vite + JS puro con la pantalla del mes
de demo y el mono en SVG. Docs `proyecto/`, CLAUDE.md y skills en el back.

**A3 · Base en Atlas** — Base `monasafer` y usuario `monasafer_app` (readWrite solo ahí).
La API de Atlas rechaza al entorno cloud por IP: lo hace Fede (PREGUNTAS A3.1).

**A4 · App de DO** — Hecha el 20/10/2026: https://monasafer-4lh7x.ondigitalocean.app (front en `/`, back en `/api`, mismo dominio, sin CORS). Criterios originales: app `monasafer` en `atl` con componente `back` (service
`apps-s-1vcpu-0.5gb`, `npm run build`, `npm run start:prod`, puerto 3001, health
`/ping`) y `front` (static site, `npm run build`, `dist/`, `VITE_API_URL` apuntando al
back). `deploy_on_push` en los dos. `CORS_ORIGINS` del back = URL del front. Ids y URLs
en INFRA.md. Ojo: DigitalOcean necesita acceso de GitHub a los repos de
`federicomarilungo` (hoy su conexión ve los de `indicadores-argentinos`).

**B1 · Motor de cálculo** — Hecha el 20/10/2026. `src/motor/` con `vigente`,
`restanteReserva`, `proyectar` y `resumenDelMes`; 16 tests con casos reales (zapatillas
en cuotas, transporte manual, ingreso sin cobrar, monto distinto en un mes, pagar no
mueve el balance).

**B2 · Login** — Criterios: `POST /auth/registro` y `POST /auth/login` (email +
contraseña con scrypt), token firmado con `AUTH_SECRET`, guard global, cada consulta
filtra por `usuarioId`. Tests de que un usuario no ve datos de otro.

**C1 · Propuestas visuales** — 2 o 3 variantes del mono (SVG) y de la pantalla del mes,
publicadas para que Fede elija. Estados del mono: feliz (ahorro), nervioso (cerca de
cero), en pánico (negativo).
