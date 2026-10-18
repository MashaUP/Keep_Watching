/**
 * Keep_Watching — impostazioni condivise tra service worker, player, pagine del sito e popup.
 *
 * Unica fonte di verità per: valori di serie, validazione, profili, categorie dei popup,
 * scorciatoie e collegamenti esterni. Funziona sia come script classico (variabili
 * globali) sia in Node per i test (module.exports).
 *
 * Chiavi in chrome.storage.local
 *
 *   Opzioni (popup) — vedi KW_DEFAULTS:
 *     enabled, autoNext, autoPlay, keepFullscreen, notifyEnd, introSkip, pauseOnHidden,
 *     watchdog, sleepFade, countdown, skipCredits, stopAfter, quickSkip,
 *     popupsHidden, popups{…}, profile,
 *     uiSize, uiDensity, uiOpacity, uiPosition, uiAutoHide, toolbar{…}, uiReduceMotion,
 *     guideAutoClose, statsEnabled, updateAutoCheck, showWhatsNew
 *   Dati per serie:
 *     series          { "<titolo>": { introEnd, creditsStart } } — introEnd: secondo di fine
 *                     intro; creditsStart: secondi prima della fine in cui iniziano i titoli.
 *   Timer di spegnimento:
 *     sleep           { mode: 'off' | 'time' | 'episode' | 'season', … }
 *                     time: until (ms), minutes · episode: setAt · season: setAt, season
 *   Statistiche (solo locali, scritte dal service worker — vedi src/lib/stats.js):
 *     stats           { schema, days{}, sessions[], session, recent[] }
 *   Aggiornamenti (scritti dal popup — vedi src/lib/updates.js):
 *     updateCheck     ultimo esito del controllo su GitHub
 *     updateSeen      ultima versione disponibile già vista nel popup
 *     whatsNew        { version, from } — novità da mostrare una volta dopo un aggiornamento
 *     reloadRequest   { from, at } — l'utente ha chiesto di ricaricare dopo aver estratto lo zip
 *   Stato interno:
 *     settingsSchema  versione dello schema delle impostazioni (migrazioni)
 *     streak, lastAutoAt, pendingPlayAt, mutedByKW, resume, lastReloadAt,
 *     cinema, cinemaWindowId, cinemaPrevState, cinemaSince
 *
 * In chrome.storage.session (memoria del browser, sparisce alla chiusura):
 *     nowPlaying      { title, name, playing, at } — ultimo stato riferito dal player
 */

// 3 (1.4.1): uiMinimal sostituita dalla scelta dei singoli pulsanti della barra (toolbar).
const KW_SETTINGS_SCHEMA = 3;

// Collegamenti ufficiali del progetto: cambiare solo qui.
const KW_LINKS = {
  repo: 'MashaUP/Keep_Watching',
  repoUrl: 'https://github.com/MashaUP/Keep_Watching',
  kofi: 'https://ko-fi.com/mashaup',
  shortcuts: 'chrome://extensions/shortcuts'
};

// Categorie dei popup mostrati sul player. Nascondere una categoria non spegne la funzione.
const KW_POPUP_CATEGORIES = [
  { id: 'countdown', label: 'Conto alla rovescia del prossimo episodio',
    hint: 'Se nascosto, il cambio episodio avviene comunque, dopo lo stesso tempo.' },
  { id: 'confirm', label: 'Conferme di intro e titoli',
    hint: '"Intro saltata" e le conferme di "Fine intro qui" e "Inizio titoli qui". Il salvataggio avviene comunque.' },
  { id: 'limit', label: 'Domanda dopo N episodi di fila',
    hint: 'Se nascosta, al limite la visione si ferma: per continuare premi "prossimo episodio" sul player.' },
  { id: 'sleep', label: 'Timer di spegnimento',
    hint: 'Il timer ferma il video comunque.' },
  { id: 'recovery', label: 'Streaming bloccato e ripresa',
    hint: 'Il recupero dello streaming avviene comunque.' },
  { id: 'info', label: 'Altri messaggi temporanei',
    hint: 'Conferme delle scorciatoie da tastiera e piccoli avvisi.' }
];

