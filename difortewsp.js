#!/usr/bin/env node
'use strict'
// difortewsp — CLI de la plataforma WhatsApp de Di Forte.
// Login por navegador (como Claude Code): `difortewsp login` abre el Studio, te logueás
// y el Studio le pasa tu token al CLI. No usa service_role ni necesita el repo.
// Cero dependencias: solo Node built-ins (fetch global, http, fs, path).

const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')
const readline = require('readline')
const { exec } = require('child_process')

// ---------------------------------------------------------------- config / sesión
const DEFAULTS = {
  SB_URL: 'https://unzdbktzublsfxkespqy.supabase.co',
  ANON: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuemRia3R6dWJsc2Z4a2VzcHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NTk3NDcsImV4cCI6MjA3NzMzNTc0N30.lxCYUAWixBNiZaxPC3xlDmQwEugC_23GZMSScyGTlv4',
  N8N: 'https://n8n.diforteliving.com',
  STUDIO: 'https://studio.diforteliving.com',
}
const STORE_PATH = path.join(os.homedir(), '.difortewsp.json')
function loadStore() { try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) } catch (e) { return {} } }
function saveStore(o) { fs.writeFileSync(STORE_PATH, JSON.stringify(o, null, 2)); try { fs.chmodSync(STORE_PATH, 0o600) } catch (e) {} }
let STORE = loadStore()
const CFG = {
  SB_URL: process.env.DWSP_SB_URL || STORE.SB_URL || DEFAULTS.SB_URL,
  ANON: process.env.DWSP_ANON || STORE.ANON || DEFAULTS.ANON,
  N8N: process.env.DWSP_N8N || STORE.N8N || DEFAULTS.N8N,
  STUDIO: process.env.DWSP_STUDIO || STORE.STUDIO || DEFAULTS.STUDIO,
}

// ---------------------------------------------------------------- helpers de salida
const C = { reset: '\x1b[0m', dim: '\x1b[2m', b: '\x1b[1m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m' }
const ok = (s) => console.log(`${C.green}✓${C.reset} ${s}`)
const info = (s) => console.log(`${C.cyan}›${C.reset} ${s}`)
const warn = (s) => console.log(`${C.yellow}!${C.reset} ${s}`)
function die(s) { console.error(`${C.red}✗ ${s}${C.reset}`); process.exit(1) }
const cleanPhone = (p) => {
  let d = String(p || '').replace(/\D/g, ''); if (!d) return null
  if (d.startsWith('549')) { /* ya correcto */ }
  else if (d.startsWith('54') && d.length === 12) d = '549' + d.slice(2)
  else if (d.length === 10) d = '549' + d
  else if (d.length === 11 && d[0] === '9') d = '54' + d
  return d.length >= 8 ? '+' + d : null
}

// ---------------------------------------------------------------- auth (JWT + refresh)
async function getAccessToken() {
  STORE = loadStore()
  if (!STORE.access_token) die('No estás logueado. Corré:  difortewsp login')
  const now = Math.floor(Date.now() / 1000)
  if (STORE.expires_at && STORE.expires_at - now > 60) return STORE.access_token
  if (!STORE.refresh_token) die('Sesión vencida. Corré:  difortewsp login')
  const r = await fetch(CFG.SB_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: CFG.ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: STORE.refresh_token }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) die('No pude refrescar la sesión. Corré:  difortewsp login')
  STORE.access_token = j.access_token; STORE.refresh_token = j.refresh_token || STORE.refresh_token; STORE.expires_at = j.expires_at || (now + (j.expires_in || 3600))
  saveStore(STORE)
  return j.access_token
}
async function sb(method, pathq, body, prefer) {
  const t = await getAccessToken()
  const headers = { apikey: CFG.ANON, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }
  if (prefer) headers.Prefer = prefer
  const r = await fetch(CFG.SB_URL + '/rest/v1/' + pathq, { method, headers, body: body != null ? JSON.stringify(body) : undefined })
  const txt = await r.text()
  let data = null; try { data = txt ? JSON.parse(txt) : null } catch (e) { data = txt }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof data === 'object' ? JSON.stringify(data) : data}`)
  return data
}
async function n8n(pathSeg, payload) {
  const t = await getAccessToken()
  const r = await fetch(CFG.N8N + '/webhook/' + pathSeg, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(payload) })
  const j = await r.json().catch(() => ({ ok: false, error: 'respuesta inválida' }))
  if (!j.ok) throw new Error(j.error || ('HTTP ' + r.status))
  return j
}

// ---------------------------------------------------------------- utilidades
function parseArgs(argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t.startsWith('--')) { const k = t.slice(2); const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[k] = true; else { a[k] = n; i++ } }
    else a._.push(t)
  }
  return a
}
function readDef(file) {
  if (!file) die('Indicá el archivo de definición (.json).')
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) die('No existe el archivo: ' + p)
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { die('JSON inválido en ' + file + ': ' + e.message) }
}
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ',') { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c !== '\r') field += c }
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ''))
}
function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"` : process.platform === 'win32' ? `start "" "${url}"` : `xdg-open "${url}"`
  exec(cmd, () => {})
}
// "Hola {{nombre}}, {{empresa}}" -> { numbered, names:["nombre","empresa"] }
function numberTemplate(body) {
  const idx = {}; const names = []
  const numbered = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, name) => {
    if (/^\d+$/.test(name)) return `{{${name}}}`
    if (!idx[name]) { names.push(name); idx[name] = String(names.length) }
    return `{{${idx[name]}}}`
  })
  return { numbered, names }
}

