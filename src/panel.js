/**
 * Keep_Watching — riquadro e avvisi mostrati sul player.
 *
 * Usato da player.js. Lo stile è isolato in uno Shadow DOM chiuso, così il CSS del sito
 * non lo altera. Gli elementi vanno inseriti nel contenitore che va a schermo intero,
 * altrimenti non si vedrebbero a schermo intero.
 *
 * Aspetto: dimensione, opacità dello sfondo e animazioni arrivano dalle impostazioni
 * (uiSize, uiOpacity, uiReduceMotion) come variabili CSS sull'elemento ospite.
 */

// Palette condivisa da riquadro, avvisi, barra e guida: identità scura con blu elettrico.
const KW_PLAYER_THEME = `
  :host {
    all: initial;
    --kw-blue: #5b63f0;
    --kw-blue-hover: #6f77f5;
    --kw-green: #19ad79;
    --kw-amber: #f2a93b;
    --kw-red: #ef5350;
    --kw-text: #eef1f5;
    --kw-muted: #a3acb9;
    --kw-line: rgba(255, 255, 255, 0.10);
    --kw-bg-rgb: 13, 16, 21;
    --kw-alpha: 0.82;
    --kw-scale: 1;
    --kw-gap: 8px;
    --kw-speed: 160ms;
    font: calc(14px * var(--kw-scale)) / 1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--kw-text);
  }
  :host([data-reduce-motion]) { --kw-speed: 0ms; }
  @media (prefers-reduced-motion: reduce) { :host { --kw-speed: 0ms; } }
  * { box-sizing: border-box; }
  button {
    padding: calc(7px * var(--kw-scale)) calc(14px * var(--kw-scale));
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 7px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--kw-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--kw-speed), border-color var(--kw-speed);
  }
  button:hover { background: rgba(255, 255, 255, 0.10); }
  button.primary { border-color: var(--kw-blue); background: var(--kw-blue); color: #fff; }
  button.primary:hover { border-color: var(--kw-blue-hover); background: var(--kw-blue-hover); }
  button:focus-visible { outline: 2px solid var(--kw-blue); outline-offset: 2px; }
`;

const KW_SIZE_SCALE = { compact: 0.86, standard: 1, large: 1.2 };
const KW_DENSITY_GAP = { dense: 4, standard: 8, spaced: 12 };

/** Applica l'aspetto scelto all'elemento ospite di uno Shadow DOM. */
function kwApplyUiVars(host, settings) {
  const s = settings || {};
  host.style.setProperty('--kw-scale', String(KW_SIZE_SCALE[s.uiSize] || 1));
  host.style.setProperty('--kw-gap', `${KW_DENSITY_GAP[s.uiDensity] || 8}px`);
  host.style.setProperty('--kw-alpha', String(Math.min(1, Math.max(0.4, (Number(s.uiOpacity) || 82) / 100))));
  if (s.uiReduceMotion) host.setAttribute('data-reduce-motion', '');
  else host.removeAttribute('data-reduce-motion');
}

const KW_PANEL_CSS = `
  .box {
    width: calc(300px * var(--kw-scale));
    max-width: calc(100vw - 32px);
    padding: calc(14px * var(--kw-scale)) calc(16px * var(--kw-scale));
    border: 1px solid var(--kw-line);
    border-radius: 12px;
    background: rgba(var(--kw-bg-rgb), var(--kw-alpha));
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    animation: kw-in var(--kw-speed) ease-out;
  }
  @keyframes kw-in { from { opacity: 0; transform: translateY(6px); } }
  .head { display: flex; align-items: center; gap: 10px; }
  .icon { flex: none; display: grid; place-items: center; width: 1.7em; height: 1.7em; border-radius: 50%;
    background: rgba(91, 99, 240, 0.22); color: #a3aaff; font-weight: 700; }
  .icon svg { width: 1.05em; height: 1.05em; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .icon.ok { background: rgba(25, 173, 121, 0.18); color: var(--kw-green); }
  .icon.warn { background: rgba(242, 169, 59, 0.18); color: var(--kw-amber); }
  .title { font-weight: 650; font-size: 1.05em; overflow-wrap: anywhere; }
  .text { margin-top: 3px; color: var(--kw-muted); overflow-wrap: anywhere; }
  .big { margin-top: 6px; font-size: 2em; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
  .bar { height: 4px; margin-top: 10px; overflow: hidden; border-radius: 2px; background: rgba(255, 255, 255, 0.12); }
  .bar > i { display: block; width: 100%; height: 100%; background: var(--kw-blue); transform-origin: left; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
`;

// Icone dei riquadri (vettoriali, 24×24, tratto): niente emoji o caratteri al posto delle icone.
const KW_PANEL_ICONS = {
  next: 'M6 5l9 7-9 7zM18 5v14',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 4l9 16H3zM12 10v4.5M12 17.5v.5',
  sleep: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  question: 'M9.2 9a2.9 2.9 0 1 1 4.3 2.5c-.9.5-1.5 1.1-1.5 2.2v.6M12 17.5v.5',
  info: 'M12 11v6M12 7.5v.5'
};
// Valori usati fino alla 1.4.1 (caratteri) → nome dell'icona.
const KW_PANEL_ICON_ALIASES = { '▶': 'next', '✓': 'ok', '⏾': 'sleep', '?': 'question', i: 'info' };

function kwPanelIcon(name) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', KW_PANEL_ICONS[KW_PANEL_ICON_ALIASES[name] || name] || KW_PANEL_ICONS.info);
  svg.append(path);
  return svg;
}

