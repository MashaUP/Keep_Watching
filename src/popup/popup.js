(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toggles = ['enabled', 'autoNext', 'autoPlay', 'keepFullscreen', 'notifyEnd'];
  const selects = ['countdown', 'stopAfter'];

  // Valori in secondi presenti nel menu "Salta i titoli di coda".
  const SKIP_PRESETS = [0, 15, 30, 60, 90, 120];
  const MAX_MIN = 59;
  const MAX_SEC = 59;

  // Resta true finché l'utente usa "Personalizzato…" in questo popup, così che il
  // salvataggio (che riattiva render) non riporti il menu su un valore predefinito.
  let customMode = false;

  const clamp = (n, max) => Math.min(max, Math.max(0, Math.floor(Number(n) || 0)));

  function formatSkip(total) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return [m && `${m} min`, s && `${s} s`].filter(Boolean).join(' ');
  }

  function renderSkip(value) {
    if (!customMode && SKIP_PRESETS.includes(value)) {
      $('skipCredits').value = String(value);
      $('customSkip').hidden = true;
      $('skipHint').hidden = true;
      return;
    }

    customMode = true;
    $('skipCredits').value = 'custom';
    $('customSkip').hidden = false;

    // Non sovrascrivere i campi mentre l'utente ci sta scrivendo.
    const editing = [$('skipMin'), $('skipSec')].includes(document.activeElement);
    if (!editing) {
      $('skipMin').value = Math.floor(value / 60);
      $('skipSec').value = value % 60;
    }

    $('skipHint').hidden = false;
    $('skipHint').textContent = value > 0
      ? `Cambia episodio quando mancano ${formatSkip(value)} alla fine`
      : 'Imposta quanto prima della fine cambiare episodio';
  }

  function render(s) {
    toggles.forEach((k) => { $(k).checked = s[k]; });
    selects.forEach((k) => { $(k).value = String(s[k]); });
    renderSkip(s.skipCredits);
    $('options').classList.toggle('disabled', !s.enabled);
    $('nextOptions').classList.toggle('disabled', !s.autoNext);
    renderStreak(s);
  }

  function renderStreak(s) {
    const active = s.stopAfter > 0 && s.streak > 0 && Date.now() - s.lastAutoAt < KW_STREAK_RESET_MS;
    $('streakBox').hidden = !active;
    if (active) $('streakText').textContent = `Episodi cambiati di fila: ${s.streak} su ${s.stopAfter}`;
  }

  const load = () =>
    chrome.storage.local.get({ ...KW_DEFAULTS, streak: 0, lastAutoAt: 0 }).then(render);

  toggles.forEach((k) => $(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: e.target.checked });
  }));

  selects.forEach((k) => $(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: Number(e.target.value) });
  }));

  $('skipCredits').addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      // Mostra i campi con il valore attuale; il salvataggio avviene quando si modificano.
      customMode = true;
      load().then(() => $('skipMin').focus());
      return;
    }
    customMode = false;
    chrome.storage.local.set({ skipCredits: Number(e.target.value) });
  });

  function saveCustomSkip() {
    const m = clamp($('skipMin').value, MAX_MIN);
    const s = clamp($('skipSec').value, MAX_SEC);
    chrome.storage.local.set({ skipCredits: m * 60 + s });
  }

  ['skipMin', 'skipSec'].forEach((id) => {
    $(id).addEventListener('input', saveCustomSkip);
    // All'uscita dal campo, riporta il numero nei limiti consentiti.
    $(id).addEventListener('blur', (e) => {
      e.target.value = clamp(e.target.value, id === 'skipMin' ? MAX_MIN : MAX_SEC);
    });
  });

  $('resetStreak').addEventListener('click', () => {
    chrome.storage.local.set({ streak: 0, lastAutoAt: 0 });
  });

  // Scorciatoia attuale per l'interruttore rapido (modificabile dalle impostazioni del browser).
  chrome.commands.getAll().then((commands) => {
    const cmd = commands.find((c) => c.name === 'toggle-enabled');
    $('shortcutHint').textContent = cmd && cmd.shortcut
      ? `Scorciatoia: ${cmd.shortcut}`
      : 'Scorciatoia non impostata';
  });

  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  chrome.storage.onChanged.addListener((_, area) => { if (area === 'local') load(); });
  load();
})();
