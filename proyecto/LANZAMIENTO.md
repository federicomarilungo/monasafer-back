# Salida a producción y Play Store

Plan del 20/10/2026 a pedido de Fede: "la idea mañana es salir a producción con todas las
tareas, y que el MVP ya sea subible a Play Store". Tareas en [BACKLOG.md](BACKLOG.md)
(épica L); acá el porqué y el detalle.

## Lo importante primero

- **Mañana (21/10) se puede salir en la web**: https://monasafer.com ya responde con la
  app. Lo que falta para que sea una salida prolija está en la tabla, marcado 🚨.
- **Play Store mañana no se puede, aunque esté todo listo.** Las cuentas de desarrollador
  personales nuevas tienen que hacer una prueba cerrada con al menos 12 testers durante
  14 días seguidos antes de poder pedir producción (regla de Google desde fines de 2023;
  confirmarlo en la consola al crear la cuenta). Además la verificación de identidad de
  la cuenta tarda unos días. Lo realista: mañana crear la cuenta y arrancar la prueba
  cerrada en cuanto esté verificada; producción en Play alrededor del 5-10/11. Una cuenta
  de organización se salva de los 14 días pero pide D-U-N-S, que tarda más.

## Recupero de contraseña (L1)

Opciones:
1. **Email con link (recomendada).** "¿Te olvidaste la contraseña?" → ponés el email → te
   llega un link que vale 1 hora y sirve una sola vez → elegís una contraseña nueva y
   entrás. Al cambiarla se cierran las otras sesiones. La respuesta es siempre "si hay una
   cuenta, te mandamos el email", para no revelar qué emails están registrados. El link
   lleva el código después del `#` para que no quede en logs. Tope: 3 pedidos por hora
   por email.
2. Código de 6 dígitos por email: mismo envío, un paso más para tipear. No suma.
3. Sin email: que entren con Google y nada más. Deja afuera a quien no usa Google.

Proveedor de envío: **Resend** (gratis hasta 3000 emails por mes y 100 por día, API HTTP
simple, sin librería). Alternativa: Brevo (300 por día gratis). Para mandar desde
`no-responder@monasafer.com` hay que verificar el dominio: 3 o 4 registros DNS (SPF y
DKIM) en Cloudflare. Lo que le toca a Fede: crear la cuenta de Resend, agregar el dominio,
cargar esos registros en Cloudflare y poner `RESEND_API_KEY` en DO (tarea local). Mientras
no esté la clave, el back responde igual y el email no sale (queda en el log).

## Legal

- **Política de privacidad: obligatoria** para Play (la piden en la ficha y en el
  formulario de seguridad de los datos) y para el login con Google. Tiene que decir qué
  datos guardamos (email, nombre, montos y gastos que carga la persona), para qué, con
  quién se comparten (nadie; proveedores: DigitalOcean, MongoDB Atlas, Google para el
  login, Resend para los emails), cuánto se guardan y cómo borrar la cuenta. En Argentina
  aplica la Ley 25.326 de datos personales.
- **Términos y condiciones: no los exige Play, pero conviene.** Lo central: Monasafer es
  una herramienta para anotar y proyectar, no da asesoramiento financiero, no mueve plata
  ni se conecta con bancos, y los números dependen de lo que carga la persona. Al crear la
  cuenta: "Al seguir aceptás los términos y la política de privacidad".
- **Borrar la cuenta: obligatorio para Play** si la app permite crear cuentas. Tiene que
  estar dentro de la app y también en una página web que se pueda abrir sin instalar la
  app (Play pide el link).
- Los borradores los escribo yo; **Fede tiene que revisarlos y completar quién es el
  responsable** (nombre o razón social y email de contacto). No es asesoramiento legal: si
  más adelante hay cobros (premium), conviene que los mire un abogado.

## Play Store, paso a paso

1. Fede crea la cuenta de Google Play Developer (USD 25, una vez) y la verifica.
2. Yo genero el proyecto Android de la TWA con Bubblewrap (paquete
   `com.monasafer.app`, abre https://monasafer.com a pantalla completa). Para compilar
   hace falta Java y el SDK de Android: lo intento en el entorno cloud y, si no se puede,
   en la PC de Fede con Remote Control.
3. Firma: Play App Signing (Google guarda la clave de la app). La clave de subida la crea
   Bubblewrap y **la guarda Fede** (si se pierde, se pide una nueva a Google, no se pierde
   la app).
4. `/.well-known/assetlinks.json` en el front con la huella SHA-256 de la clave de firma
   de Play (sale de la consola): es lo que hace que la app abra sin la barra del
   navegador.
5. Ficha: nombre, descripción corta (80 caracteres) y larga, ícono 512, gráfico de
   portada 1024×500, al menos 2 capturas de teléfono. Los preparo yo.
6. Formularios de la consola, con las respuestas que dejo armadas: seguridad de los datos,
   clasificación de contenido, público objetivo (mayores de 18), anuncios (no), acceso a
   la app (una cuenta de prueba para los revisores), funciones financieras (gestión de
   finanzas personales, sin préstamos), link de borrado de cuenta y de privacidad.
7. Prueba cerrada con 12+ testers (emails de Gmail) durante 14 días. Fede junta los
   testers; cada uno tiene que aceptar la invitación e instalarla.
8. Pedido de acceso a producción → revisión de Google (unos días) → publicada.
