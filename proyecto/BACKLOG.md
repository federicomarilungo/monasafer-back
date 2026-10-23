# Backlog del MVP — Monasafer

Objetivo: un MVP que Fede use todos los días con sus gastos reales: cargar saldo, ingreso,
gastos y reservas, ver el balance del mes y moverse a meses futuros, con el mono.

Última actualización: 20/10/2026 (épicas R y S). Cómo se trabaja: ver [README.md](README.md).
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
| A3 | Base `monasafer` y usuario en Atlas | P0 | hecha | Fede | |
| A4 | App de DO (service + static site) y primer deploy | P0 | hecha | Claude | A1 |
| A5 | CI con tests en los dos repos | P1 | lista | Claude | A1 |
| A6 | Activar el ciclo autónomo (tarea programada) | P0 | lista | Ambos | A4 |
| B1 | Motor de cálculo (balance, fijos con vencimiento, reservas, proyección) | P0 | hecha | Claude | A2 |
| B2 | Login y registro (email + contraseña, token firmado) | P0 | hecha | Claude | A3 |
| B3 | API de perfil: saldo, ingreso mensual, cobrar ingreso | P0 | hecha | Claude | B2 |
| B4 | API de gastos puntuales y fijos (alta, edición, monto por mes, pagar) | P0 | hecha | Claude | B1, B2 |
| B5 | API de reservas (proporcional y manual, usos) | P0 | hecha | Claude | B4 |
| B6 | `GET /meses/:mes` y `GET /proyeccion` con el motor | P0 | hecha | Claude | B4 |
| B7 | Entrar con Google (Google Identity Services, sin Firebase) | P1 | en revisión | Ambos | B2 |
| L1 | 🚨 Recupero de contraseña por email (link de 1 h, Resend) | P0 | en revisión | Ambos | B2 |
| L2 | 🚨 Borrar la cuenta y todos los datos (en la app y página web) | P0 | hecha | Claude | B2 |
| L3 | 🚨 Política de privacidad (borrador) y revisión de Fede | P0 | en revisión | Ambos | |
| L4 | 🚨 Términos y condiciones (borrador), aceptación al crear cuenta | P0 | en revisión | Ambos | |
| L5 | 🚨 Email de contacto `hola@monasafer.com` (reenvío de Cloudflare) | P0 | lista | Fede | |
| L6 | 🚨 Límite de intentos en login, registro y recupero | P0 | hecha | Claude | B2 |
| L7 | 🚨 Prueba de punta a punta en monasafer.com con la cuenta real de Fede | P0 | lista | Ambos | L1-L6 |
| L8 | Respaldo de la base (Atlas M0 no tiene backups automáticos) | P1 | lista | Ambos | |
| L9 | Cuenta de Google Play Developer (USD 25) y verificación de identidad | P0 | lista | Fede | |
| L10 | Proyecto Android de la TWA con Bubblewrap y `assetlinks.json` | P0 | lista | Claude | L9 |
| L11 | Ficha de Play: textos, ícono, portada y capturas | P0 | lista | Claude | |
| L12 | Formularios de la consola (seguridad de datos, clasificación, financiero, acceso) | P0 | lista | Ambos | L3, L9 |
| L13 | Prueba cerrada con 12+ testers durante 14 días y pedido de producción | P0 | lista | Fede | L10-L12 |
| I1 | Elegir idioma (castellano / inglés) y moneda (9) | P1 | hecha | Claude | B3 |
| C1 | Propuestas visuales del mono y de la pantalla del mes | P0 | lista | Ambos | |
| C2 | Pantalla del mes: balance, mono y lista de gastos | P0 | hecha | Claude | C1, B6 |
| C3 | Alta rápida de gasto | P0 | hecha | Claude | C2 |
| C4 | Navegación entre meses con animación | P0 | hecha | Claude | C2 |
| C5 | Reservas en el front (frasco que se vacía, cargar usos) | P0 | hecha | Claude | C2, B5 |
| C6 | Login y onboarding (saldo, ingreso, primeros fijos) con el mono | P0 | hecha | Claude | B2, C2 |
| C7 | Mobile primero y PWA instalable | P1 | hecha | Claude | C2 |
| C8 | Responsive punta a punta: aprovechar el espacio en PC y tablet (home en columnas, hojas más anchas, entrada, onboarding, cajón, chat y métricas) sin romper celular | P1 | en curso | Claude | C7 |
| D1 | Estados y animaciones del mono según el balance | P1 | hecha | Claude | C1, C2 |
| D2 | Gráfico de ahorro proyectado a 12 meses | P1 | lista | Claude | C4 |
| D3 | Logros y rachas de ahorro | P2 | lista | Claude | D1 |
| M1 | Reserva pasada de gasto: mostrar lo que queda en negativo | P1 | hecha | Claude | C5 |
| M2 | Al mes siguiente, sugerir subir el monto de una reserva que se pasó | P1 | hecha | Claude | M1 |
| M3 | Al pagar: animación que muestre el impacto en "Saldo hoy" y "Por gastar", con sonido | P1 | hecha | Claude | C2 |
| M4 | Sonidos satisfactorios en toda la app (estilo Tricky Towers), con botón para silenciar | P1 | hecha | Claude | M3 |
| M5 | Hoja de gasto: duración (este mes / varios / siempre) separada de "es una reserva" | P1 | hecha | Claude | C3 |
| E1 | Recordatorio de vencimientos y día de cobro | P2 | lista | Claude | B4 |
| E2 | Cuenta compartida (pareja) | P2 | lista | Ambos | B2 |
| E3 | Dominio propio | P2 | bloqueada | Fede | |
| R1 | Buzón de recomendaciones en la app ("¿Qué le mejorarías a Mona?") | P1 | lista | Claude | B2 |
| R2 | Leer las recomendaciones en cada ciclo y convertirlas en tareas | P2 | lista | Claude | R1, A6 |
| S1 | Plan premium en el back (quién es premium, hasta cuándo, de dónde pagó) | P1 | hecha | Claude | B2 |
| S2 | Métricas premium con 3 vistas gratis | P1 | hecha | Claude | S1, D2 |
| S3 | Asistente con IA por chat: crea gastos y los marca pagos, pregunta lo que falta | P1 | en revisión | Claude | S1 |
| S4 | Asistente por voz (dictado sobre S3) | P1 | hecha | Claude | S3 |
| S5 | Publicidad liviana que se va con la suscripción | P2 | hecha | Ambos | S1 |
| S6 | Publicar en Play Store como TWA (la PWA empaquetada) | P2 | preguntas | Ambos | C7 |
| S7 | Suscripción de USD 2/mes con Google Play Billing, verificada en el back | P2 | preguntas | Ambos | S1, S6 |
| S8 | Pago de la suscripción desde la web (Mercado Pago) | P1 | en revisión | Ambos | S1 |
| S9 | Videos con recompensa: ver un video entero da créditos premium (web y Play) | P2 | preguntas | Ambos | S1, S6 |
| S10 | Premium visible en la home (corona, sello) y métricas en dos niveles: normales para todos (3 meses atrás/adelante, categorías del mes), premium con 12 y 12 y el gráfico de una categoría; sin vistas gratis se avisa y se ven las normales | P1 | en revisión | Claude | S2 |
| S11 | Ideas premium para después (Fede elige): metas de ahorro, alerta "gastás más que tu promedio en X", resumen mensual de Mona, exportar a Excel, accesorios de Mona | P2 | preguntas | Fede | S10 |
| K1 | Cajón de bananas: balance del mes y acumulado, ahorrar en bolsillos (dólar, BTC, oro…) con auditoría | P1 | en revisión | Claude | B3, C2 |
| K2 | Predicción de ahorros a futuro en el cajón y en métricas (últimos 3 meses reales o balance de meses futuros); más de 3 meses es premium | P2 | lista | Claude | K1, S2 |