const KW_POPUPS_ALL_ON = Object.fromEntries(KW_POPUP_CATEGORIES.map((c) => [c.id, true]));

// Pulsanti della barra sul player: ognuno si può togliere dal menu. Gli id sono quelli
// usati da player.js; nascondere un pulsante non disattiva la scorciatoia corrispondente.
const KW_TOOLBAR_BUTTONS = [
  { id: 'skipIntro', label: 'Salta intro', hint: 'Compare prima della fine dell\'intro, nelle serie in cui l\'hai segnata.' },
  { id: 'quick', label: 'Salto avanti (+60 s)', hint: 'Avanti della durata scelta in Riproduzione.' },
  { id: 'setIntro', label: 'Fine intro qui', hint: 'Compare nei primi 10 minuti, per segnare l\'intro della serie.' },
  { id: 'setCredits', label: 'Inizio titoli qui', hint: 'Compare negli ultimi 10 minuti, per segnare i titoli della serie.' },
  { id: 'stopAtEnd', label: 'Stop a fine episodio', hint: 'Attiva o disattiva il timer di fine episodio.' },
  { id: 'help', label: '? (guida alle scorciatoie)', hint: 'La guida resta disponibile con Alt+Shift+H.' }
];
const KW_TOOLBAR_ALL_ON = Object.fromEntries(KW_TOOLBAR_BUTTONS.map((b) => [b.id, true]));
// Equivalente della vecchia "modalità minimale" (fino alla 1.4.0): solo Salta intro e salto avanti.
const KW_TOOLBAR_MINIMAL = { ...KW_TOOLBAR_ALL_ON, setIntro: false, setCredits: false, stopAtEnd: false, help: false };

const KW_DEFAULTS = {
  enabled: true,
  autoNext: true,
  autoPlay: true,
  keepFullscreen: true,
  notifyEnd: true,
  introSkip: true,
  pauseOnHidden: false,
  watchdog: true,
  sleepFade: true,
  countdown: 10,
  skipCredits: 0,
  stopAfter: 0,
  quickSkip: 60,
  popupsHidden: false,
  popups: { ...KW_POPUPS_ALL_ON },
  profile: 'normal',
  uiSize: 'standard',
  uiDensity: 'standard',
  uiOpacity: 82,
  uiPosition: 'top-right',
  uiAutoHide: 3,
  toolbar: { ...KW_TOOLBAR_ALL_ON },
  uiReduceMotion: false,
  guideAutoClose: 0,
  statsEnabled: true,
  updateAutoCheck: true,
  showWhatsNew: true
};

// Valori ammessi per le opzioni a scelta.
const KW_CHOICES = {
  countdown: [0, 5, 10, 15, 20],
  stopAfter: [0, 1, 2, 3, 5, 10],
  quickSkip: [15, 30, 45, 60, 90],
  uiSize: ['compact', 'standard', 'large'],
  uiDensity: ['dense', 'standard', 'spaced'],
  uiPosition: ['top-right', 'top-left', 'top-center'],
  uiAutoHide: [0, 3, 5, 10],
  guideAutoClose: [0, 10, 20],
  profile: ['normal', 'night', 'marathon', 'manual']
};
const KW_OPACITY_RANGE = [40, 100];
const KW_SKIP_CREDITS_MAX = 59 * 60 + 59;

// Impostazioni puramente estetiche: "Ripristina aspetto" tocca solo queste.
const KW_UI_KEYS = ['uiSize', 'uiDensity', 'uiOpacity', 'uiPosition', 'uiAutoHide', 'toolbar', 'uiReduceMotion'];

/**
 * Riporta un oggetto letto dallo storage a valori validi: chiavi mancanti, tipi
 * sbagliati e valori fuori elenco tornano al valore di serie. Non tocca chiavi estranee.
 */
