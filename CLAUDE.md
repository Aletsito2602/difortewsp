# Di Forte · WhatsApp — instrucciones para Claude Code

Esta carpeta se usa para operar la plataforma de WhatsApp de Di Forte mediante el CLI **difortewsp**.
Cuando el usuario te pida crear plantillas, subir media, importar leads o **armar/lanzar una campaña**, usá este CLI con la tool Bash.

## Comando base
```
npx github:Aletsito2602/difortewsp <comando>
```
(En cada sesión, npx lo baja de GitHub; no hace falta instalar nada.)

## Sesión (importante)
- Antes de operar, verificá: `npx github:Aletsito2602/difortewsp config`.
- Si dice "sin login", **NO sigas**: el login es por navegador y lo tiene que hacer el humano.
  Pedile que corra:  `npx github:Aletsito2602/difortewsp login`  → se abre el Studio, inicia sesión y autoriza.
- Una vez logueado, el token se refresca solo.

## Comandos
- `config` · `numbers` · `lists` · `templates` (lista con estado) · `campaign list`
- `templates create --name diforte_xxx --body "Hola {{nombre}}!" [--category MARKETING|UTILITY]`
  → crea la plantilla y la manda a aprobar a Meta. **Tarda en aprobarse** (minutos/horas).
- `templates sync` → actualiza el estado de aprobación.
- `media <archivo>` → sube imagen/video y devuelve el **link público** (para usar como `media` en un paso).
- `import <leads.csv> --list "Nombre"` → crea una lista de leads (audiencia).
- `campaign create <camp.json> [--launch]` → crea (y lanza) la campaña.
- `campaign launch|pause|resume <id|nombre>`.

## Definición de campaña (JSON)
```json
{
  "name": "Mueblerías Córdoba",
  "type": "prospeccion",
  "number": "+5493516612413",
  "audience": "Mueblerías CBA",
  "steps": [
    { "template": "diforte_opener_1", "delay_minutes": 0 },
    { "template": "diforte_retomar_interes", "delay_minutes": 2880 },
    { "text": "¿Te muestro el catálogo?", "media": "https://...", "delay_minutes": 1440 }
  ]
}
```
- `type`: `prospeccion` (frío, exige plantillas aprobadas) o `seguimiento` (dentro de 24h, texto libre).
- `template`: nombre/key de una plantilla **aprobada** (verificá con `templates` antes).
- `text`/`media`: texto libre — solo entrega dentro de la ventana de 24h.
- `delay_minutes`: espera antes de ese paso (2880 = 2 días).
- `--launch`: crea **y** inscribe la audiencia + activa. Sin `--launch`, queda en borrador.

## Cómo trabajar
1. Guardá los JSON de campaña en `campaigns/` (versionados, así queda todo armado).
2. Para una campaña en frío: si la plantilla no existe, creala (`templates create`), avisá que está "en revisión" y que no envía hasta que Meta la apruebe.
3. Si el usuario te pasa una foto/archivo, subila con `media` y usá el link en el paso.
4. Confirmá con el usuario antes de `--launch` (eso ya empieza a mandar WhatsApps reales).
