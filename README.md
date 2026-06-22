# difortewsp — CLI

CLI sin dependencias (Node ≥18) para operar la plataforma de WhatsApp de Di Forte desde la terminal:
crear plantillas, subir media (links), importar leads y **programar campañas**.

**No necesita el repo ni claves pegadas a mano.** Te logueás por el navegador (como Claude Code / `gh auth login`):
el CLI abre el Studio, iniciás sesión, y el Studio le pasa tu token. Todo lo que hacés usa **tu cuenta** (no la
service_role), así que cada acción queda con tus permisos.

## Empezar

```bash
npx difortewsp login      # abre el Studio → login → autorizás → listo
difortewsp config         # verifica tu sesión
```

(Mientras no esté publicado en npm, corré `node cli/difortewsp.js <comando>`, o `npm link` dentro de `cli/`.)

## Comandos

| Comando | Qué hace |
|---|---|
| `login` / `logout` | Inicia / cierra sesión (navegador) |
| `config` | Estado de tu sesión |
| `numbers` | Tus números de WhatsApp |
| `lists` | Listas de leads (audiencias) |
| `templates` | Plantillas + estado de aprobación |
| `templates create --name x --body "Hola {{nombre}}!" [--category MARKETING\|UTILITY] [--lang es]` | Crea la plantilla y la manda a aprobar a Meta |
| `templates sync` | Sincroniza el estado de aprobación con Meta |
| `media <archivo>` | Sube imagen/video y devuelve el **link público** |
| `import <leads.csv> --list "Nombre"` | Importa leads (detecta columnas nombre/teléfono/email/ciudad/provincia) |
| `campaign create <camp.json> [--launch]` | Crea (y lanza) una campaña desde un archivo |
| `campaign launch <id\|nombre>` | Inscribe la audiencia y activa |
| `campaign pause\|resume <id\|nombre>` | Pausa / reactiva |
| `campaign list` | Campañas con métricas |

## Definición de campaña (`campaigns/*.json`)

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

- `template`: nombre o key de una plantilla (debe estar **aprobada** para enviar en frío).
- `text` / `media`: texto libre (solo entrega dentro de la ventana de 24h).
- `delay_minutes`: espera antes de ese paso (2880 = 2 días).
- `--launch` crea **y** lanza (inscribe la audiencia + activa). Sin `--launch` queda en borrador.

## Cómo funciona (seguridad)

- El login guarda en `~/.difortewsp.json` (chmod 600) tu **access/refresh token de Supabase** — no la service_role.
  El access token se refresca solo.
- Lecturas/escrituras de datos → Supabase REST con tu JWT (RLS de usuario autenticado).
- Plantillas, media y envíos → pasan por los webhooks de n8n con tu JWT (mismo puente que usa el Studio).
- Config por defecto (URL del Studio/Supabase, anon key pública) viene embebida; se puede sobreescribir con
  `DWSP_STUDIO`, `DWSP_SB_URL`, `DWSP_ANON`, `DWSP_N8N`.

## Flujo típico con Claude Code

1. `difortewsp media foto-promo.jpg` → copiás el link.
2. `difortewsp templates create --name diforte_promo_julio --body "Hola {{nombre}}! ..."`.
3. `difortewsp import leads.csv --list "Mueblerías CBA"`.
4. Editás `campaigns/promo-julio.json` y `difortewsp campaign create campaigns/promo-julio.json --launch`.
