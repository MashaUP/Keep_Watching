(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toggles = ['enabled', 'autoNext', 'autoPlay', 'keepFullscreen', 'notifyEnd',
    'introSkip', 'pauseOnHidden', 'watchdog', 'sleepFade'];
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
    renderSleep(s.sleep);
    renderSeries(s.series);
  }

  // ---------- Timer di spegnimento ----------

  let sleepTicker = null;

  function renderSleep(sleep) {
    const active = kwActiveSleep(sleep);
    const expired = active && active.mode === 'time' && active.until <= Date.now();
    const hint = $('sleepHint');
    clearInterval(sleepTicker);

    if (!active || expired) {
      $('sleepMode').value = 'off';
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    if (active.mode === 'time') {
      $('sleepMode').value = String(active.minutes);
      const update = () => {
        const left = Math.max(0, Math.ceil((active.until - Date.now()) / 60000));
        const at = new Date(active.until).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        hint.textContent = `Si ferma alle ${at} (tra ${left} min)`;
      };
      update();
      sleepTicker = setInterval(update, 15000);
    } else if (active.mode === 'episode') {
      $('sleepMode').value = 'episode';
      hint.textContent = 'Si ferma alla fine dell\'episodio in corso';
    } else {
      $('sleepMode').value = 'season';
      hint.textContent = active.season
        ? `Si ferma alla fine della stagione ${active.season}`
        : 'Si ferma alla fine della stagione in corso';
    }
  }

  $('sleepMode').addEventListener('change', (e) => {
    const value = e.target.value;
    const now = Date.now();
    let sleep = { mode: 'off' };
    if (value === 'episode') sleep = { mode: 'episode', setAt: now };
    else if (value === 'season') sleep = { mode: 'season', season: null, setAt: now };
    else if (value !== 'off') sleep = { mode: 'time', minutes: Number(value), until: now + Number(value) * 60000 };
    chrome.storage.local.set({ sleep });
  });

  // ---------- Serie salvate ----------

  function renderSeries(series) {
    const entries = Object.entries(series || {})
      .filter(([, c]) => c && (c.introEnd || Number.isFinite(c.creditsStart)))
      .sort(([a], [b]) => a.localeCompare(b, 'it'));
    $('seriesEmpty').hidden = entries.length > 0;
    $('seriesList').replaceChildren(...entries.map(([title, conf]) => {
      const li = document.createElement('li');
      const text = document.createElement('span');
      text.className = 'text';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = title;
      const details = document.createElement('span');
      details.className = 'hint';
      details.textContent = [
        conf.introEnd && `Intro fino a ${kwFormatTime(conf.introEnd)}`,
        Number.isFinite(conf.creditsStart) && `Titoli: ultimi ${kwFormatTime(conf.creditsStart)}`
      ].filter(Boolean).join(' · ');
      text.append(name, details);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Rimuovi';
      remove.setAttribute('aria-label', `Rimuovi ${title}`);
      remove.addEventListener('click', async () => {
        const { series: all = {} } = await chrome.storage.local.get('series');
        delete all[title];
        chrome.storage.local.set({ series: all });
      });
      li.append(text, remove);
      return li;
    }));
  }

  function renderStreak(s) {
    const active = s.stopAfter > 0 && s.streak > 0 && Date.now() - s.lastAutoAt < KW_STREAK_RESET_MS;
    $('streakBox').hidden = !active;
    if (active) $('streakText').textContent = `Episodi cambiati di fila: ${s.streak} su ${s.stopAfter}`;
  }

  const load = () =>
    chrome.storage.local.get({ ...KW_DEFAULTS, streak: 0, lastAutoAt: 0, sleep: null, series: {} }).then(render);

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