// ---------------------------------------------------------------- login / sesión
async function cmdLogin() {
  await new Promise((resolve) => {
    let done = false
    const server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
      if (req.method === 'POST' && req.url.startsWith('/cli-auth')) {
        let b = ''; req.on('data', c => b += c); req.on('end', () => {
          let j = {}; try { j = JSON.parse(b) } catch (e) {}
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}')
          if (j.access_token) {
            saveStore({ SB_URL: j.sb_url || CFG.SB_URL, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at, email: j.email })
            ok(`Conectado como ${C.b}${j.email || 'usuario'}${C.reset}. Ya podés usar el CLI.`)
          } else warn('No recibí el token de sesión.')
          done = true; setTimeout(() => { try { server.close() } catch (e) {} resolve() }, 200)
        })
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const url = `${CFG.STUDIO}/?cliport=${port}`
      info('Abriendo el Studio para iniciar sesión…')
      console.log(`  ${C.cyan}${url}${C.reset}`)
      console.log(`  ${C.dim}Si no se abre solo, pegá ese link en el navegador.${C.reset}`)
      openBrowser(url)
      info('Esperando que autorices en el navegador… (Ctrl+C para cancelar)')
    })
    setTimeout(() => { if (!done) { warn('Tiempo agotado.'); try { server.close() } catch (e) {} resolve() } }, 300000)
  })
}
function cmdLogout() { try { fs.unlinkSync(STORE_PATH) } catch (e) {} ok('Sesión cerrada.') }
async function cmdConfig() {
  STORE = loadStore()
  console.log(`${C.b}difortewsp${C.reset}`)
  console.log(`  Studio    ${CFG.STUDIO}`)
  console.log(`  Supabase  ${CFG.SB_URL}`)
  if (STORE.access_token) {
    const now = Math.floor(Date.now() / 1000)
    const exp = STORE.expires_at ? (STORE.expires_at - now > 0 ? `vence en ${Math.round((STORE.expires_at - now) / 60)} min (se refresca solo)` : 'vencido (se refresca al usar)') : ''
    console.log(`  Sesión    ${C.green}✓ ${STORE.email || 'usuario'}${C.reset} ${C.dim}${exp}${C.reset}`)
  } else {
    console.log(`  Sesión    ${C.red}✗ sin login${C.reset} — corré: difortewsp login`)
  }
}