function kwSanitize(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const [key, def] of Object.entries(KW_DEFAULTS)) {
    const v = src[key];
    if (typeof def === 'boolean') out[key] = typeof v === 'boolean' ? v : def;
    else if (key === 'popups') {
      const p = v && typeof v === 'object' ? v : {};
      out.popups = Object.fromEntries(KW_POPUP_CATEGORIES.map((c) => [c.id, typeof p[c.id] === 'boolean' ? p[c.id] : true]));
    } else if (key === 'toolbar') {
      // Chi aveva la modalità minimale (1.4.0) ritrova gli stessi pulsanti.
      const base = !(v && typeof v === 'object') && src.uiMinimal === true ? KW_TOOLBAR_MINIMAL : KW_TOOLBAR_ALL_ON;
      const t = v && typeof v === 'object' ? v : {};
      out.toolbar = Object.fromEntries(KW_TOOLBAR_BUTTONS.map((b) => [b.id, typeof t[b.id] === 'boolean' ? t[b.id] : base[b.id]]));
    } else if (KW_CHOICES[key]) out[key] = KW_CHOICES[key].includes(v) ? v : def;
    else if (key === 'uiOpacity') {
      const n = Math.round(Number(v));
      out.uiOpacity = Number.isFinite(n) && n >= KW_OPACITY_RANGE[0] && n <= KW_OPACITY_RANGE[1] ? n : def;
    } else if (key === 'skipCredits') {
      const n = Math.floor(Number(v));
      out.skipCredits = Number.isFinite(n) && n >= 0 && n <= KW_SKIP_CREDITS_MAX ? n : def;
    } else out[key] = v === undefined ? def : v;
  }
  return out;
}

/** Un popup di una categoria va mostrato? Il controllo globale vince sulle singole preferenze. */
function kwPopupVisible(settings, category) {
  if (!settings || settings.popupsHidden) return false;
  return !settings.popups || settings.popups[category] !== false;
}

// ---------- Profili di comportamento ----------
// Un profilo applica i suoi valori una sola volta, quando lo scegli. Dopo, le opzioni si
// cambiano liberamente: il popup segnala "personalizzato" se differiscono dal profilo.
// I profili non toccano mai: timer di spegnimento, limite di episodi, aspetto, statistiche.

const KW_PROFILES = {
  normal: {
    label: 'Normale',
    desc: 'Le impostazioni di serie: cambio automatico, conto alla rovescia di 10 secondi, tutti i messaggi sul video.',
    preset: { autoNext: true, autoPlay: true, countdown: 10, popups: { ...KW_POPUPS_ALL_ON } }
  },
  night: {
    label: 'Notturno',
    desc: 'Meno messaggi sul video, abbassamento del volume prima dello stop e timer di spegnimento in primo piano nel menu. Non avvia nessun timer da solo.',
    preset: {
      autoNext: true, autoPlay: true, countdown: 10, sleepFade: true,
      popups: { countdown: true, confirm: false, limit: true, sleep: true, recovery: false, info: false }
    }
  },
  marathon: {
    label: 'Maratona',
    desc: 'Episodi uno dopo l\'altro: conto alla rovescia breve, schermo intero mantenuto, meno conferme. Il limite di episodi di fila resta quello che hai scelto.',
    preset: {
      autoNext: true, autoPlay: true, countdown: 5, keepFullscreen: true,
      popups: { countdown: true, confirm: false, limit: true, sleep: true, recovery: true, info: false }
    }
  },
  manual: {
    label: 'Manuale',
    desc: 'Nessun cambio episodio automatico: decidi tu quando andare avanti. Intro, timer, recupero dello streaming e barra restano attivi.',
    preset: { autoNext: false }
  }
};

