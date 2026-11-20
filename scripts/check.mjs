/**
 * Controlli del repository (npm run check), prima dei test e della release.
 * Regole: claude/standard-comuni.md, sezione 4, più i vincoli propri di Keep Watching
 * (nessun permesso nuovo senza dirlo, domini del player allineati, nessuna richiesta di
 * rete oltre ai file raw del repository, innerHTML solo con modelli fissi).
 *
 * Variabili d'ambiente: RELEASE_TAG=vx.y.z controlla anche il tag; STRICT=1 (in release)
 * rende obbligatorio lo zip nella radice.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const ROOT = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const errors = [];
const warnings = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const json = (p) => { try { return JSON.parse(read(p)); } catch (e) { errors.push(`${p}: JSON non valido (${e.message})`); return {}; } };
const SEMVER = /^\d+\.\d+\.\d+$/;
const NAME = 'Keep_Watching';

// ---------- Versioni ----------
const manifest = json('manifest.json');
const pkg = json('package.json');
const lock = exists('package-lock.json') ? json('package-lock.json') : {};
const vj = json('version.json');
const version = manifest.version;
if (!SEMVER.test(version || '')) errors.push(`Versione del manifest non x.y.z: ${version}`);
const versions = { 'manifest.json': version, 'package.json': pkg.version, 'package-lock.json': lock.version, 'version.json': vj.version };
if (new Set(Object.values(versions)).size !== 1) errors.push(`Versioni non allineate: ${JSON.stringify(versions)}`);
const tag = process.env.RELEASE_TAG;
if (tag && !/^v\d+\.\d+\.\d+$/.test(tag)) errors.push(`Il tag ${tag} non è nella forma vx.y.z`);
if (tag && tag.slice(1) !== version) errors.push(`Il tag ${tag} non corrisponde alla versione ${version}`);
const changelog = read('CHANGELOG.md');
const section = new RegExp(`^## \\[${version.replace(/\./g, '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'm').exec(changelog);
if (!section) errors.push(`CHANGELOG.md non ha la sezione «## [${version}] - AAAA-MM-GG»`);

// ---------- version.json (sezione 2) ----------
const zipName = `${NAME}-${version}.zip`;
const VJ_KEYS = ['version', 'date', 'zip', 'sha256', 'notes', 'notesEn', 'minAndroid'];
for (const k of Object.keys(vj)) if (!VJ_KEYS.includes(k)) errors.push(`version.json: campo non previsto «${k}»`);
if (section && vj.date !== section[1]) errors.push(`version.json: date ${vj.date} diversa da quella del CHANGELOG (${section[1]})`);
if (vj.zip !== zipName) errors.push(`version.json: zip deve essere ${zipName} (lo scrive npm run package)`);
if (!/^[0-9a-f]{64}$/.test(vj.sha256 || '')) errors.push('version.json: sha256 mancante o non valido (lo scrive npm run package)');
if (!Array.isArray(vj.notes) || vj.notes.length > 12 || vj.notes.some((n) => typeof n !== 'string' || !n.trim() || n.length > 300)) {
  errors.push('version.json: notes deve essere un elenco di al massimo 12 testi da 300 caratteri');
}

// ---------- Zip nella radice ----------
const rootZips = fs.readdirSync(ROOT).filter((f) => /^Keep_Watching-\d+\.\d+\.\d+\.zip$/.test(f));
if (rootZips.length > 1) errors.push(`Nella radice ci sono più zip: ${rootZips.join(', ')}`);
if (!rootZips.includes(zipName)) {
  (process.env.STRICT ? errors : warnings).push(`Nella radice manca ${zipName}: esegui npm run package`);
} else if (/^[0-9a-f]{64}$/.test(vj.sha256 || '')) {
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, zipName))).digest('hex');
  if (hash !== vj.sha256) errors.push(`Lo SHA-256 di ${zipName} (${hash.slice(0, 12)}…) non è quello di version.json`);
}
const readme = read('README.md');
for (const m of readme.matchAll(/Keep_Watching-(\d+\.\d+\.\d+)\.zip/g)) if (m[1] !== version) errors.push(`README.md cita ${m[0]} invece di ${zipName}`);

// ---------- Manifest ----------
const refs = [manifest.background?.service_worker, manifest.action?.default_popup, ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
  ...(manifest.declarative_net_request?.rule_resources || []).map((r) => r.path)];
for (const r of refs.filter(Boolean)) if (!exists(r)) errors.push(`File del manifest mancante: ${r}`);
const sw = manifest.background?.service_worker ? read(manifest.background.service_worker) : '';
for (const m of sw.matchAll(/importScripts\(([^)]*)\)/g)) {
  for (const f of m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)) {
    const p = f.startsWith('/') ? f.slice(1) : path.posix.join(path.posix.dirname(manifest.background.service_worker), f);
    if (!exists(p)) errors.push(`importScripts del service worker: manca ${p}`);
  }
}
// Permessi: un permesso nuovo va spiegato nel CHANGELOG e aggiunto qui apposta (C1).
const PERMISSIONS = ['declarativeNetRequest', 'notifications', 'storage'];
if (JSON.stringify([...(manifest.permissions || [])].sort()) !== JSON.stringify(PERMISSIONS)) errors.push(`Permessi diversi da quelli previsti: ${JSON.stringify(manifest.permissions)}`);
if (manifest.host_permissions?.length || manifest.optional_permissions?.length) errors.push('host_permissions o optional_permissions non previsti');

// Domini del player: src/hosts.js, manifest (player.js) e rules.json devono coincidere.
const hosts = (/const KW_PLAYER_HOSTS = \[([^\]]*)\]/.exec(read('src/hosts.js')) || [])[1]?.match(/[a-z0-9.-]+\.[a-z]+/g)?.sort() || [];
const playerScript = (manifest.content_scripts || []).find((c) => (c.js || []).includes('src/player.js'));
const fromManifest = [...new Set((playerScript?.matches || []).map((m) => /^(?:https|\*):\/\/(?:\*\.)?([^/*]+)\//.exec(m)?.[1]).filter(Boolean))].sort();
const rules = json('rules.json');
const ruleSets = (Array.isArray(rules) ? rules : []).map((r) => [...(r.condition?.requestDomains || [])].sort());
if (!hosts.length) errors.push('src/hosts.js: KW_PLAYER_HOSTS non trovato');
if (JSON.stringify(hosts) !== JSON.stringify(fromManifest)) errors.push(`Domini del player diversi: hosts.js ${hosts} · manifest ${fromManifest}`);
for (const r of ruleSets) if (JSON.stringify(r) !== JSON.stringify(hosts)) errors.push(`rules.json: requestDomains ${r} diversi da hosts.js ${hosts}`);

// ---------- links.json (sezione 1) e coerenza con src/lib/links.js ----------
const links = json('links.json');
const HOSTS = ['github.com', 'discord.gg', 'discord.com', 'ko-fi.com', 'mashaup.github.io'];
const OWN = { github: ['github.com'], discord: ['discord.gg', 'discord.com'], kofi: ['ko-fi.com'] };
if (links.schemaVersion !== 1) errors.push('links.json: schemaVersion deve essere 1');
if (links.project !== 'keep-watching') errors.push('links.json: project deve essere "keep-watching"');
if (!Number.isInteger(links.revision) || links.revision < 1) errors.push('links.json: revision deve essere un intero da 1 in su');
for (const k of Object.keys(links)) if (!['schemaVersion', 'project', 'revision', 'links'].includes(k)) errors.push(`links.json: campo non previsto «${k}»`);
for (const [id, l] of Object.entries(links.links || {})) {
  if (!/^[a-z]+$/.test(id)) errors.push(`links.json: chiave «${id}» non valida (solo lettere minuscole)`);
  let u = null;
  try { u = new URL(l.url); } catch { /* sotto */ }
  if (!u || u.protocol !== 'https:' || !(OWN[id] || HOSTS).includes(u.hostname)) errors.push(`links.json: indirizzo non consentito per «${id}»: ${l.url}`);
  if (typeof l.enabled !== 'boolean' || typeof l.label !== 'string' || !l.label) errors.push(`links.json: «${id}» deve avere enabled (sì/no) e label`);
  for (const k of Object.keys(l)) if (!['url', 'enabled', 'label', 'description', 'icon', 'order'].includes(k)) errors.push(`links.json: «${id}» ha il campo non previsto «${k}»`);
}
for (const k of ['github', 'discord', 'kofi', 'documentation', 'changelog', 'bugs', 'ideas']) if (!links.links?.[k]) errors.push(`links.json: manca «${k}»`);
try {
  const L = require(path.join(ROOT, 'src/lib/links.js'));
  const p = L.parseRemote(read('links.json'));
  if (!p.ok || p.rejected.length) errors.push(`links.json rifiutato da src/lib/links.js: ${p.error || p.rejected.join(', ')}`);
  for (const d of L.DEFAULTS) {
    const r = links.links?.[d.id];
    if (r && (r.url !== d.url || r.enabled !== d.enabled || r.label !== d.label)) errors.push(`links.json e i valori di serie di src/lib/links.js non coincidono per «${d.id}»`);
  }
} catch (e) { errors.push(`src/lib/links.js non caricabile: ${e.message}`); }