Orden sugerido: C1 (diseño final del mono, con Fede) → D2 → A5 → R1 → D3. La épica S
(premium) va después de que la app tenga uso diario: primero S1 y S3, que es el gancho;
S5 (publicidad) al final o nunca. Ver la opinión en el detalle de la épica S.

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

**B2-B6 · API** — Hechas el 20/10/2026, probadas con `mongodb-memory-server` (`src/datos/api.spec.ts`). En prod se activan cuando esté `MONGO_URI` (A3). Endpoints en CLAUDE.md. Criterios originales de B2: `POST /auth/registro` y `POST /auth/login` (email +
contraseña con scrypt), token firmado con `AUTH_SECRET`, guard global, cada consulta
filtra por `usuarioId`. Tests de que un usuario no ve datos de otro.

**C2-C5 · Front de la pantalla del mes** — Hechas el 20/10/2026 (versión 1, con el mono provisorio): login/registro o demo, hoja de alta y edición, pagar con un toque, usos de reserva, saldo e ingreso, aviso de cobro, navegación de meses con flechas, teclado y deslizar. Probado de punta a punta con Playwright contra un Mongo en memoria. C6 hecha el 20/10: onboarding en 5 pasos con Mona (saldo, ingreso, fijos comunes, reservas comunes, cierre con el ahorro). C7 hecha: manifest, íconos, service worker (abre sin señal, /api nunca se guarda). D1 hecha: ánimo "rica" con anteojos, ojos que siguen el dedo, reacción al tocarla.