// ---------------------------------------------------------------- comandos de datos
async function cmdNumbers() {
  const nums = await sb('GET', 'wa_numbers?select=phone,label,agent_key,is_active&order=created_at')
  if (!nums.length) return warn('No hay números cargados.')
  console.log(`${C.b}Números${C.reset}`)
  for (const n of nums) console.log(`  ${n.is_active ? C.green + '●' : C.dim + '○'}${C.reset} ${n.phone}  ${C.dim}${n.label || ''} · agente ${n.agent_key || '-'}${C.reset}`)
}
async function cmdLists() {
  const cols = await sb('GET', 'lead_collections?select=id,name,lead_count&order=created_at.desc')
  if (!cols.length) return warn('No hay listas. Importá con: difortewsp import <csv> --list "Nombre"')
  console.log(`${C.b}Listas de leads${C.reset}`)
  for (const c of cols) console.log(`  ${C.cyan}${c.name}${C.reset}  ${C.dim}${c.lead_count ?? '?'} leads · ${c.id}${C.reset}`)
}
async function cmdTemplatesList() {
  const t = await sb('GET', 'wa_templates?select=friendly_name,status,content_sid,body_preview&order=created_at.desc')
  if (!t.length) return warn('No hay plantillas. Creá con: difortewsp templates create --name x --body "..."')
  console.log(`${C.b}Plantillas${C.reset}`)
  const ic = { approved: C.green + '✓ aprobada', submitted: C.yellow + '⏳ en revisión', pending: C.yellow + '⏳ pendiente', rejected: C.red + '✗ rechazada' }
  for (const x of t) {
    console.log(`  ${ic[x.status] || x.status}${C.reset}  ${C.b}${x.friendly_name}${C.reset}`)
    console.log(`     ${C.dim}${(x.body_preview || '').replace(/\n/g, ' ').slice(0, 90)}${C.reset}`)
  }
}
async function cmdTemplatesCreate(a) {
  const name = a.name, body = a.body
  if (!name || !body) die('Uso: difortewsp templates create --name diforte_xxx --body "Hola {{nombre}}!" [--category MARKETING|UTILITY] [--lang es]')
  if (!/^[a-z0-9_]+$/.test(name)) die('El nombre solo admite minúsculas, números y guion bajo (ej: diforte_promo_julio).')
  const { numbered, names } = numberTemplate(body)
  info(`Creando "${name}" y enviándola a aprobación de Meta…`)
  await n8n('studio-templates', { action: 'create', friendly_name: name, category: (a.category || 'MARKETING').toUpperCase(), language: a.lang || 'es', body: numbered, variable_names: names })
  ok(`Plantilla "${name}" creada y enviada a revisión. Se aprueba sola en minutos/horas (mirá con: difortewsp templates).`)
}
async function cmdTemplatesSync() {
  info('Consultando estado a Meta…')
  const r = await n8n('studio-templates', { action: 'refresh' })
  ok(`Estados sincronizados${r.updated != null ? ` (${r.updated} cambios)` : ''}.`)
}
async function cmdMedia(a) {
  const file = a._[1]
  if (!file) die('Uso: difortewsp media <archivo> [--bucket stock]')
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) die('No existe: ' + p)
  const buf = fs.readFileSync(p)
  if (buf.length > 8 * 1024 * 1024) die('Máximo 8MB.')
  const ext = (path.extname(p).slice(1) || 'bin').toLowerCase()
  const ctMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', pdf: 'application/pdf' }
  info(`Subiendo ${path.basename(p)} (${(buf.length / 1024).toFixed(0)} KB)…`)
  const r = await n8n('studio-media', { action: 'upload', name: path.basename(p), contentType: ctMap[ext] || 'application/octet-stream', dataBase64: buf.toString('base64') })
  ok('Subido. URL pública:')
  console.log(r.url)
}
async function cmdImport(a) {
  const file = a._[1]; const listName = a.list
  if (!file || !listName) die('Uso: difortewsp import <archivo.csv> --list "Nombre de la lista"')
  const p = path.resolve(process.cwd(), file)
  if (!fs.existsSync(p)) die('No existe: ' + p)
  const rows = parseCSV(fs.readFileSync(p, 'utf8'))
  if (rows.length < 2) die('El CSV no tiene filas de datos.')
  const headers = rows[0].map(h => h.trim().toLowerCase())
  const findCol = (...names) => { for (const n of names) { const i = headers.indexOf(n); if (i >= 0) return i } return -1 }
  const ci = { name: findCol('business_name', 'nombre', 'name', 'negocio', 'empresa', 'razon social'), phone: findCol('phone', 'telefono', 'teléfono', 'celular', 'whatsapp', 'tel'), email: findCol('email', 'correo', 'mail', 'e-mail'), city: findCol('city', 'ciudad', 'localidad'), province: findCol('province', 'provincia', 'estado') }
  if (ci.phone < 0) die('No encontré columna de teléfono. Headers: ' + headers.join(', '))
  const byPhone = {}
  for (const r of rows.slice(1)) {
    const phone = cleanPhone(r[ci.phone]); if (!phone) continue
    byPhone[phone] = { business_name: (ci.name >= 0 ? r[ci.name].trim() : '') || phone, phone, email: ci.email >= 0 ? r[ci.email].trim() || null : null, city: ci.city >= 0 ? r[ci.city].trim() || null : null, province: ci.province >= 0 ? r[ci.province].trim() || null : null, source: 'cli_import', business_type: 'whatsapp' }
  }
  const uniq = Object.values(byPhone)
  if (!uniq.length) die('No quedaron leads válidos (revisá los teléfonos).')
  info(`${uniq.length} leads válidos. Creando lista "${listName}"…`)
  const col = await sb('POST', 'lead_collections', [{ name: listName, description: 'Importado por CLI desde ' + path.basename(p), lead_count: uniq.length }], 'return=representation')
  const colId = col[0].id
  const phones = uniq.map(l => l.phone); const existById = {}
  for (let i = 0; i < phones.length; i += 100) {
    const slice = phones.slice(i, i + 100)
    const ex = await sb('GET', 'business_leads?select=id,phone&phone=in.(' + slice.map(x => '"' + x + '"').join(',') + ')')
    for (const e of ex) existById[e.phone] = e.id
  }
  const nuevos = uniq.filter(l => !existById[l.phone])
  for (let i = 0; i < nuevos.length; i += 200) { const ins = await sb('POST', 'business_leads', nuevos.slice(i, i + 200), 'return=representation'); for (const e of ins) existById[e.phone] = e.id }
  const items = uniq.map(l => ({ collection_id: colId, lead_id: existById[l.phone] })).filter(x => x.lead_id)
  for (let i = 0; i < items.length; i += 300) await sb('POST', 'lead_collection_items', items.slice(i, i + 300), 'return=minimal')
  ok(`Lista "${listName}" creada con ${items.length} leads (${nuevos.length} nuevos).`)
}