const KW_TOAST_CSS = `
  .toast {
    display: flex; align-items: center; gap: 8px;
    max-width: min(460px, calc(100vw - 32px));
    padding: calc(8px * var(--kw-scale)) calc(14px * var(--kw-scale));
    border: 1px solid var(--kw-line);
    border-radius: 999px;
    background: rgba(var(--kw-bg-rgb), var(--kw-alpha));
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
    animation: kw-in var(--kw-speed) ease-out;
  }
  @keyframes kw-in { from { opacity: 0; transform: translateY(-6px); } }
  .dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--kw-blue); }
  .dot.ok { background: var(--kw-green); }
  .dot.warn { background: var(--kw-amber); }
  .msg { overflow-wrap: anywhere; }
`;

// Eventi da non far arrivare al player: un click sul riquadro metterebbe in pausa il video.
const KW_PANEL_BLOCKED_EVENTS = ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'];

/** Elemento ospite con Shadow DOM chiuso, eventi del mouse bloccati e stile condiviso. */
function kwCreateHost(css, positionCss, name) {
  const host = document.createElement('div');
  host.style.cssText = positionCss;
  host.dataset.kw = name; // riconoscibile negli strumenti per sviluppatori e nei test
  KW_PANEL_BLOCKED_EVENTS.forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>${KW_PLAYER_THEME}${css}</style>`;
  return { host, root };
}

/**
 * Riquadro con titolo, testo, pulsanti ed eventuale conto alla rovescia.
 * @param {() => Element} getContainer  elemento in cui inserirlo
 * @param {() => object} getSettings    impostazioni correnti (aspetto)
 *
 * open({ title, text, icon, tone, kind, buttons, countdown })
 *   kind:      tipo del riquadro ('next', 'limit', 'info'…), letto con kind()
 *   buttons:   [{ label, primary, onClick }]  — ogni click chiude il riquadro
 *   countdown: { seconds, text(secondiRimasti), big: true, onDone }
 */
function kwCreatePanel(getContainer, getSettings) {
  let host = null;
  let timer = null;
  let currentKind = null;

  function close() {
    clearInterval(timer);
    timer = null;
    if (host) host.remove();
    host = null;
    currentKind = null;
  }

  function open({ title, text, icon = 'i', tone = '', kind = 'info', buttons = [], countdown }) {
    close();
    currentKind = kind;
    const made = kwCreateHost(KW_PANEL_CSS, 'position:absolute;right:24px;bottom:84px;z-index:2147483647;', 'panel');
    host = made.host;
    kwApplyUiVars(host, getSettings && getSettings());
    const box = document.createElement('div');
    box.className = 'box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML = `<div class="head"><span class="icon"></span><div><div class="title"></div><div class="text"></div></div></div>
      ${countdown && countdown.big ? '<div class="big"></div>' : ''}
      ${countdown ? '<div class="bar"><i></i></div>' : ''}
      <div class="actions"></div>`;
    const iconEl = box.querySelector('.icon');
    iconEl.append(kwPanelIcon(icon));
    if (tone) iconEl.classList.add(tone);
    box.querySelector('.title').textContent = title;
    const textEl = box.querySelector('.text');
    const bigEl = box.querySelector('.big');

    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', () => { close(); b.onClick(); });
      box.querySelector('.actions').appendChild(el);
    }
    if (!buttons.length) box.querySelector('.actions').remove();
    made.root.appendChild(box);
    getContainer().appendChild(host);

    if (!countdown) {
      textEl.textContent = text || '';
      return;
    }

    const bar = box.querySelector('.bar > i');
    const totalMs = countdown.seconds * 1000;
    const end = Date.now() + totalMs;
    const tick = () => {
      const msLeft = Math.max(0, end - Date.now());
      const s = Math.ceil(msLeft / 1000);
      textEl.textContent = countdown.text(s);
      if (bigEl) bigEl.textContent = `00:${String(s).padStart(2, '0')}`;
      bar.style.transform = `scaleX(${msLeft / totalMs})`;
      if (msLeft === 0) {
        close();
        countdown.onDone();
      }
    };
    tick();
    timer = setInterval(tick, 200);
  }

  return { open, close, isOpen: () => host !== null, kind: () => currentKind };
}

/**
 * Avvisi brevi in alto al centro, che spariscono da soli. Un avviso nuovo sostituisce il
 * precedente. show(text, { tone: 'ok' | 'warn', ms })
 */
function kwCreateToast(getContainer, getSettings) {
  let host = null;
  let root = null;
  let timer = null;

  function hide() {
    clearTimeout(timer);
    if (host) host.remove();
    host = null;
  }

  function show(text, { tone = '', ms = 3500 } = {}) {
    hide();
    const settings = (getSettings && getSettings()) || {};
    // Con la barra in alto al centro, l'avviso scende sotto la barra.
    const top = settings.uiPosition === 'top-center' ? 72 : 16;
    const made = kwCreateHost(KW_TOAST_CSS, `position:absolute;top:${top}px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;`, 'toast');
    host = made.host;
    root = made.root;
    kwApplyUiVars(host, getSettings && getSettings());
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="dot"></span><span class="msg"></span>';
    if (tone) el.querySelector('.dot').classList.add(tone);
    el.querySelector('.msg').textContent = text;
    root.appendChild(el);
    getContainer().appendChild(host);
    timer = setTimeout(hide, ms);
  }

  return { show, hide };
}