**M1-M4 · Mejoras pedidas por Fede (20/10/2026)** — "cuando usás más de lo que tenés en
una reserva, que aparezca en negativo; al mes siguiente puede aparecer una sugerencia de
incrementar el monto. Cuando marcás un gasto como realizado afecta a saldo hoy y a por
gastar: una animación que haga notorio el impacto y un sonido satisfactorio al pagar. En
general, sonidos satisfactorios estilo Tricky Towers al realizar acciones."
- M1: la reserva muestra `monto − usado` aunque sea negativo (en rojo, frasco vacío). El
  balance no cambia: lo usado ya salió del saldo, la reserva no resta menos de 0.
- M2: si en el mes anterior una reserva cerró con usado > monto, en el mes actual aparece
  "El mes pasado gastaste X en <reserva>. ¿Subimos a X?" con un botón que edita el monto.
  Necesita que `/datos` traiga también los usos del mes anterior.
- M3: al pagar, "Saldo hoy" baja y "Por gastar" baja con un conteo animado, un "−US$ X"
  que vuela de un número al otro y el mono atrapa la moneda; sonido de moneda.
- M4: sonidos generados con Web Audio (sin archivos): pagar, agregar gasto, usar reserva,
  cobrar ingreso, cambiar de mes, error. Botón 🔊/🔇 que se recuerda por navegador.

**M5 · Hoja de gasto** — Hecha el 20/10/2026 a pedido de Fede: duración y reserva son ejes independientes; "Varios meses" con − N + (sugerencia 3) y el último mes en palabras, sin calendario; íconos en grilla con scroll vertical. Se traduce al modelo de siempre (puntual/fijo/reserva + mesFin + recurrente).

**C8 · Responsive punta a punta (pedido de Fede, 23/10/2026)** — "Revisar responsive punta
a punta, teniendo en cuenta que usuarios de PC tienen más espacio y aprovechar eso". La app
nació para celular (480 px) y en PC quedaba una columna angosta en el medio. Criterios:
- Celular (360-480 px, también con letra agrandada) queda igual: sin desborde horizontal.
- Tablet y PC: la home usa el ancho (balance y resumen a un lado, gastos al otro), los
  botones flotantes acompañan el contenido, las hojas que lo necesitan (chat, cajón) son
  más anchas y altas, entrada y onboarding no quedan como una tira.