// ---------------------------------------------------------------- campañas
async function resolveTemplate(nameOrSid) {
  if (/^HX[0-9a-f]{32}$/i.test(nameOrSid)) return nameOrSid
  const t = await sb('GET', `wa_templates?or=(friendly_name.eq.${encodeURIComponent(nameOrSid)},key.eq.${encodeURIComponent(nameOrSid)})&select=content_sid,status,friendly_name&limit=1`)
  if (!t.length) throw new Error(`Plantilla no encontrada: "${nameOrSid}". Creala con: difortewsp templates create …`)
  if (t[0].status !== 'approved') warn(`Plantilla "${nameOrSid}" en estado "${t[0].status}" (no aprobada aún). Se guarda igual; no envía hasta aprobarse.`)
  return t[0].content_sid
}
async function buildCampaign(def) {
  if (!def.name) die('La definición necesita "name".')
  let lead_collection_id = null
  if (def.audience) {
    const isUuid = /^[0-9a-f-]{36}$/i.test(def.audience)
    const q = isUuid ? `id=eq.${def.audience}` : `name=eq.${encodeURIComponent(def.audience)}`
    const cols = await sb('GET', `lead_collections?select=id,name&${q}&limit=1`).catch(() => [])
    if (!cols.length) die(`Audiencia no encontrada: "${def.audience}". Mirá: difortewsp lists`)
    lead_collection_id = cols[0].id
  }
  const steps = []
  for (const [i, s] of (def.steps || []).entries()) {
    const content_sid = s.template ? await resolveTemplate(s.template) : (s.content_sid || null)
    steps.push({ order_index: i, message_type: s.media ? 'image' : 'text', text: s.text || '', media_url: s.media || null, delay_minutes: s.delay_minutes || s.delay || 0, content_sid })
  }
  if (!steps.length) die('La campaña necesita al menos un paso en "steps".')
  return { payload: { name: def.name, channel: 'whatsapp_oficial', campaign_type: def.type || 'prospeccion', sender_number: def.number || null, lead_collection_id, status: def.launch ? 'active' : 'draft' }, steps }
}
async function enrollCollection(campId, colId) {
  const items = await sb('GET', `lead_collection_items?select=lead_id&collection_id=eq.${colId}&limit=5000`)
  const leadIds = items.map(i => i.lead_id); if (!leadIds.length) return 0
  const leads = await sb('GET', `business_leads?select=id,phone&id=in.(${leadIds.join(',')})&opted_out=eq.false`)
  const existing = await sb('GET', `wa_sequence_enrollments?select=lead_id&campaign_id=eq.${campId}`)
  const seen = new Set(existing.map(e => e.lead_id))
  const rows = leads.filter(l => l.phone && !seen.has(l.id)).map(l => ({ campaign_id: campId, lead_id: l.id, wa_id: cleanPhone(l.phone), step_index: 0, status: 'active', next_at: new Date().toISOString() })).filter(r => r.wa_id)
  let ins = 0
  for (let i = 0; i < rows.length; i += 200) { await sb('POST', 'wa_sequence_enrollments', rows.slice(i, i + 200), 'return=minimal'); ins += Math.min(200, rows.length - i) }
  return ins
}
async function cmdCampaignCreate(a) {
  const def = readDef(a._[2])
  if (a.launch) def.launch = true
  const { payload, steps } = await buildCampaign(def)
  info(`Creando campaña "${payload.name}" (${payload.campaign_type}, ${steps.length} paso/s)…`)
  const camp = await sb('POST', 'campaigns', [payload], 'return=representation')
  const campId = camp[0].id
  await sb('POST', 'campaign_messages', steps.map(s => ({ ...s, campaign_id: campId })), 'return=minimal')
  ok(`Campaña creada: ${campId} (${payload.status})`)
  if (def.launch && payload.lead_collection_id) {
    const n = await enrollCollection(campId, payload.lead_collection_id)
    ok(`Lanzada — ${n} leads inscriptos. El motor empieza a enviar respetando los tiempos.`)
  } else if (def.launch) warn('Activa pero sin audiencia. Inscribí con: difortewsp campaign launch ' + campId)
  else info('En borrador. Para lanzarla: difortewsp campaign launch ' + campId)
}
async function findCampaign(idOrName) {
  const q = /^[0-9a-f-]{36}$/i.test(idOrName) ? `id=eq.${idOrName}` : `name=eq.${encodeURIComponent(idOrName)}`
  const c = await sb('GET', `campaigns?select=id,name,status,lead_collection_id&${q}&limit=1`)
  if (!c.length) die('Campaña no encontrada: ' + idOrName)
  return c[0]
}
async function cmdCampaignLaunch(a) {
  const c = await findCampaign(a._[2] || die('Uso: difortewsp campaign launch <id|nombre>'))
  await sb('PATCH', `campaigns?id=eq.${c.id}`, { status: 'active' }, 'return=minimal')
  let n = 0; if (c.lead_collection_id) n = await enrollCollection(c.id, c.lead_collection_id)
  ok(`Campaña "${c.name}" activa — ${n} leads inscriptos.`)
}
async function cmdCampaignPause(a, resume) {
  const c = await findCampaign(a._[2] || die('Indicá id o nombre'))
  await sb('PATCH', `campaigns?id=eq.${c.id}`, { status: resume ? 'active' : 'paused' }, 'return=minimal')
  ok(`Campaña "${c.name}" ${resume ? 'reactivada' : 'pausada'}.`)
}
async function cmdCampaignList() {
  const camps = await sb('GET', `campaigns?channel=eq.whatsapp_oficial&select=id,name,status,campaign_type&order=created_at.desc`)
  if (!camps.length) return warn('No hay campañas.')
  const ids = camps.map(c => c.id)
  const enr = ids.length ? await sb('GET', `wa_sequence_enrollments?select=campaign_id,status&campaign_id=in.(${ids.join(',')})&limit=20000`) : []
  const stat = {}; for (const e of enr) { const s = stat[e.campaign_id] = stat[e.campaign_id] || { t: 0, done: 0 }; s.t++; if (e.status === 'completed' || e.status === 'done') s.done++ }
  console.log(`${C.b}Campañas${C.reset}`)
  for (const c of camps) {
    const s = stat[c.id] || { t: 0, done: 0 }
    const col = c.status === 'active' ? C.green : c.status === 'paused' ? C.yellow : C.dim
    console.log(`  ${col}● ${c.status}${C.reset}  ${C.b}${c.name}${C.reset} ${C.dim}(${c.campaign_type}) · ${s.t} inscriptos · ${s.done} completados · ${c.id}${C.reset}`)
  }
}

