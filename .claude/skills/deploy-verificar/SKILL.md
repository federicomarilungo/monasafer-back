---
name: deploy-verificar
description: Verifica que un push a main de monasafer-back o monasafer-front quedó deployado y sano en DigitalOcean, y revierte si se rompió. Usar después de cada push a main.
---

# Deploy y verificación

Un push a `main` deploya solo (App Platform, `deploy_on_push`). Id de la app y URLs en
`proyecto/INFRA.md`. Necesita `DO_TOKEN` en el entorno.

1. **Esperar el deploy** del commit, consultando cada 30 s (no a ojo):
   ```bash
   curl -sS -H "Authorization: Bearer $DO_TOKEN" \
     "https://api.digitalocean.com/v2/apps/$APP/deployments?per_page=3" |
     python3 -c "import json,sys;[print(d['phase'],d['cause'][:90]) for d in json.load(sys.stdin)['deployments']]"
   ```
   `ACTIVE` bien; `ERROR` → logs con `.../deployments/<id>/logs?type=BUILD&follow=false`.
2. **Probar**: back `curl $B/ping` → 200 y `curl $B/salud` → `base: true`; endpoints
   privados sin token → 401. Front: que el HTML cargue y el bundle nuevo contenga el
   cambio (`curl` + `grep`).
3. **Si se rompió**: `git revert <sha> && git push origin main`, verificar de nuevo y
   anotar en el backlog qué pasó.