- Mouse: estados de hover en lo que se toca.
- Métricas: la rehace otro hilo como pantalla completa (separada en gastos y ahorros); al
  terminar, revisar que en PC aproveche el ancho.
Se verifica en monasafer.com con capturas a 390, 768, 1280 y 1920 px.

**C1 · Propuestas visuales** — 2 o 3 variantes del mono (SVG) y de la pantalla del mes,
publicadas para que Fede elija. Estados del mono: feliz (ahorro), nervioso (cerca de
cero), en pánico (negativo).

**R1 · Buzón de recomendaciones** — Pedido de Fede (20/10/2026): "un apartado de
recomendaciones que envíen los usuarios, para usarlas como input para mejorar el
proyecto". Un botón en el menú abre una hoja con un texto libre (hasta 1000 caracteres),
la sección de la que habla (opcional) y Mona agradeciendo. `POST /recomendaciones` guarda
texto, usuario, fecha y versión del front; tope de 5 por usuario por día. Se leen con
`/api/admin/consulta` (colección `recomendaciones`). Criterio: un usuario manda una y
aparece en la consulta; otro usuario no la ve.

**R2 · Recomendaciones al backlog** — El ciclo autónomo lee las recomendaciones nuevas,
las agrupa y propone tareas en PREGUNTAS.md con cuántos usuarios pidieron cada cosa.
Nada entra al backlog sin que Fede lo vea.

### Épica S · Premium y Play Store (pedido de Fede, 20/10/2026)