// ---------------------------------------------------------------- TUI interactivo (comando `diforte`)
function banner() {
  const L = {
    D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
    I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
    ' ': ['   ', '   ', '   ', '   ', '   ', '   '],
    F: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '██║     ', '╚═╝     '],
    O: [' ██████╗ ', '██╔═══██╗', '██║   ██║', '██║   ██║', '╚██████╔╝', ' ╚═════╝ '],
    R: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██║  ██║', '╚═╝  ╚═╝'],
    T: ['████████╗', '╚══██╔══╝', '   ██║   ', '   ██║   ', '   ██║   ', '   ╚═╝   '],
    E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
  }
  const word = 'DI FORTE', lines = []
  for (let r = 0; r < 6; r++) lines.push('  ' + [...word].map(ch => L[ch][r]).join(''))
  return C.cyan + C.b + lines.join('\n') + C.reset
}
function prompt(q) { return new Promise(r => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(`  ${q} `, a => { rl.close(); r(a.trim()) }) }) }
function pause() { return prompt(`${C.dim}— Enter para volver al menú —${C.reset}`).then(() => {}) }
function menu(items, title) {
  return new Promise((resolve) => {
    let idx = 0
    readline.emitKeypressEvents(process.stdin)
    if (process.stdin.isTTY) process.stdin.setRawMode(true)
    process.stdin.resume()
    const total = (title ? 1 : 0) + items.length + 1
    let first = true
    const draw = () => {
      if (!first) process.stdout.write('\r\x1b[' + (total - 1) + 'A')
      first = false
      const lines = []
      if (title) lines.push(`  ${C.b}${title}${C.reset}`)
      items.forEach((it, i) => lines.push(i === idx ? `  ${C.cyan}❯ ${it}${C.reset}` : `    ${C.dim}${it}${C.reset}`))
      lines.push(`  ${C.dim}↑↓ moverse · Enter elegir · Esc volver${C.reset}`)
      process.stdout.write(lines.map(l => l + '\x1b[0K').join('\n'))
    }
    draw()
    const onKey = (s, k) => {
      if (!k) return
      if (k.ctrl && k.name === 'c') { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdout.write('\n'); process.exit(0) }
      if (k.name === 'up') { idx = (idx - 1 + items.length) % items.length; draw() }
      else if (k.name === 'down') { idx = (idx + 1) % items.length; draw() }
      else if (k.name === 'return') done(idx)
      else if (k.name === 'escape') done(-1)
    }
    const done = (v) => { process.stdin.removeListener('keypress', onKey); if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdout.write('\n'); resolve(v) }
    process.stdin.on('keypress', onKey)
  })
}
async function viewPanorama() {
  console.log(`\n  ${C.b}Panorama${C.reset}\n`)
  try {
    const [camps, tpls, cols, nums] = await Promise.all([
      sb('GET', 'campaigns?channel=eq.whatsapp_oficial&select=status'),
      sb('GET', 'wa_templates?select=status'),
      sb('GET', 'lead_collections?select=lead_count'),
      sb('GET', 'wa_numbers?select=is_active'),
    ])
    const cActive = camps.filter(c => c.status === 'active').length
    const tApp = tpls.filter(t => t.status === 'approved').length
    const tPend = tpls.filter(t => t.status === 'submitted' || t.status === 'pending').length
    const leads = cols.reduce((a, c) => a + (c.lead_count || 0), 0)
    console.log(`  🚀  Campañas:  ${C.b}${camps.length}${C.reset}  (${C.green}${cActive} activas${C.reset})`)
    console.log(`  📝  Plantillas: ${C.b}${tpls.length}${C.reset}  (${C.green}${tApp} aprobadas${C.reset}, ${C.yellow}${tPend} en revisión${C.reset})`)
    console.log(`  👥  Listas:    ${C.b}${cols.length}${C.reset}  ·  ${leads} leads en total`)
    console.log(`  📱  Números:   ${C.b}${nums.length}${C.reset}`)
  } catch (e) { console.log('  ' + C.red + 'No pude cargar: ' + e.message + C.reset) }
}
async function wizardCampaign() {
  console.log(`\n  ${C.b}Nueva campaña${C.reset}  ${C.dim}(escribí y Enter · Enter vacío = cancelar)${C.reset}`)
  const name = await prompt('Nombre de la campaña:')
  if (!name) return console.log('  cancelado')
  const ti = await menu(['Prospección (frío)', 'Seguimiento (24h)'], 'Tipo'); if (ti < 0) return
  const type = ti === 0 ? 'prospeccion' : 'seguimiento'
  const nums = await sb('GET', 'wa_numbers?select=phone,label')
  let number = nums.length ? nums[0].phone : null
  if (nums.length > 1) { const ni = await menu(nums.map(n => `${n.phone}  ${n.label || ''}`), 'Número'); if (ni < 0) return; number = nums[ni].phone }
  const cols = await sb('GET', 'lead_collections?select=id,name,lead_count&order=created_at.desc')
  const ai = await menu(cols.map(c => `${c.name}  (${c.lead_count ?? '?'} leads)`).concat(['— sin audiencia —']), 'Audiencia'); if (ai < 0) return
  const audience = ai < cols.length ? cols[ai].name : null
  const tpls = await sb('GET', 'wa_templates?status=eq.approved&select=friendly_name')
  let template = null
  if (tpls.length) { const pi = await menu(tpls.map(t => t.friendly_name).concat(['— texto libre (solo dentro de 24h) —']), 'Plantilla del paso 1'); if (pi < 0) return; if (pi < tpls.length) template = tpls[pi].friendly_name }
  const def = { name, type, number, audience, steps: [template ? { template, delay_minutes: 0 } : { text: '¡Hola! Soy de Di Forte Living 🛋️', delay_minutes: 0 }] }
  console.log('\n' + C.dim + JSON.stringify(def, null, 2) + C.reset)
  const ci = await menu(['Crear en borrador', 'Crear y LANZAR (envía WhatsApps reales)', 'Cancelar'], '¿Confirmás?'); if (ci < 0 || ci === 2) return console.log('  cancelado')
  if (ci === 1) def.launch = true
  try {
    const { payload, steps } = await buildCampaign(def)
    const camp = await sb('POST', 'campaigns', [payload], 'return=representation'); const id = camp[0].id
    await sb('POST', 'campaign_messages', steps.map(s => ({ ...s, campaign_id: id })), 'return=minimal')
    if (def.launch && payload.lead_collection_id) { const n = await enrollCollection(id, payload.lead_collection_id); console.log(`  ${C.green}✓ Lanzada — ${n} leads inscriptos, el motor envía en ~1 min${C.reset}`) }
    else console.log(`  ${C.green}✓ Campaña creada (${payload.status})${C.reset}`)
  } catch (e) { console.log('  ' + C.red + e.message + C.reset) }
}
async function tui() {
  if (!process.stdin.isTTY) return console.log(HELP)
  let running = true
  while (running) {
    console.clear()
    console.log('\n' + banner())
    STORE = loadStore()
    const logged = !!STORE.access_token
    console.log(`\n  ${C.dim}Central de WhatsApp · ${logged ? C.green + '✓ ' + (STORE.email || 'sesión activa') : C.red + 'sin sesión'}${C.reset}${C.dim} · v0.3${C.reset}`)
    console.log(`  ${C.dim}Cómo moverte:${C.reset}  ${C.cyan}↑ ↓${C.reset} elegís opción  ·  ${C.cyan}Enter${C.reset} entrás  ·  ${C.cyan}Esc${C.reset} volvés  ·  ${C.cyan}Ctrl+C${C.reset} salís\n`)
    if (!logged) {
      const i = await menu(['🔑  Iniciar sesión (abre el navegador)', '❌  Salir'], 'Necesitás iniciar sesión')
      if (i === 0) { await cmdLogin(); await pause() } else running = false
      continue
    }
    const opts = ['📊  Panorama', '🚀  Campañas', '📝  Plantillas', '👥  Listas de leads', '📱  Números', '➕  Nueva campaña (guía)', '🔄  Sincronizar plantillas con Meta', '🚪  Cerrar sesión', '❌  Salir']
    const i = await menu(opts, 'Menú principal')
    if (i === -1 || i === 8) running = false
    else if (i === 0) { await viewPanorama(); await pause() }
    else if (i === 1) { console.log(''); await cmdCampaignList().catch(e => console.log('  ' + C.red + e.message)); await pause() }
    else if (i === 2) { console.log(''); await cmdTemplatesList().catch(e => console.log('  ' + C.red + e.message)); await pause() }
    else if (i === 3) { console.log(''); await cmdLists().catch(e => console.log('  ' + C.red + e.message)); await pause() }
    else if (i === 4) { console.log(''); await cmdNumbers().catch(e => console.log('  ' + C.red + e.message)); await pause() }
    else if (i === 5) { await wizardCampaign(); await pause() }
    else if (i === 6) { console.log(''); await cmdTemplatesSync().catch(e => console.log('  ' + C.red + e.message)); await pause() }
    else if (i === 7) { cmdLogout() }
  }
  console.log(`\n  ${C.cyan}¡Chau!${C.reset} 👋\n`)
  process.exit(0)
}

