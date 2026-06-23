---
name: diforte
description: Operar la plataforma de WhatsApp de Di Forte (Di Forte Living, sillones) desde la terminal — crear plantillas, subir media, importar leads y armar/lanzar campañas — usando el CLI difortewsp. Usar cuando el usuario pida algo de WhatsApp, campañas, prospección, seguimiento, plantillas o leads de Di Forte.
---

# Di Forte · WhatsApp

Operás la plataforma con el CLI **difortewsp** vía la tool Bash. No requiere instalar nada (npx lo baja de GitHub).

## Comando base
```
npx github:Aletsito2602/difortewsp <comando>
```

## Sesión (hacelo primero)
- Verificá: `npx github:Aletsito2602/difortewsp config`.
- Si dice "sin login", **pedile al usuario** que corra `npx github:Aletsito2602/difortewsp login` (es por navegador: se abre el Studio, inicia sesión y autoriza). Vos no podés hacer ese paso.
- Una vez logueado, el token se refresca solo.

## Comandos
- `config` · `numbers` · `lists` · `templates` (estado) · `campaign list`
- `templates create --name diforte_xxx --body "Hola {{nombre}}!" [--category MARKETING|UTILITY]` → crea y manda a aprobar a Meta (tarda; mirá con `templates`).
- `templates sync` → actualiza estado de aprobación.
- `media <archivo>` → sube imagen/video y devuelve el link público.
- `import <leads.csv> --list "Nombre"` → crea una lista de leads.
- `campaign create <camp.json> [--launch]` → crea (y lanza) una campaña.
- `campaign launch|pause|resume <id|nombre>`.

## Definición de campaña (JSON, guardalos en `campaigns/`)
```json
{
  "name": "Mueblerías Córdoba",
  "type": "prospeccion",
  "number": "+5493516612413",
  "audience": "Mueblerías CBA",
  "steps": [
    { "template": "diforte_opener_frio", "delay_minutes": 0 },
    { "template": "diforte_retomar_interes", "delay_minutes": 2880 }
  ]
}
```
- `type`: `prospeccion` (frío; exige plantilla **aprobada**) o `seguimiento` (24h, texto libre).
- En **frío no se conoce el nombre** → usá un opener SIN variable (ej. `diforte_opener_frio`). Las plantillas con `{{nombre}}` solo sirven si la lista trae el nombre o en seguimiento.
- `delay_minutes`: espera antes del paso (2880 = 2 días). `--launch` inscribe y activa.

## Reglas
1. Antes de armar una campaña en frío, asegurate de que la plantilla esté **approved** (`templates`). Si no existe, creala y avisá que queda en revisión de Meta.
2. Si el usuario te pasa una foto/archivo, subila con `media` y usá el link en el paso.
3. **Confirmá con el usuario antes de `--launch`** — eso manda WhatsApps reales.
4. Los números argentinos se normalizan solos al inscribir (+54 9).
