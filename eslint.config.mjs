// Controllo statico (npm run lint). Le regole minime degli standard comuni sono no-undef e
// no-unused-vars. Gli script dell'estensione sono classici (non moduli) e condividono le
// dichiarazioni di primo livello dei file caricati prima (defaults.js, hosts.js, panel.js,
// toolbar.js, guide.js, lib/*.js): l'elenco si ricava da quei file, così un nome nuovo
// non va scritto due volte e un nome sbagliato resta un errore.
import fs from 'node:fs';
import globals from 'globals';
import js from '@eslint/js';

const SHARED = ['src/defaults.js', 'src/hosts.js', 'src/panel.js', 'src/toolbar.js', 'src/guide.js'];
const shared = {};
for (const file of SHARED) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/^(?:const|let|function)\s+([A-Za-z_$][\w$]*)/gm)) shared[m[1]] = 'readonly';
}
for (const name of ['KWStats', 'KWUpdates', 'KWHealth', 'KWLinks']) shared[name] = 'readonly';

export default [
  { ignores: ['node_modules/**', 'dist/**', '_metadata/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.webextensions, ...globals.serviceworker, ...shared, module: 'readonly' }
    },
    rules: {
      // Le dichiarazioni di primo livello sono usate dagli altri script: si controllano solo le variabili locali.
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-redeclare': ['error', { builtinGlobals: false }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-undef': 'error'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-undef': 'error' }
  },
  {
    files: ['scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }], 'no-undef': 'error' }
  }
];
