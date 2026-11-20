/**
 * Pacchetti (claude/standard-comuni.md, sezione 5).
 *   npm run build    → dist/Keep_Watching-<versione>.zip (cartella «Keep_Watching/» pronta per
 *                      «Carica estensione non pacchettizzata») + .sha256
 *   npm run package  → in più: sostituisce lo zip nella radice del repository, scrive
 *                      version.json (versione, data e novità dal CHANGELOG, zip, SHA-256),
 *                      aggiorna il nome dello zip nel README e crea dist/Keep_Watching_GitHub.zip
 *                      (cartella «Keep_Watching_GitHub/» con tutti i file del repository).
 * Lo zip è riproducibile: stessi file → stesso SHA-256 (date fisse, ordine fisso, permessi fissi),
 * così quello ricreato dalla release coincide con quello nella radice.
 * Serve il comando zip (Linux, macOS, WSL o Git Bash con zip; su GitHub Actions c'è già).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const NAME = 'Keep_Watching';
const github = process.argv.includes('--github');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versione non valida nel manifest: ${version}`);

// Data e novità della versione dal CHANGELOG («## [x.y.z] - AAAA-MM-GG», voci «- …»).
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((l) => l.startsWith(`## [${version}] - `));
if (start < 0) throw new Error(`CHANGELOG.md non ha la sezione «## [${version}] - AAAA-MM-GG»`);
const date = /(\d{4}-\d{2}-\d{2})/.exec(lines[start])?.[1];
const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
const plain = (s) => s.replace(/\*\*/g, '').replace(/`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
// La sezione «### Repository» (CI, documenti) non interessa chi usa l'estensione: non va nelle novità.
let inRepo = false;
const notes = lines.slice(start + 1, end < 0 ? undefined : end)
  .filter((l) => { if (l.startsWith('### ')) inRepo = /^### Repository/.test(l); return !inRepo; })
  .map((l) => /^\s*[-*]\s+(.*)$/.exec(l)?.[1]).filter(Boolean).map(plain)
  .map((n) => (n.length > 300 ? `${n.slice(0, 299)}…` : n)).slice(0, 12);

const INCLUDE = ['manifest.json', 'rules.json', 'icons', 'src', 'LICENSE', 'README.md', 'CHANGELOG.md'];
const MUST = ['manifest.json', 'rules.json', 'src/background.js', 'src/player.js', 'src/defaults.js', 'src/lib/links.js', 'src/lib/updates.js',
  'src/popup/popup.html', 'icons/icon128.png', 'CHANGELOG.md', 'LICENSE', 'README.md'];
const SKIP = /(\.DS_Store|Thumbs\.db|\.map|\.log|~)$/;
const FIXED_TIME = new Date(`${date}T12:00:00Z`);

const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

/** Copia in dist/<cartella>, rende fissi date e permessi e crea lo zip con i file in ordine. */
function makeZip(folder, items, zipFile, filter) {
  const stage = path.join(dist, folder);
  fs.mkdirSync(stage, { recursive: true });
  for (const item of items) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) throw new Error(`Manca ${item}`);
    fs.cpSync(from, path.join(stage, item), { recursive: true, filter });
  }
  const entries = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      fs.chmodSync(p, st.isDirectory() ? 0o755 : 0o644);
      entries.push(path.relative(dist, p).split(path.sep).join('/') + (st.isDirectory() ? '/' : ''));
      if (st.isDirectory()) walk(p);
    }
  };
  fs.chmodSync(stage, 0o755);
  walk(stage);
  const list = [`${folder}/`, ...entries];
  for (const e of list) fs.utimesSync(path.join(dist, e), FIXED_TIME, FIXED_TIME);
  execFileSync('zip', ['-X', '-q', '-D', zipFile, ...list.filter((e) => !e.endsWith('/'))], { cwd: dist, env: { ...process.env, TZ: 'UTC' } });
  fs.rmSync(stage, { recursive: true, force: true });
  return execFileSync('unzip', ['-Z1', zipFile], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const zipName = `${NAME}-${version}.zip`;
const zipPath = path.join(dist, zipName);
const listing = makeZip(NAME, INCLUDE, zipPath, (p) => !SKIP.test(p));
for (const must of MUST) if (!listing.includes(`${NAME}/${must}`)) throw new Error(`Lo zip non contiene ${must}`);
for (const no of ['tests/', 'node_modules', '.github', 'scripts/', 'docs/', 'tools/', 'package.json']) {
  if (listing.some((l) => l.startsWith(`${NAME}/${no}`))) throw new Error(`Lo zip contiene ${no}`);
}
const hash = crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex');
fs.writeFileSync(`${zipPath}.sha256`, `${hash}  ${zipName}\n`);
console.log(`✔ ${zipName} · ${listing.length} file · ${(fs.statSync(zipPath).size / 1024).toFixed(0)} KB\n  SHA-256 ${hash}`);

if (github) {
  for (const f of fs.readdirSync(ROOT)) if (/^Keep_Watching-\d+\.\d+\.\d+\.zip$/.test(f)) fs.rmSync(path.join(ROOT, f));
  fs.copyFileSync(zipPath, path.join(ROOT, zipName));
  const vj = { version, date, zip: zipName, sha256: hash, notes };
  fs.writeFileSync(path.join(ROOT, 'version.json'), `${JSON.stringify(vj, null, 2)}\n`);
  const readmePath = path.join(ROOT, 'README.md');
  fs.writeFileSync(readmePath, fs.readFileSync(readmePath, 'utf8').replace(/Keep_Watching-\d+\.\d+\.\d+\.zip/g, zipName));

  const EXCLUDE = new Set(['node_modules', 'dist', '.git', '_metadata']);
  const top = fs.readdirSync(ROOT).filter((f) => !EXCLUDE.has(f));
  const ghZip = path.join(dist, `${NAME}_GitHub.zip`);
  const ghList = makeZip(`${NAME}_GitHub`, top, ghZip, (p) => !SKIP.test(p) && !/__pycache__|\.pyc$|clip-[^\\/]*\.webm$|[\\/]artifacts([\\/]|$)/.test(p));
  for (const must of [zipName, 'manifest.json', 'version.json', 'links.json', 'README.md', 'package.json', 'package-lock.json', '.github/workflows/release.yml']) {
    if (!ghList.includes(`${NAME}_GitHub/${must}`)) throw new Error(`${NAME}_GitHub.zip non contiene ${must}`);
  }
  console.log(`✔ ${NAME}_GitHub.zip · ${ghList.length} file · ${(fs.statSync(ghZip).size / 1024).toFixed(0)} KB\n✔ version.json ${version} (${notes.length} novità)`);
}
