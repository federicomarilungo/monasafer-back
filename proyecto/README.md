# Proyecto Monasafer

Monasafer es una app web de gestión de gastos **previsoria**: anotás los gastos que vas a
tener, reservás plata para lo difícil de estimar y la app te dice si llegás a fin de mes.
Lo que sobra es ahorro, y el objetivo es que crezca. El personaje es un mono que te salva
la plata (de ahí el nombre). Tiene que sentirse divertida, dinámica e intuitiva. Owner: Fede.

Objetivo actual: **un MVP que Fede use todos los días con sus gastos reales.**

Propuesta inicial con el razonamiento completo:
https://claude.ai/code/artifact/289473b9-fc97-4f6b-b999-207afe0b8116

## Reglas del producto

- **Saldo**: la plata real en cuenta. **Ingreso mensual** con día de cobro.
- **Balance de un mes** = lo que sobra a fin de ese mes.
  - Mes actual: saldo + ingreso si todavía no se cobró − gastos sin pagar − lo que queda
    en reservas.
  - Mes futuro: balance del mes anterior + ingreso − todos los gastos y reservas del mes.
- **Puntual**: solo en su mes. **Fijo**: todos los meses desde que se creó, hasta su
  vencimiento si tiene (ej.: "zapatillas en cuotas", USD 60 hasta octubre). Se puede
  cambiar el monto de un mes sin tocar los otros.
- **Reserva**: resta el monto completo; lo que queda baja proporcional a los días del mes
  o con usos cargados a mano (lo elige el usuario por reserva).
- **Pagar** un gasto lo marca pagado y lo descuenta del saldo: el balance no se mueve.

## Archivos

- [BACKLOG.md](BACKLOG.md): tareas con prioridad, estado y dependencias.
- [PREGUNTAS.md](PREGUNTAS.md): lo que se necesita de Fede, cada pregunta con recomendación.
- [INFRA.md](INFRA.md): producción, ids, variables, qué se alcanza desde el entorno cloud.

Copia de trabajo: en el proyecto de Claude (claude.ai) estos archivos están también en
`/mnt/project-files/backlog/`. Si se retoma sin el proyecto de Claude, esta carpeta es la
fuente.

## Los repos

- `monasafer-back` (NestJS + Mongo): la API y el motor de cálculo (`src/motor/`).
- `monasafer-front` (HTML, CSS y JS sin framework, Vite): la web. Elección de Fede
  (20/10/2026): nada de React.

## Cómo trabajamos (igual que abisal)

- Fede entra una o dos veces por día. El proyecto avanza solo a partir del backlog.
- Claude es owner del progreso: commitea directo a `main` y deploya. Si algo se rompe, se
  revierte el commit.
- Las dudas no frenan: van a PREGUNTAS.md con una recomendación. 🔴 bloquea, 🟢 se sigue
  la recomendación si Fede no responde en el ciclo siguiente.
- Con Fede: sugerencias ("convendría que…"), nunca en imperativo.
- El ciclo automático (skill [`ciclo-autonomo`](../.claude/skills/ciclo-autonomo/SKILL.md))
  trabaja hasta 3 tareas por vuelta, cada una deployada y verificada.

## Lo que Claude no hace solo

- Gastar plata, crear cuentas pagas o contratar servicios (la app de DO de USD 5/mes ya
  está autorizada, 20/10/2026).
- Mandar mensajes fuera del proyecto.
- Borrar datos en producción.
