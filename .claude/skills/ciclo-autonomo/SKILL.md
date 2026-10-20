---
name: ciclo-autonomo
description: Corre un ciclo del backlog autónomo de Monasafer (leer respuestas de Fede, refinar, trabajar hasta 3 tareas listas por prioridad, deployar, actualizar backlog). Usar cuando dispara la tarea programada del ciclo o cuando piden "avanzá con el backlog".
---

# Ciclo autónomo del backlog de Monasafer

Contexto: `proyecto/README.md`, `proyecto/BACKLOG.md`, `proyecto/PREGUNTAS.md`,
`proyecto/INFRA.md`. En el proyecto de Claude, la copia de trabajo está en
`/mnt/project-files/backlog/`.

## Pasos

0. **Sincronizar** `proyecto/BACKLOG.md` y `PREGUNTAS.md` con `/mnt/project-files/backlog/`
   (Fede puede editar cualquiera de las dos; pasar sus cambios a la otra).
1. **Leer respuestas** de Fede en el hilo del ciclo y en PREGUNTAS.md. Pasarlas a
   "Respondidas" con fecha y destrabar las tareas. Una 🟢 sin respuesta del ciclo
   anterior: se sigue la recomendación y se anota.
2. **Refinar 1-2 tareas** sin criterios de aceptación (criterios concretos y verificables).
   Lo que falte de Fede, a PREGUNTAS.md con recomendación; nunca una pregunta suelta.
3. **Trabajar hasta 3 tareas**, de a una, la `lista` de mayor prioridad según el orden
   sugerido. Por tarea:
   - Clonar o actualizar `monasafer-back` y `monasafer-front` en `main`.
   - Hacerla con tests. Back: `npx tsc --noEmit && npx jest && npm run build`. Front:
     `npm test && npm run build`.
   - Si toca back y front: primero el back, retrocompatible.
   - Commit directo a `main` con el porqué, push, verificar con `deploy-verificar`. Si
     prod se rompe: `git revert` y push.
   - Si se traba, anotar por qué en el backlog y pasar a la siguiente.
4. **Actualizar** BACKLOG.md en `/mnt/project-files/backlog/` y copiar los dos archivos a
   `monasafer-back/proyecto/` con un commit ("Backlog: <resumen>").
5. **Avisar**: solo el primer ciclo del día manda un mensaje en el hilo (lo hecho, links,
   preguntas 🔴 nuevas, pocas líneas). Los demás actualizan solo el checklist.

## Límites

- No gastar plata, no crear cuentas pagas, no contactar terceros, no borrar datos de prod.
- Con Fede: sugerencias, nunca imperativos.
- Hasta tres tareas por ciclo, cada una terminada y verificada.