Lo pedido: métricas premium que se pueden ver 2 o 3 veces gratis y después piden la
suscripción de USD 2/mes; un asistente con IA por chat o voz ("compré con la tarjeta de
crédito una campera en 6 cuotas" → crea un gasto fijo de 6 meses y pregunta "¿cuánto la
pagaste?"); publicidad poco molesta que se va con la suscripción; la app va a Play Store y
cobra con la suscripción de Play.

Opinión (Claude):
- **El asistente es el mejor gancho premium.** El ejemplo de la campera encaja justo con
  el modelo: fijo con `mesFin` = mes actual + 5 y `monto` = total / 6. Se resuelve con
  tool use (crear_gasto, pagar_gasto, usar_reserva) y la IA nunca escribe sola: arma el
  gasto, lo muestra en la hoja de siempre y la persona confirma. Cuesta centavos por
  mensaje con un modelo chico (Claude Haiku, como abisal), pero igual necesita contador de
  uso y cupo diario como abisal (B3), o un usuario gratis puede gastar más que lo que paga
  uno premium.
- **Métricas premium: falta definir cuáles.** Propongo que el gráfico de ahorro a 12
  meses (D2) quede gratis porque es el corazón de la app, y premium sea lo de análisis:
  en qué se va la plata por categoría, comparar meses, "a este ritmo llegás a X en
  diciembre", exportar.
- **Publicidad: la dejaría para el final o nunca.** En una app de plata la confianza
  vale más que lo que paga un banner con pocos usuarios (centavos), y los avisos de
  préstamos o apuestas que suelen salir le pegan a la marca. Si va, un solo lugar fijo y
  nunca en medio de cargar o pagar.
- **Play Store encaja bien con lo que hay:** la PWA (C7) se empaqueta como TWA con
  Bubblewrap; la cuenta de desarrollador cuesta USD 25 una vez. Dentro de la app de Play,
  lo digital se cobra con Play Billing (Google se queda con 15% de las suscripciones,
  así que de USD 2 quedan ~1,70). Desde una TWA se usa con la Digital Goods API y Payment
  Request. Quien entre por la web no puede pagar con Play: o la web es solo gratis, o se
  suma un cobro web aparte (S8). Por eso el back tiene que ser la fuente de verdad del
  plan (S1), con origen `play` o `web`.
- **Orden:** R1 primero (barato y alimenta todo), después S1 + S3 (asistente), S6 + S7
  cuando haya gente usándola, S2 cuando sepamos qué métricas piden (R1 ayuda), S5 al final.

**S1 · Plan premium** — Colección `suscripciones` (usuario, plan, `vence`, origen
`play`/`web`/`regalo`, token de compra). `GET /perfil` suma `premium: {activo, vence}`.
Contador de usos gratis por función (`usosGratis: {metricas: 2, asistente: 3}`) en el
back, no en el navegador, para que no se resetee borrando datos.

**S2 · Métricas premium** — Depende de PREGUNTAS S.1. Cada apertura de una métrica
premium resta una vista gratis; al llegar a 0, Mona muestra la pantalla de suscripción.

**S3 · Asistente por chat** — Hoja de chat con Mona. El back llama al modelo con
herramientas para crear, editar y pagar gastos y usar reservas; si falta un dato (monto,
cantidad de cuotas, mes) pregunta antes de proponer. La propuesta se confirma con un
toque en la hoja de gasto de siempre. Cada llamada registra tokens y costo; cupo por
usuario y presupuesto diario global. Criterios con casos reales: campera en 6 cuotas,
"pagué la luz", "gasté 30 de nafta" (uso de la reserva transporte).

**S4 · Voz** — Botón de micrófono que dicta al chat de S3 con la Web Speech API donde
exista (Chrome Android sí) y, si no, el dictado del teclado del teléfono. El texto pasa
por el mismo camino que el chat.

**S5 · Publicidad** — Depende de PREGUNTAS S.4. Un solo espacio fijo abajo de la lista,
nunca en hojas ni animaciones; se va con premium.

**S6 · Play Store** — Bubblewrap genera el proyecto Android de la TWA; Digital Asset
Links (`/.well-known/assetlinks.json` en el front) para que abra sin barra del navegador.
Necesita la cuenta de Google Play Developer de Fede y el dominio propio (E3). Ficha de la
tienda con capturas de Mona.

**S7 · Play Billing** — Producto de suscripción mensual en Play Console. El front usa la
Digital Goods API para comprar; el back verifica el token con la Google Play Developer
API y escucha las notificaciones en tiempo real (RTDN, vía Pub/Sub) para renovaciones y
cancelaciones. Credencial de cuenta de servicio: la carga Fede en DO (tarea local).

**S8 · Pago web** — Opcional. Mercado Pago o Stripe para quien usa la web; el mismo plan
de S1 con origen `web`.

**S9 · Videos con recompensa** — Pedido de Fede (21/10/2026), plan de trabajo, sin
avanzar todavía. Quien no paga puede mirar un video para ganar créditos: 1 video ≈ 2-3
mensajes de Mona o 1 vista de métricas, con tope diario por persona. Web: anuncios
rewarded de Google Ad Manager / AdSense (formato "rewarded ad" de GPT); app de Play:
AdMob rewarded. El crédito se da solo con la visualización completa confirmada: en Play,
con la verificación del lado del servidor de AdMob (SSV, callback firmado al back); en la
web, con el evento `rewardedSlotGranted`, y el back suma con su propio tope (un endpoint
`POST /premium/recompensa` con límite por usuario y por día). Bloqueante: Fede tiene que
pedir la cuenta de AdSense (y AdMob para Play), que Google aprueba con el sitio ya
publicado y los legales al día. Actualizar la política de privacidad (cookies de
anuncios) antes de prender.

**B7 · Entrar con Google** — Pedido de Fede (20/10/2026), sin Firebase ni Supabase. Botón
oficial de Google Identity Services arriba del formulario; el back verifica el ID token
con `google-auth-library` (`POST /auth/google`) y crea o vincula la cuenta por email,
conviviendo con email y contraseña. Si se vincula una cuenta que tenía contraseña, la
contraseña se borra y las sesiones anteriores se cierran (`sesionesDesde`): esa cuenta
nunca verificó el email y pudo haberla creado otra persona para quedarse adentro. Código
deployado el 20/10; el botón aparece cuando esté el Client ID (Fede lo crea en Google
Cloud Console, PREGUNTAS B7.1).

### Épica L · Salida a producción y Play Store (20/10/2026)

🚨 = bloquea la salida en la web del 21/10. Play Store no puede salir a producción antes
de ~14 días por la prueba cerrada obligatoria. Detalle y porqué en
[LANZAMIENTO.md](LANZAMIENTO.md).

Hecho el 20/10: L2 (⚙️ → Borrar mi cuenta, `DELETE /perfil`, y la página pública
`/borrar-cuenta.html` para Play), L6 (límite en memoria por IP y email), L1 en código
(falta `RESEND_API_KEY` y el dominio verificado en Resend para que salgan los emails),
borradores de `/privacidad.html` y `/terminos.html` (falta que Fede los lea y complete el
responsable: nombre o razón social).

**Épica S, 20/10/2026 (decisión de Fede: "avancemos con todos los features premium… por
ahora vamos sin Play Store, que funcione la suscripción web").** Hecho: S1 (usos gratis
en la base: 3 vistas de métricas, 10 mensajes), S2 (📊 ahorro a 12 meses, gastos por mes,
en qué se va la plata), S3 (💬 chat con Claude Haiku 5.5 que propone y la persona
confirma; tope global USD 1/día y 60 mensajes/día para premium), S4 (🎙️ Web Speech API),
S5 (un aviso propio, sin red de anuncios: AdSense en una app de plata con pocos usuarios
rinde centavos), S8 (Mercado Pago en pesos, `PREMIUM_PRECIO_ARS`). S3 y S8 esperan las
claves de Fede (`ANTHROPIC_API_KEY`, `MP_ACCESS_TOKEN`). S6/S7 (Play) quedan para después.

**I1 · Idioma y moneda** — Castellano e inglés (clave = texto en castellano, `src/i18n.js`
del front); el idioma del perfil manda cuando hay cuenta. Monedas: USD, ARS, EUR, MXN,
CLP, COP, UYU, PEN, BRL. Pendiente: los mensajes de error del back siguen en castellano.

**K1 · Cajón de bananas (idea de Fede, 22/10/2026)** — Representa lo que hace una persona
en la vida real: agarra la plata que le sobró (o la que sabe que no va a gastar) y la
guarda en algún lado, muchas veces en otra moneda o activo. El balance se parte en dos
(`partirBalance` del motor): el del mes (ingreso menos gastos enteros del mes) y el
acumulado de meses anteriores; Mona reacciona a la suma. "Ahorrar" saca plata del saldo
(con "Todo" o "¿cuánto te queda?") y la pone en un bolsillo, preguntando cuánto quedó en
su unidad (230 USD); "Omitir" la deja en "Sin asignar" para repartir después. Editar el
total de un bolsillo pide el detalle (bajó 40 USD: "viaje"). Los movimientos son la
auditoría y no son gastos de los meses; se pueden corregir o borrar y el saldo se corrige.
"Volver a la cuenta" devuelve plata al saldo. Sin cotizaciones externas a propósito: la
persona anota lo que tiene. Gratis (es el corazón de "lo que sobra es ahorro"); lo premium
podría ser un gráfico de cómo crecieron los ahorros.

**K2 · Predicción de ahorros (pedido de Fede, 22/10/2026)** — En el cajón y en las
métricas, ver cuánto vas a tener ahorrado más adelante, de dos maneras a elegir:
1. *Según tus ahorros reales*: el promedio de lo que mandaste al cajón en los últimos 3
   meses. Si hay menos de 3 meses, se estima con los que haya; si no hay ninguno, esta
   opción no se muestra.
2. *Según tus meses futuros*: los balances del mes proyectados por el motor
   (`partirBalance(...).delMes` de cada mes que viene), como si todo lo que sobra fuera al
   cajón.
Hasta 3 meses de estimación es gratis; más es premium (S1). Propuesta: sumar lo estimado al
total del cajón en la moneda de la cuenta, sin cotizaciones (los bolsillos en otra unidad
se muestran aparte o se valúan al precio de compra del último ahorro).