// ---------- File: sintassi, JSON, vincoli, segreti ----------
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'dist', '__pycache__', '_metadata'].includes(f)) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const all = walk(ROOT);
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
for (const f of all.filter((x) => /\.(js|mjs)$/.test(x))) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { errors.push(`Sintassi: ${rel(f)}\n${String(e.stderr).split('\n').slice(0, 5).join('\n')}`); }
}
for (const f of all.filter((x) => x.endsWith('.json'))) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errors.push(`${rel(f)}: JSON non valido`); } }

for (const f of all.filter((x) => rel(x).startsWith('src/') && x.endsWith('.js'))) {
  const s = fs.readFileSync(f, 'utf8');
  // Rete: nessuna telemetria, niente API di GitHub, niente codice remoto.
  for (const [re, why] of [[/api\.github\.com/, 'API di GitHub (si legge da raw.githubusercontent.com)'], [/XMLHttpRequest|sendBeacon|new WebSocket|EventSource/, 'richieste di rete non previste'],
    [/\beval\s*\(|new Function\s*\(/, 'codice eseguito da testo']]) {
    if (re.test(s)) errors.push(`${rel(f)}: ${why}`);
  }
  for (const m of s.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) {
    if (!['raw.githubusercontent.com', 'github.com', 'discord.gg', 'ko-fi.com', 'www.w3.org', 'x.invalid'].includes(m[1].toLowerCase())) errors.push(`${rel(f)}: indirizzo non previsto https://${m[1]}`);
  }
  // innerHTML solo con modelli fissi: dentro ${…} solo costanti KW_*, il CSS passato dal codice o scelte tra testi fissi.
  for (const m of s.matchAll(/\.innerHTML\s*=\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
    for (const e of m[1].matchAll(/\$\{([^}]*)\}/g)) {
      const x = e[1].trim();
      if (!/^(KW_[A-Z_]+|css)$/.test(x) && !/^[\w.&\s]+\?\s*'[^']*'\s*:\s*''$/.test(x)) errors.push(`${rel(f)}: innerHTML con un dato («\${${x}}»): usa textContent`);
    }
  }
  if (/\.innerHTML\s*=\s*[^`'"\s]/.test(s)) errors.push(`${rel(f)}: innerHTML assegnato da una variabile`);
}

const SECRETS = [/discord(?:app)?\.com\/api\/webhooks\/\d{6,}\/[\w-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bsk-[A-Za-z0-9]{32,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\bxox[abp]-[A-Za-z0-9-]{20,}/];
for (const f of all.filter((x) => /\.(js|mjs|json|md|yml|yaml|html|css|txt|py|sh|ps1)$/.test(x) && !x.endsWith('check.mjs'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const re of SECRETS) if (re.test(s)) errors.push(`Possibile segreto in ${rel(f)} (${re})`);
}
for (const f of ['.env', '.env.local', 'credentials.json', 'secrets.json']) if (exists(f)) errors.push(`File con segreti nel repository: ${f}`);

// ---------- File minimi (G8) ----------
for (const f of ['README.md', 'CHANGELOG.md', 'LICENSE', 'SECURITY.md', 'docs/ARCHITECTURE.md', 'docs/TEST_PLAN.md', 'docs/RELEASE.md',
  '.github/ISSUE_TEMPLATE/bug.yml', '.github/ISSUE_TEMPLATE/idea.yml', '.github/workflows/ci.yml', '.github/workflows/release.yml', 'links.json', 'version.json']) {
  if (!exists(f)) errors.push(`Manca ${f}`);
}
if (exists('LICENSE') && !/MIT License/.test(read('LICENSE'))) errors.push('LICENSE non è MIT');
const readmeLines = readme.split('\n').length;
if (readmeLines > 220) errors.push(`README.md troppo lungo: ${readmeLines} righe (circa 200 al massimo)`);

for (const w of warnings) console.warn(`⚠ ${w}`);
if (errors.length) { console.error(`✖ ${errors.length} problemi:\n- ${errors.join('\n- ')}`); process.exit(1); }
console.log(`✔ check: versione ${version}, ${refs.length} file del manifest, domini del player ${hosts.join(' e ')}, ${Object.keys(links.links || {}).length} collegamenti, ${all.length} file controllati`);
