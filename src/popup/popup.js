/**
 * Keep_Watching — menu dell'estensione (popup o scheda).
 *
 * Legge e scrive le impostazioni in chrome.storage.local, sempre validate con kwSanitize
 * (defaults.js). Le statistiche le scrive solo il service worker: da qui partono soltanto
 * le richieste di azzeramento e importazione. Il controllo degli aggiornamenti usa
 * src/lib/updates.js con la fetch del browser, senza cookie e senza dati locali.
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const VERSION = chrome.runtime.getManifest().version;
  const IS_TAB = new URLSearchParams(location.search).has('tab');
  if (IS_TAB) document.body.classList.add('tab');

  /** Elemento con attributi e figli (testo sempre come testo, mai come HTML). */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }

  const EXTRA_DEFAULTS = {
    streak: 0, lastAutoAt: 0, sleep: null, series: {}, stats: null,
    updateCheck: null, updateSeen: null, whatsNew: null, reloadRequest: null
  };

  let S = kwSanitize({});
  let X = { ...EXTRA_DEFAULTS };
  let nowPlaying = null;
  let statsRange = '7';
  let localChangelog = null;
  let checking = false;

  const set = (obj) => chrome.storage.local.set(obj);
  const store = {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    put: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* memoria del browser non disponibile */ } }
  };

  const fmtDateTime = (ms) => new Date(ms).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const fmtClock = (ms) => new Date(ms).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  // ---------- Navigazione ----------

  function showSection(id, remember = true) {
    if (!$$(`section[data-section="${id}"]`).length) id = 'overview';
    for (const s of $$('section[data-section]')) s.hidden = s.dataset.section !== id;
    for (const b of $$('.nav nav button')) {
      if (b.dataset.section === id) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    }
    $('main').scrollTop = 0;
    if (remember) store.put('kwSection', id);
    if (id === 'updates') markUpdateSeen();
    if (id === 'stats') renderStats(); // il grafico prende la larghezza del riquadro visibile
  }

  for (const b of $$('.nav nav button')) b.addEventListener('click', () => showSection(b.dataset.section));
  for (const b of $$('[data-goto]')) b.addEventListener('click', () => showSection(b.dataset.goto));

  $('openTab').addEventListener('click', () => {
    const current = ($$('.nav nav button[aria-current="page"]')[0] || {}).dataset;
    chrome.tabs.create({ url: chrome.runtime.getURL(`src/popup/popup.html?tab=1#${(current && current.section) || 'overview'}`) });
    if (!IS_TAB) window.close();
  });
  if (IS_TAB) $('openTab').hidden = true;

  // ---------- Impostazioni generiche ----------

  function bindSettings() {
    for (const el of $$('input[type="checkbox"][data-setting]')) {
      el.addEventListener('change', () => set({ [el.dataset.setting]: el.checked }));
    }
    for (const el of $$('select[data-setting]')) {
      el.addEventListener('change', () => set({ [el.dataset.setting]: el.dataset.type === 'number' ? Number(el.value) : el.value }));
    }
    for (const seg of $$('.seg[data-setting]')) {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-value]');
        if (!b) return;
        const v = seg.dataset.type === 'number' ? Number(b.dataset.value) : b.dataset.value;
        set({ [seg.dataset.setting]: v });
      });
    }
    const range = $('uiOpacity');
    range.addEventListener('input', () => { $('opacityValue').textContent = `${range.value}%`; paintRange(); renderPreview({ ...S, uiOpacity: Number(range.value) }); });
    range.addEventListener('change', () => set({ uiOpacity: Number(range.value) }));
  }

  function paintRange() {
    const r = $('uiOpacity');
    r.style.setProperty('--fill', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  }

  function setSeg(seg, value) {
    for (const b of $$('button[data-value]', seg)) {
      const on = String(value) === b.dataset.value;
      b.classList.toggle('on', on);
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(on));
    }
  }

  function renderSettings() {
    for (const el of $$('input[type="checkbox"][data-setting]')) el.checked = Boolean(S[el.dataset.setting]);
    for (const el of $$('select[data-setting]')) el.value = String(S[el.dataset.setting]);
    for (const seg of $$('.seg[data-setting]')) setSeg(seg, S[seg.dataset.setting]);
    if (document.activeElement !== $('uiOpacity')) $('uiOpacity').value = String(S.uiOpacity);
    $('opacityValue').textContent = `${S.uiOpacity}%`;
    paintRange();
    $('statusPill').textContent = S.enabled ? 'Attiva' : 'Sospesa';
    $('statusPill').classList.toggle('on', S.enabled);
  }

  // ---------- Popup sul video ----------

  function renderPopups() {
    const list = $('popupList');
    if (!list.childElementCount) {
      for (const c of KW_POPUP_CATEGORIES) {
        const input = h('input', { type: 'checkbox', class: 'switch', 'data-popup': c.id });
        input.addEventListener('change', () => set({ popups: { ...S.popups, [c.id]: input.checked } }));
        list.append(h('label', { class: 'row' },
          h('span', { class: 'row-text' }, h('span', { class: 'row-title', text: c.label }), h('span', { class: 'row-hint', text: c.hint })),
          input));
      }
    }
    for (const input of $$('input[data-popup]', list)) {
      input.checked = S.popups[input.dataset.popup] !== false;
      input.disabled = S.popupsHidden;
      input.closest('.row').classList.toggle('disabled', S.popupsHidden);
    }
  }

  // ---------- Anteprima della barra ----------

  function renderPreview(s = S) {
    const bar = $('pvBar');
    bar.style.setProperty('--pv-scale', String({ compact: 0.86, standard: 1, large: 1.2 }[s.uiSize] || 1));
    bar.style.setProperty('--pv-gap', `${{ dense: 4, standard: 8, spaced: 12 }[s.uiDensity] || 8}px`);
    bar.style.setProperty('--pv-alpha', String(s.uiOpacity / 100));
    bar.classList.toggle('left', s.uiPosition === 'top-left');
    bar.classList.toggle('center', s.uiPosition === 'top-center');
    const btns = $$('.pv-btn', bar);
    btns[0].textContent = `+${s.quickSkip} s`;
    for (const b of btns.slice(1)) b.hidden = s.uiMinimal;
  }

  $('resetLook').addEventListener('click', () => {
    const defaults = Object.fromEntries(KW_UI_KEYS.map((k) => [k, KW_DEFAULTS[k]]));
    set(defaults);
  });

  // ---------- Timer di spegnimento ----------

  const SLEEP_OPTIONS = [['off', 'Disattivato'], ['15', 'Tra 15 minuti'], ['30', 'Tra 30 minuti'], ['45', 'Tra 45 minuti'],
    ['60', 'Tra 1 ora'], ['90', 'Tra 1 ora e mezza'], ['episode', 'Alla fine dell\'episodio'], ['season', 'Alla fine della stagione']];

  for (const sel of $$('select[data-sleep]')) {
    for (const [v, label] of SLEEP_OPTIONS) sel.append(h('option', { value: v, text: label }));
    sel.addEventListener('change', () => {
      const v = sel.value;
      const now = Date.now();
      let sleep = { mode: 'off' };
      if (v === 'episode') sleep = { mode: 'episode', setAt: now };
      else if (v === 'season') sleep = { mode: 'season', season: null, setAt: now };
      else if (v !== 'off') sleep = { mode: 'time', minutes: Number(v), until: now + Number(v) * 60000 };
      set({ sleep });
    });
  }

  function sleepDescription() {
    const a = kwActiveSleep(X.sleep);
    if (!a || (a.mode === 'time' && a.until <= Date.now())) return null;
    if (a.mode === 'time') {
      const left = Math.max(1, Math.ceil((a.until - Date.now()) / 60000));
      return { value: String(a.minutes), title: `Alle ${fmtClock(a.until)}`, text: `Si ferma alle ${fmtClock(a.until)} (tra ${left} min)` };
    }
    if (a.mode === 'episode') return { value: 'episode', title: 'A fine episodio', text: 'Si ferma alla fine dell\'episodio in corso' };
    return { value: 'season', title: 'A fine stagione', text: a.season ? `Si ferma alla fine della stagione ${a.season}` : 'Si ferma alla fine della stagione in corso' };
  }

  function renderSleep() {
    const d = sleepDescription();
    for (const sel of $$('select[data-sleep]')) sel.value = d ? d.value : 'off';
    for (const p of $$('[data-sleep-hint]')) { p.hidden = !d; p.textContent = d ? d.text : ''; }
  }

  // ---------- Titoli di coda (valori pronti o personalizzati) ----------

  const SKIP_PRESETS = [0, 15, 30, 60, 90, 120];
  let customMode = false;
  const clamp = (n, max) => Math.min(max, Math.max(0, Math.floor(Number(n) || 0)));

  function renderSkip() {
    const value = S.skipCredits;
    if (!customMode && SKIP_PRESETS.includes(value)) {
      $('skipCredits').value = String(value);
      $('customSkip').hidden = true;
      $('skipHint').hidden = true;
      return;
    }
    customMode = true;
    $('skipCredits').value = 'custom';
    $('customSkip').hidden = false;
    if (![$('skipMin'), $('skipSec')].includes(document.activeElement)) {
      $('skipMin').value = Math.floor(value / 60);
      $('skipSec').value = value % 60;
    }
    $('skipHint').hidden = false;
    $('skipHint').textContent = value > 0 ? `Cambia episodio quando mancano ${kwFormatTime(value)} alla fine` : 'Imposta quanto prima della fine cambiare episodio';
  }

  $('skipCredits').addEventListener('change', (e) => {
    if (e.target.value === 'custom') { customMode = true; renderSkip(); $('skipMin').focus(); return; }
    customMode = false;
    set({ skipCredits: Number(e.target.value) });
  });
  for (const id of ['skipMin', 'skipSec']) {
    $(id).addEventListener('input', () => set({ skipCredits: clamp($('skipMin').value, 59) * 60 + clamp($('skipSec').value, 59) }));
    $(id).addEventListener('blur', (e) => { e.target.value = clamp(e.target.value, 59); });
  }

  // ---------- Episodi di fila e serie salvate ----------

  function streakActive() {
    return S.stopAfter > 0 && X.streak > 0 && Date.now() - X.lastAutoAt < KW_STREAK_RESET_MS;
  }

  function renderStreak() {
    const on = streakActive();
    $('streakBox').hidden = !on;
    if (on) $('streakText').textContent = `Episodi cambiati di fila: ${X.streak} su ${S.stopAfter}`;
  }
  $('resetStreak').addEventListener('click', () => set({ streak: 0, lastAutoAt: 0 }));

  function renderSeries() {
    const entries = Object.entries(X.series || {})
      .filter(([, c]) => c && (c.introEnd || Number.isFinite(c.creditsStart)))
      .sort(([a], [b]) => a.localeCompare(b, 'it'));
    $('seriesEmpty').hidden = entries.length > 0;
    $('seriesList').replaceChildren(...entries.map(([title, conf]) => {
      const remove = h('button', { type: 'button', class: 'link', 'aria-label': `Rimuovi ${title}`, text: 'Rimuovi' });
      remove.addEventListener('click', async () => {
        const { series: all = {} } = await chrome.storage.local.get('series');
        delete all[title];
        set({ series: all });
      });
      const details = [conf.introEnd && `Intro fino a ${kwFormatTime(conf.introEnd)}`,
        Number.isFinite(conf.creditsStart) && `Titoli: ultimi ${kwFormatTime(conf.creditsStart)}`].filter(Boolean).join(' · ');
      return h('li', {}, h('span', { class: 'row-text' }, h('span', { class: 'name', text: title }), h('span', { class: 'row-hint', text: details })), remove);
    }));
  }

  // ---------- Scorciatoie ----------

  let shortcutStates = [];

  async function renderShortcuts() {
    try { shortcutStates = kwShortcutStates(await chrome.commands.getAll()); } catch (e) { shortcutStates = []; }
    const toggle = shortcutStates.find((s) => s.name === 'toggle-enabled');
    $('shortcutHint').textContent = toggle && toggle.shortcut ? `Scorciatoia: ${toggle.display}` : 'Scorciatoia non assegnata';
    $('shortcutList').replaceChildren(...shortcutStates.map((s) => {
      let state = 'Attiva';
      let warn = false;
      if (s.state === 'missing') { state = 'Non assegnata: il browser non l\'ha data, forse la usa già un\'altra estensione'; warn = true; }
      else if (s.state === 'unassigned') state = 'Nessuna combinazione';
      else if (s.conflict) { state = `Possibile conflitto: ${s.conflict}`; warn = true; }
      return h('li', {},
        h('span', { class: 'sc-text' }, h('span', { text: s.label }), h('span', { class: `sc-state${warn ? ' warn' : ''}`, text: state })),
        h('kbd', { class: s.shortcut ? '' : 'none', text: s.display || 'Non assegnata' }));
    }));
  }

  $('configureShortcuts').addEventListener('click', () => chrome.tabs.create({ url: KW_LINKS.shortcuts }));

  for (const b of $$('[data-show-guide]')) {
    b.addEventListener('click', async () => {
      const res = await chrome.runtime.sendMessage({ type: 'kwShowGuide' }).catch(() => null);
      const msg = b.closest('.card').querySelector('[data-guide-result]');
      msg.hidden = false;
      if (res && res.ok) {
        msg.className = 'hint ok';
        msg.textContent = 'Guida aperta sul player.';
        if (!IS_TAB) setTimeout(() => window.close(), 400);
      } else {
        msg.className = 'hint warn';
        msg.textContent = 'Nessun player nella scheda attiva: apri un episodio sul sito e riprova.';
      }
    });
  }

  // ---------- Profili ----------

  const PROFILE_ICONS = { normal: 'i-check', night: 'i-moon', marathon: 'i-bolt', manual: 'i-hand' };
  const DIFF_LABELS = {
    autoNext: 'prossimo episodio automatico', autoPlay: 'avvio del nuovo episodio', countdown: 'conto alla rovescia',
    keepFullscreen: 'schermo intero tra episodi', sleepFade: 'volume abbassato prima dello stop'
  };
  const diffLabel = (k) => (k.startsWith('popups.')
    ? `popup "${(KW_POPUP_CATEGORIES.find((c) => c.id === k.slice(7)) || {}).label || k}"`
    : DIFF_LABELS[k] || k);

  function svgIcon(id) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${id}`);
    svg.append(use);
    return svg;
  }

  function renderProfiles() {
    const list = $('profileList');
    if (!list.childElementCount) {
      for (const [id, p] of Object.entries(KW_PROFILES)) {
        const card = h('button', { type: 'button', class: 'profile', role: 'radio', 'data-profile': id },
          h('span', { class: 'profile-head' }, svgIcon(PROFILE_ICONS[id]), h('span', { text: p.label })),
          h('p', { text: p.desc }));
        card.addEventListener('click', () => set(kwProfileChanges(id, S)));
        list.append(card);
      }
    }
    for (const card of $$('.profile', list)) {
      const active = card.dataset.profile === S.profile;
      card.setAttribute('aria-checked', String(active));
      const head = card.querySelector('.profile-head');
      const badge = head.querySelector('.badge');
      if (active && !badge) head.append(h('span', { class: 'badge', text: 'Attivo' }));
      if (!active && badge) badge.remove();
    }
    const diff = kwProfileDiff(S.profile, S);
    const p = KW_PROFILES[S.profile];
    $('profileCustom').hidden = !diff.length;
    if (diff.length) $('profileCustomText').textContent = `Rispetto al profilo ${p.label} hai cambiato: ${diff.map(diffLabel).join(', ')}.`;
  }
  $('profileRestore').addEventListener('click', () => set(kwProfileChanges(S.profile, S)));

  // ---------- Panoramica ----------

  function renderOverview() {
    // Sul player: ultimo stato riferito dal player (memoria di sessione del browser).
    const np = nowPlaying;
    const fresh = np && ((np.playing && Date.now() - np.at < 45000) || (!np.playing && Date.now() - np.at < 30 * 60000));
    if (fresh) {
      $('stNow').textContent = np.title || 'Episodio';
      $('stNowSub').textContent = `${np.name ? `${np.name} · ` : ''}${np.playing ? 'in riproduzione' : 'in pausa'}`;
    } else {
      $('stNow').textContent = 'Nessun episodio';
      $('stNowSub').textContent = 'Apri un episodio sul sito';
    }

    const p = KW_PROFILES[S.profile];
    $('stProfile').textContent = p.label;
    $('stProfileSub').textContent = kwProfileDiff(S.profile, S).length ? 'Personalizzato' : 'Come da profilo';

    const d = sleepDescription();
    $('stSleep').textContent = d ? d.title : 'Spento';
    $('stSleepSub').textContent = d ? d.text : 'Nessun timer attivo';

    if (S.stopAfter > 0) {
      $('stStreak').textContent = `${streakActive() ? X.streak : 0}/${S.stopAfter}`;
      $('stStreakSub').textContent = 'prima di chiedere se continuare';
    } else {
      $('stStreak').textContent = 'Nessun limite';
      $('stStreakSub').textContent = 'Si imposta in Riproduzione';
    }

    // Il profilo Notturno (o un timer attivo) porta il timer in primo piano.
    $('nightTimer').hidden = !(S.profile === 'night' || d);

    const c = X.updateCheck;
    const available = c && c.ok && c.status === 'available' && c.latest;
    $('overviewUpdate').hidden = !available;
    if (available) $('overviewUpdateText').textContent = `Disponibile la ${c.latest.version}`;
    $('navUpdateDot').hidden = !(available && X.updateSeen !== c.latest.version);

    renderInstallState();
  }

  /** Esito dell'ultima richiesta di ricarica dopo aver estratto lo zip: verificato davvero. */
  function renderInstallState() {
    const r = X.reloadRequest;
    const banner = $('installBanner');
    if (!r || Date.now() - r.at > 7 * 86400000) { banner.hidden = true; return; }
    banner.hidden = false;
    const changed = r.from !== VERSION;
    banner.className = `banner ${changed ? 'ok' : 'warn'}`;
    $('installTitle').textContent = changed ? `Aggiornamento installato: ora hai la ${VERSION}` : `La versione è ancora la ${VERSION}`;
    $('installText').textContent = changed
      ? `Prima avevi la ${r.from}.`
      : 'L\'estensione si è ricaricata ma i file sono gli stessi: estrai lo zip nella cartella che carichi in brave://extensions, poi riprova.';
  }
  $('installClose').addEventListener('click', () => chrome.storage.local.remove('reloadRequest'));

  async function renderWhatsNew() {
    const w = X.whatsNew;
    const card = $('whatsNew');
    if (!w || !S.showWhatsNew || w.version !== VERSION) { card.hidden = true; return; }
    const log = await getLocalChangelog();
    const section = log.find((s) => s.version === VERSION);
    card.hidden = false;
    $('whatsNewTitle').textContent = `Aggiornata alla ${VERSION}${w.from ? ` (prima avevi la ${w.from})` : ''}`;
    // Solo il titolo di ogni voce ("Profili", "Statistiche locali"…): i dettagli sono in Aggiornamenti.
    const items = section ? section.items.filter((i) => i.section !== 'Modificato').slice(0, 9) : [];
    const head = (t) => { const m = /^([^:]{3,70}):\s/.exec(t); return m ? m[1] : t; };
    $('whatsNewList').replaceChildren(...(items.length
      ? items.map((i) => h('li', { text: i.section === 'Corretto' ? `Corretto: ${head(i.text)}` : head(i.text) }))
      : [h('li', { text: 'Le novità sono in CHANGELOG.md.' })]));
  }
  $('whatsNewClose').addEventListener('click', () => chrome.storage.local.remove('whatsNew'));

  // ---------- Statistiche ----------

  const RANGE_LABEL = { today: 'oggi', 7: 'negli ultimi 7 giorni', 30: 'negli ultimi 30 giorni' };

  function renderStats() {
    const { stats } = KWStats.validateStats(X.stats);
    setSeg($('statsRange'), statsRange);
    const sum = KWStats.summarize(stats, statsRange);
    $('sPlay').textContent = kwFormatDuration(sum.play);
    $('sPlaySub').textContent = `${RANGE_LABEL[statsRange]}${sum.estimated ? ' · include valori stimati' : ''}`;
    $('sSessions').textContent = String(sum.sessions);
    $('sAvg').textContent = sum.avgSession ? kwFormatDuration(sum.avgSession) : '—';
    $('sCompleted').textContent = String(sum.completed);
    $('sIntro').textContent = String(sum.intro);
    $('sCredits').textContent = String(sum.credits);
    const chartRange = statsRange === 30 || statsRange === '30' ? 30 : 7;
    $('chartTitle').textContent = `Tempo di visione al giorno · ultimi ${chartRange} giorni`;
    drawChart(KWStats.summarize(stats, chartRange));
  }

  $('statsRange').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    statsRange = b.dataset.value;
    store.put('kwStatsRange', statsRange);
    renderStats();
  });

  const WEEKDAYS = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  const dayDate = (k) => new Date(`${k}T12:00:00`);

  /** Grafico a colonne in SVG: una sola serie (minuti al giorno), niente librerie. */
  function drawChart(sum) {
    const box = $('chart');
    const table = $('chartTable');
    const days = sum.days;
    if (!sum.hasData) {
      box.replaceChildren(h('p', { class: 'chart-empty', text: 'Nessun dato in questo periodo. Il tempo si registra mentre guardi, se la raccolta è attiva.' }));
      table.replaceChildren();
      return;
    }
    // Larghezza reale del riquadro: il testo resta della stessa misura nel popup e in scheda.
    const W = Math.max(300, Math.round(box.clientWidth || 440));
    const H = 150;
    const pad = { l: 34, r: 6, t: 16, b: 20 };
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const maxMin = Math.max(...days.map((d) => d.play / 60));
    const step = [5, 10, 15, 30, 60, 120, 180, 240].find((s) => s * 4 >= maxMin) || 300;
    const top = Math.max(step, Math.ceil(maxMin / step) * step);
    const slot = iw / days.length;
    const barW = Math.min(24, Math.max(4, slot - 2));
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, text) => {
      const n = document.createElementNS(ns, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text != null) n.textContent = text;
      return n;
    };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Minuti di visione al giorno, massimo ${Math.round(maxMin)} minuti` });
    const defs = el('defs', {});
    const pat = el('pattern', { id: 'kwHatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.append(el('rect', { width: 6, height: 6, fill: '#2f74ff', opacity: 0.55 }), el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#9cbcff', 'stroke-width': 2 }));
    defs.append(pat);
    svg.append(defs);

    const grid = el('g', { class: 'grid' });
    const axis = el('g', { class: 'axis' });
    const tickLabel = (m) => (m >= 60 ? `${m / 60} h` : `${m} min`);
    for (let i = 0; i <= 2; i++) {
      const v = (top / 2) * i;
      const y = pad.t + ih - (v / top) * ih;
      grid.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y }));
      axis.append(el('text', { x: pad.l - 4, y: y + 3.5, 'text-anchor': 'end' }, tickLabel(v)));
    }
    svg.append(grid, axis);

    const xl = el('g', { class: 'xlab' });
    const today = KWStats.dayKey(Date.now());
    let peak = null;
    days.forEach((d, i) => {
      const m = d.play / 60;
      const x = pad.l + slot * i + (slot - barW) / 2;
      const hgt = m > 0 ? Math.max(2, (m / top) * ih) : 0;
      const y = pad.t + ih - hgt;
      const col = el('g', { class: 'col', tabindex: 0 });
      col.append(el('rect', { class: 'hit', x: pad.l + slot * i, y: pad.t, width: slot, height: ih }));
      if (hgt) {
        // Estremità arrotondata in alto (4px), base dritta sulla linea dello zero.
        const r = Math.min(4, barW / 2, hgt);
        const path = `M${x},${y + hgt}V${y + r}Q${x},${y} ${x + r},${y}H${x + barW - r}Q${x + barW},${y} ${x + barW},${y + r}V${y + hgt}Z`;
        col.append(el('path', { class: `bar${d.date === today ? ' today' : ''}${d.est ? ' est' : ''}`, d: path }));
      }
      const label = `${WEEKDAYS[dayDate(d.date).getDay()]} ${dayDate(d.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}`;
      const tip = [label, `${kwFormatDuration(d.play)} di visione`, `${d.sessions} ${d.sessions === 1 ? 'sessione' : 'sessioni'} · ${d.completed} completati`, d.est ? 'Valore stimato' : ''].filter(Boolean);
      col.addEventListener('pointerenter', (e) => showTip(tip, e));
      col.addEventListener('pointermove', (e) => moveTip(e));
      col.addEventListener('pointerleave', hideTip);
      col.addEventListener('focus', () => { const r = col.getBoundingClientRect(); showTip(tip, { clientX: r.left + r.width / 2, clientY: r.top }); });
      col.addEventListener('blur', hideTip);
      svg.append(col);
      if (!peak || d.play > peak.d.play) peak = { d, x: x + barW / 2, y };
      const every = days.length > 10 ? 5 : 1;
      if ((days.length - 1 - i) % every === 0) {
        const text = days.length > 10 ? dayDate(d.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' }) : WEEKDAYS[dayDate(d.date).getDay()];
        xl.append(el('text', { x: pad.l + slot * i + slot / 2, y: H - 5, 'text-anchor': 'middle' }, text));
      }
    });
    svg.append(xl);
    if (peak && peak.d.play > 0) svg.append(el('text', { class: 'peak', x: peak.x, y: peak.y - 4, 'text-anchor': 'middle' }, kwFormatDuration(peak.d.play)));
    box.replaceChildren(svg);

    table.replaceChildren(
      h('thead', {}, h('tr', {}, h('th', { text: 'Giorno' }), h('th', { text: 'Visione' }), h('th', { text: 'Sessioni' }), h('th', { text: 'Completati' }), h('th', { text: 'Intro' }), h('th', { text: 'Titoli' }))),
      h('tbody', {}, days.slice().reverse().map((d) => h('tr', {},
        h('td', {}, dayDate(d.date).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' }), d.est ? h('span', { class: 'est-tag', text: 'stimato' }) : null),
        h('td', { text: kwFormatDuration(d.play) }), h('td', { text: d.sessions }), h('td', { text: d.completed }), h('td', { text: d.intro }), h('td', { text: d.credits })))));
  }

  const tipEl = $('tooltip');
  function showTip(lines, e) {
    tipEl.replaceChildren(...lines.map((l, i) => (i === 0 ? h('b', { text: l }) : h('span', { text: l }, h('br')))));
    tipEl.hidden = false;
    moveTip(e);
  }
  function moveTip(e) {
    const r = tipEl.getBoundingClientRect();
    tipEl.style.left = `${Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2))}px`;
    tipEl.style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
  }
  function hideTip() { tipEl.hidden = true; }

  // Esportazione: file generati qui e scaricati dal browser, senza permessi aggiuntivi.
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function exportStats(kind) {
    const { stats } = KWStats.validateStats(X.stats);
    const date = KWStats.dayKey(Date.now());
    const empty = !Object.values(stats.days).some((d) => d.play > 0 || d.sessions || d.completed || d.intro || d.credits);
    if (kind === 'csv') download(`keep-watching-statistiche-${date}.csv`, KWStats.toCSV(stats), 'text/csv;charset=utf-8');
    else download(`keep-watching-statistiche-${date}.json`, JSON.stringify(KWStats.toJSON(stats, Date.now(), VERSION), null, 2), 'application/json');
    const msg = $('exportResult');
    msg.hidden = false;
    msg.className = empty ? 'hint warn' : 'hint ok';
    msg.textContent = empty ? 'Non ci sono ancora dati: il file contiene solo l\'intestazione.' : `File ${kind.toUpperCase()} scaricato.`;
  }
  $('exportCsv').addEventListener('click', () => exportStats('csv'));
  $('exportJson').addEventListener('click', () => exportStats('json'));

  // Importazione. Nel popup la finestra di scelta del file chiuderebbe il popup stesso:
  // per questo dal popup si passa a una scheda.
  let importMode = 'merge';
  let pendingImport = null;
  const IMPORT_HINT = {
    merge: 'Unisci: per ogni giorno si tiene il valore più alto, così reimportare lo stesso file non raddoppia nulla.',
    replace: 'Sostituisci: lo storico attuale viene cancellato e rimpiazzato dal file (ti verrà chiesta conferma).'
  };
  function renderImportMode() {
    setSeg($('importMode'), importMode);
    $('importModeHint').textContent = IMPORT_HINT[importMode];
  }
  $('importMode').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (b) { importMode = b.dataset.value; renderImportMode(); }
  });
  $('importLabel').hidden = !IS_TAB;
  $('importInTab').hidden = IS_TAB;
  $('importInTab').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/popup/popup.html?tab=1#stats') });
    window.close();
  });

  function importResult(ok, text) {
    const p = $('importResult');
    p.hidden = false;
    p.className = ok ? 'hint ok' : 'hint error';
    p.textContent = text;
  }

  async function runImport(text, mode) {
    const res = await chrome.runtime.sendMessage({ type: 'kwStatsImport', text, mode }).catch((e) => ({ ok: false, error: e.message }));
    if (!res || !res.ok) return importResult(false, `File non importato: ${(res && res.error) || 'errore sconosciuto'}`);
    importResult(true, mode === 'replace'
      ? 'Storico sostituito con il contenuto del file.'
      : `Importazione completata: ${res.added} giorni aggiunti, ${res.updated} aggiornati.`);
  }

  $('importFile').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return importResult(false, 'File troppo grande per essere un\'esportazione di Keep_Watching.');
    const text = await file.text();
    const parsed = KWStats.parseImport(text);
    if (!parsed.ok) return importResult(false, `File non importato: ${parsed.error}`);
    if (importMode === 'replace') {
      pendingImport = text;
      $('importConfirm').hidden = false;
      $('importConfirmText').textContent = `Il file contiene ${Object.keys(parsed.days).length} giorni. Lo storico attuale verrà eliminato.`;
      return;
    }
    runImport(text, 'merge');
  });
  $('importCancel').addEventListener('click', () => { pendingImport = null; $('importConfirm').hidden = true; });
  $('importGo').addEventListener('click', () => {
    $('importConfirm').hidden = true;
    if (pendingImport) runImport(pendingImport, 'replace');
    pendingImport = null;
  });

  $('resetStats').addEventListener('click', () => { $('resetConfirm').hidden = false; $('resetResult').hidden = true; });
  $('resetCancel').addEventListener('click', () => { $('resetConfirm').hidden = true; });
  $('resetGo').addEventListener('click', async () => {
    $('resetConfirm').hidden = true;
    const res = await chrome.runtime.sendMessage({ type: 'kwStatsReset' }).catch(() => null);
    const p = $('resetResult');
    p.hidden = false;
    p.className = res && res.ok ? 'hint ok' : 'hint error';
    p.textContent = res && res.ok ? 'Statistiche azzerate.' : 'Azzeramento non riuscito: riprova.';
  });

  // ---------- Aggiornamenti ----------

  async function getLocalChangelog() {
    if (localChangelog) return localChangelog;
    try {
      const md = await (await fetch(chrome.runtime.getURL('CHANGELOG.md'))).text();
      localChangelog = KWUpdates.parseChangelog(md, 5);
    } catch (e) {
      localChangelog = [];
    }
    return localChangelog;
  }

  async function renderLocalChangelog() {
    const log = await getLocalChangelog();
    const body = $('localChangelogBody');
    if (!log.length) { body.replaceChildren(h('p', { class: 'hint', text: 'Changelog non disponibile.' })); return; }
    body.replaceChildren(...log.slice(0, 3).map((s) => h('div', { class: 'history-item' },
      h('div', { class: 'history-head' }, h('b', { text: s.version }), h('span', { class: 'date', text: fmtDate(s.date) }), s.version === VERSION ? h('span', { class: 'tag current', text: 'installata' }) : null),
      h('ul', { class: 'notes' }, s.items.slice(0, 10).map((i) => h('li', { text: i.section ? `${i.section}: ${i.text}` : i.text }))))));
  }

  function markUpdateSeen() {
    const c = X.updateCheck;
    if (c && c.ok && c.latest && X.updateSeen !== c.latest.version) set({ updateSeen: c.latest.version });
  }

  function openUrl(url) {
    if (typeof url === 'string' && url.startsWith('https://')) chrome.tabs.create({ url });
  }

  function renderUpdates() {
    $('uInstalled').textContent = VERSION;
    const c = X.updateCheck;
    const status = $('uStatus');
    const action = $('updateAction');
    $('uNotesBox').hidden = true;
    $('installSteps').hidden = true;
    $('uPrerelease').hidden = true;
    action.hidden = true;
    action.className = 'btn';
    action.disabled = false;

    if (checking) {
      status.className = 'update-status';
      status.textContent = 'Controllo in corso…';
    } else if (!c) {
      status.className = 'update-status';
      status.textContent = 'Non hai ancora controllato.';
    }
    $('uLastCheck').textContent = c ? `Ultimo controllo: ${fmtDateTime(c.at)}${c.ok ? '' : ' (non riuscito)'}${!c.ok && c.lastOkAt ? ` · ultimo riuscito: ${fmtDateTime(c.lastOkAt)}` : ''}` : '';
    $('uSource').textContent = c && c.ok ? (c.source === 'releases' ? '· release GitHub' : '· version.json e CHANGELOG.md') : '';

    const latest = c && c.ok ? c.latest : null;
    $('uLatest').textContent = latest ? latest.version : '—';
    $('uLatestDate').textContent = latest && latest.date ? fmtDate(latest.date) : '';

    if (c && !checking) {
      if (!c.ok) {
        status.className = 'update-status error';
        status.textContent = c.error || 'Controllo non riuscito.';
      } else if (c.status === 'available') {
        status.className = 'update-status available';
        status.textContent = `È disponibile la ${latest.version}.`;
        action.hidden = false;
        if (latest.asset) {
          action.className = 'btn primary';
          action.replaceChildren(svgIcon('i-download'), 'Scarica aggiornamento');
          action.onclick = () => { openUrl(latest.asset.url); $('installSteps').hidden = false; };
        } else {
          action.replaceChildren(svgIcon('i-external'), 'Apri la pagina su GitHub');
          action.onclick = () => openUrl(latest.url);
        }
        $('installSteps').hidden = false;
        $('uNotesBox').hidden = false;
        $('uNotesTitle').textContent = `Novità della ${latest.version}`;
        $('uNotes').replaceChildren(...(latest.notes.length ? latest.notes.map((n) => h('li', { text: n }))
          : [h('li', { text: 'Questa versione non ha note di rilascio.' })]));
      } else if (c.status === 'uptodate') {
        status.className = 'update-status uptodate';
        status.textContent = 'Sei aggiornato: hai l\'ultima versione stabile.';
        action.hidden = false;
        action.disabled = true;
        action.replaceChildren(svgIcon('i-check'), 'Sei aggiornato');
      } else if (c.status === 'ahead') {
        status.className = 'update-status';
        status.textContent = `Hai la ${VERSION}, più recente dell'ultima pubblicata (${latest.version}).`;
      } else {
        status.className = 'update-status';
        status.textContent = 'Nel repository non c\'è ancora una versione stabile pubblicata.';
      }
      if (c.prerelease) {
        $('uPrerelease').hidden = false;
        $('uPrerelease').textContent = `C'è anche una versione di prova (${c.prerelease.version}): non viene proposta come aggiornamento.`;
      }
    }

    const history = (c && c.ok && c.history) || [];
    $('historyEmpty').hidden = history.length > 0;
    if (c && c.ok && !history.length) $('historyEmpty').textContent = 'Il registro delle versioni non è disponibile nel repository.';
    $('historyList').replaceChildren(...history.slice(0, 8).map((r) => {
      const link = r.url ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: 'Su GitHub' }) : null;
      return h('div', { class: 'history-item' },
        h('div', { class: 'history-head' }, h('b', { text: r.version }), h('span', { class: 'date', text: fmtDate(r.date) }),
          r.prerelease ? h('span', { class: 'tag pre', text: 'di prova' }) : null,
          r.version === VERSION ? h('span', { class: 'tag current', text: 'installata' }) : null, link),
        r.notes && r.notes.length
          ? h('ul', { class: 'notes' }, r.notes.slice(0, 5).map((n) => h('li', { text: n })))
          : h('p', { class: 'hint', text: 'Nessuna nota per questa versione.' }));
    }));
  }

  async function checkUpdates({ manual }) {
    const last = X.updateCheck;
    if (manual && !KWUpdates.canCheck(last)) {
      const until = last.rateLimitReset && Date.now() < last.rateLimitReset
        ? `GitHub accetta di nuovo richieste dalle ${fmtClock(last.rateLimitReset)}.`
        : 'Hai controllato meno di un minuto fa: riprova tra poco.';
      $('uStatus').className = 'update-status';
      $('uStatus').textContent = until;
      return;
    }
    checking = true;
    $('checkUpdate').disabled = true;
    renderUpdates();
    const result = await KWUpdates.checkForUpdates({
      repo: KW_LINKS.repo, installed: VERSION, fetchImpl: (url, init) => fetch(url, init)
    });
    result.lastOkAt = result.ok ? result.at : (last && (last.ok ? last.at : last.lastOkAt)) || null;
    checking = false;
    $('checkUpdate').disabled = false;
    await set({ updateCheck: result });
  }
  $('checkUpdate').addEventListener('click', () => checkUpdates({ manual: true }));

  $('reloadExt').addEventListener('click', async () => {
    // Il codice nuovo è quello che hai estratto nella cartella: niente arriva da Internet.
    await set({ reloadRequest: { from: VERSION, at: Date.now() } });
    chrome.runtime.reload();
  });

  // ---------- Link esterni (unico punto di configurazione: KW_LINKS) ----------

  function renderLinks() {
    const kofiOk = /^https:\/\/ko-fi\.com\/[A-Za-z0-9_]+$/.test(KW_LINKS.kofi || '');
    for (const a of $$('[data-kofi-link]')) {
      if (kofiOk) { a.href = KW_LINKS.kofi; a.hidden = false; } else a.hidden = true;
    }
    $('repoLink').href = KW_LINKS.repoUrl;
    $('repoLink').textContent = KW_LINKS.repoUrl.replace(/^https:\/\//, '');
  }

  // ---------- Caricamento e aggiornamento ----------

  async function load() {
    const raw = await chrome.storage.local.get({ ...KW_DEFAULTS, ...EXTRA_DEFAULTS });
    S = kwSanitize(raw);
    for (const k of Object.keys(EXTRA_DEFAULTS)) X[k] = raw[k];
    try { nowPlaying = (await chrome.storage.session.get('nowPlaying')).nowPlaying || null; } catch (e) { nowPlaying = null; }
    render();
  }

  function render() {
    renderSettings();
    renderPopups();
    renderPreview();
    renderSleep();
    renderSkip();
    renderStreak();
    renderSeries();
    renderProfiles();
    renderOverview();
    renderWhatsNew();
    renderStats();
    renderUpdates();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderStats, 150); });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') load();
    if (area === 'session' && changes.nowPlaying) { nowPlaying = changes.nowPlaying.newValue || null; renderOverview(); }
  });

  $('version').textContent = `v${VERSION}`;
  bindSettings();
  renderLinks();
  renderImportMode();
  renderShortcuts();
  renderLocalChangelog();
  statsRange = store.get('kwStatsRange', '7');
  if (!['today', '7', '30'].includes(statsRange)) statsRange = '7';
  showSection(location.hash.slice(1) || store.get('kwSection', 'overview'), false);

  load().then(() => {
    // Controllo automatico: al massimo uno al giorno, solo all'apertura del menu.
    if (S.updateAutoCheck && KWUpdates.dueForAutoCheck(X.updateCheck)) checkUpdates({ manual: false });
  });
})();