/** Modifiche da scrivere nello storage per applicare un profilo. */
function kwProfileChanges(profileId, current) {
  const profile = KW_PROFILES[profileId];
  if (!profile) return null;
  const changes = { profile: profileId };
  for (const [key, value] of Object.entries(profile.preset)) {
    changes[key] = key === 'popups' ? { ...(current && current.popups), ...value } : value;
  }
  return changes;
}

/** Opzioni in cui le impostazioni attuali si discostano dal profilo scelto. */
function kwProfileDiff(profileId, settings) {
  const profile = KW_PROFILES[profileId];
  if (!profile) return [];
  const diff = [];
  for (const [key, value] of Object.entries(profile.preset)) {
    if (key === 'popups') {
      for (const [cat, on] of Object.entries(value)) {
        if ((settings.popups || {})[cat] !== on) diff.push(`popups.${cat}`);
      }
    } else if (settings[key] !== value) diff.push(key);
  }
  return diff;
}

// ---------- Scorciatoie ----------
// I nomi corrispondono ai comandi in manifest.json. Il browser assegna le combinazioni di
// serie solo se non sono già usate: una combinazione vuota va segnalata come non assegnata.

const KW_COMMANDS = [
  { name: 'toggle-enabled', label: 'Attiva o sospendi Keep_Watching', suggested: 'Alt+Shift+K' },
  { name: 'quick-skip', label: 'Salto avanti', suggested: 'Alt+Shift+Right' },
  { name: 'skip-intro', label: 'Salta intro', suggested: 'Alt+Shift+S' },
  { name: 'show-shortcuts', label: 'Guida alle scorciatoie', suggested: 'Alt+Shift+H' },
  { name: 'mark-intro', label: 'Segna la fine dell\'intro', suggested: null },
  { name: 'mark-credits', label: 'Segna l\'inizio dei titoli', suggested: null },
  { name: 'stop-at-end', label: 'Stop a fine episodio', suggested: null }
];

// Combinazioni che Chrome e Brave usano già (Windows e Linux). Elenco parziale, usato solo
// per avvisare: il browser non comunica le proprie scorciatoie alle estensioni.
const KW_BROWSER_SHORTCUTS = {
  'Alt+Left': 'Indietro nella cronologia', 'Alt+Right': 'Avanti nella cronologia',
  'Alt+Home': 'Pagina iniziale', 'Alt+F': 'Menu del browser', 'Alt+E': 'Menu del browser',
  'Alt+D': 'Barra degli indirizzi', 'Alt+Shift+I': 'Invia feedback', 'Alt+Shift+T': 'Barra degli strumenti',
  'Alt+Shift+A': 'Finestre di dialogo', 'Alt+Shift+B': 'Barra dei preferiti',
  'Ctrl+D': 'Aggiungi ai preferiti', 'Ctrl+F': 'Trova', 'Ctrl+H': 'Cronologia', 'Ctrl+J': 'Download',
  'Ctrl+L': 'Barra degli indirizzi', 'Ctrl+N': 'Nuova finestra', 'Ctrl+P': 'Stampa', 'Ctrl+R': 'Ricarica',
  'Ctrl+S': 'Salva pagina', 'Ctrl+T': 'Nuova scheda', 'Ctrl+W': 'Chiudi scheda',
  'Ctrl+Shift+B': 'Barra dei preferiti', 'Ctrl+Shift+N': 'Finestra in incognito',
  'Ctrl+Shift+T': 'Riapri scheda chiusa', 'Ctrl+Shift+Delete': 'Cancella dati'
};