const HELP = `${C.b}difortewsp${C.reset} — CLI de la plataforma WhatsApp de Di Forte

${C.b}Empezá:${C.reset}  npx github:Aletsito2602/difortewsp login    ${C.dim}(abre el Studio, te logueás, listo)${C.reset}

${C.cyan}login${C.reset}                               Inicia sesión por el navegador (Studio)
${C.cyan}logout${C.reset}                              Cierra la sesión
${C.cyan}config${C.reset}                              Muestra el estado de tu sesión
${C.cyan}numbers${C.reset}                             Lista tus números de WhatsApp
${C.cyan}lists${C.reset}                               Lista las listas de leads (audiencias)
${C.cyan}templates${C.reset}                           Lista plantillas y su estado de aprobación
${C.cyan}templates create${C.reset} --name x --body "Hola {{nombre}}!" [--category MARKETING] [--lang es]
${C.cyan}templates sync${C.reset}                      Sincroniza el estado de aprobación con Meta
${C.cyan}media${C.reset} <archivo>                     Sube una imagen/video y devuelve el link público
${C.cyan}import${C.reset} <leads.csv> --list "Nombre"  Importa leads a una lista nueva
${C.cyan}campaign create${C.reset} <camp.json> [--launch]   Crea (y lanza) una campaña desde un archivo
${C.cyan}campaign launch${C.reset} <id|nombre>         Inscribe la audiencia y activa
${C.cyan}campaign pause|resume${C.reset} <id|nombre>   Pausa / reactiva
${C.cyan}campaign list${C.reset}                       Lista campañas con métricas

${C.dim}Ejemplo camp.json:
{ "name":"Mueblerías CBA", "type":"prospeccion", "number":"+5493516612413",
  "audience":"Mueblerías CBA",
  "steps":[ {"template":"diforte_opener_1","delay_minutes":0},
            {"template":"diforte_retomar_interes","delay_minutes":2880} ] }${C.reset}`