/** Normalizza "Alt + Maiusc + K", "Shift+Alt+K"… nella forma "Alt+Shift+K". */
function kwNormalizeShortcut(s) {
  if (!s) return '';
  const order = ['Ctrl', 'Command', 'MacCtrl', 'Alt', 'Shift'];
  const alias = { control: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Shift', maiusc: 'Shift',
    command: 'Command', cmd: 'Command', macctrl: 'MacCtrl', '⌥': 'Alt', '⇧': 'Shift', '⌘': 'Command', '⌃': 'MacCtrl',
    '→': 'Right', '←': 'Left', '↑': 'Up', '↓': 'Down', freccia: '' };
  // Chrome scrive le frecce come "Right Arrow": si riportano a "Right".
  const parts = String(s).split('+').map((p) => p.trim().replace(/\s*arrow$/i, '')).filter(Boolean)
    .map((p) => (alias[p.toLowerCase()] !== undefined ? alias[p.toLowerCase()] : alias[p] || p));
  const mods = order.filter((m) => parts.includes(m));
  const keys = parts.filter((p) => p && !order.includes(p)).map((k) => (k.length === 1 ? k.toUpperCase() : k));
  return [...mods, ...keys].join('+');
}

/** Stato di ogni scorciatoia, a partire da chrome.commands.getAll(). */
function kwShortcutStates(commands) {
  const byName = new Map((commands || []).map((c) => [c.name, c]));
  const seen = new Map();
  return KW_COMMANDS.map((meta) => {
    const shortcut = (byName.get(meta.name) || {}).shortcut || '';
    const norm = kwNormalizeShortcut(shortcut);
    let conflict = null;
    if (norm && KW_BROWSER_SHORTCUTS[norm]) conflict = `il browser la usa già per: ${KW_BROWSER_SHORTCUTS[norm]}`;
    else if (norm && seen.has(norm)) conflict = `è la stessa di "${seen.get(norm)}"`;
    if (norm) seen.set(norm, meta.label);
    let state = 'assigned';
    if (!shortcut) state = meta.suggested ? 'missing' : 'unassigned';
    return { ...meta, shortcut, display: kwShortcutLabel(shortcut), state, conflict };
  });
}

/** Combinazione leggibile: "Alt+Shift+Right Arrow" → "Alt+Shift+→". */
function kwShortcutLabel(shortcut) {
  const arrows = { Left: '←', Right: '→', Up: '↑', Down: '↓' };
  return String(shortcut || '').replace(/\b(Left|Right|Up|Down) Arrow\b|\b(Left|Right|Up|Down)$/g, (m, a, b) => arrows[a || b]);
}

// Dopo questo tempo senza cambi automatici, il conteggio "di fila" riparte da zero.
const KW_STREAK_RESET_MS = 3 * 60 * 60 * 1000;

// Un timer "fine episodio" o "fine stagione" impostato da più di così viene ignorato.
const KW_SLEEP_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Restituisce il timer di spegnimento se è ancora valido, altrimenti null.
 * Un timer a tempo resta valido per un minuto dopo la scadenza, così il player fa
 * in tempo a fermare il video; più tardi viene ignorato (scaduto mentre non si guardava).
 */
function kwActiveSleep(sleep, now = Date.now()) {
  if (!sleep || !sleep.mode || sleep.mode === 'off') return null;
  if (sleep.mode === 'time') return sleep.until > now - 60 * 1000 ? sleep : null;
  return now - (sleep.setAt || 0) < KW_SLEEP_MAX_AGE_MS ? sleep : null;
}

// Secondi in formato m:ss oppure h:mm:ss.
function kwFormatTime(total) {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// Durata leggibile: "2 h 05 min", "12 min", "45 s".
function kwFormatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KW_SETTINGS_SCHEMA, KW_LINKS, KW_POPUP_CATEGORIES, KW_TOOLBAR_BUTTONS, KW_DEFAULTS, KW_CHOICES, KW_UI_KEYS, KW_OPACITY_RANGE,
    KW_PROFILES, KW_COMMANDS, KW_BROWSER_SHORTCUTS, KW_STREAK_RESET_MS, KW_SLEEP_MAX_AGE_MS,
    kwSanitize, kwPopupVisible, kwProfileChanges, kwProfileDiff, kwNormalizeShortcut, kwShortcutStates, kwShortcutLabel,
    kwActiveSleep, kwFormatTime, kwFormatDuration
  };
}