async function main() {
  const a = parseArgs(process.argv.slice(2))
  const [cmd, sub] = a._
  try {
    if (cmd === 'help' || a.help) return console.log(HELP)
    if (!cmd) return await tui()
    if (cmd === 'login') return await cmdLogin()
    if (cmd === 'logout') return cmdLogout()
    if (cmd === 'config') return await cmdConfig()
    if (cmd === 'numbers') return await cmdNumbers()
    if (cmd === 'lists') return await cmdLists()
    if (cmd === 'templates') { if (sub === 'create') return await cmdTemplatesCreate(a); if (sub === 'sync') return await cmdTemplatesSync(); return await cmdTemplatesList() }
    if (cmd === 'media') return await cmdMedia(a)
    if (cmd === 'import') return await cmdImport(a)
    if (cmd === 'campaign' || cmd === 'campaigns') {
      if (sub === 'create') return await cmdCampaignCreate(a)
      if (sub === 'launch') return await cmdCampaignLaunch(a)
      if (sub === 'pause') return await cmdCampaignPause(a, false)
      if (sub === 'resume') return await cmdCampaignPause(a, true)
      return await cmdCampaignList()
    }
    die(`Comando desconocido: "${cmd}". Probá: difortewsp help`)
  } catch (e) { die(e.message || String(e)) }
}
main()
