/**
 * Keep_Watching — barra di pulsanti sul player.
 *
 * Usata da player.js. Compare quando si muove il mouse sul player e sparisce dopo
 * uiAutoHide secondi (0 = sempre visibile), con una logica propria che non dipende dalle
 * classi interne di JW Player. Resta visibile finché il mouse o il focus sono sulla barra.
 *
 * I pulsanti sono ridisegnati solo quando cambiano, e i click passano da un unico
 * listener sulla barra: niente listener duplicati quando la barra si aggiorna o quando
 * JW Player ricrea il suo contenitore (in quel caso la barra viene solo spostata).
 */

const KW_TOOLBAR_CSS = `
  .bar {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--kw-gap);
    max-width: min(620px, calc(100vw - 32px));
    padding: calc(var(--kw-gap) * 0.75);
    border: 1px solid var(--kw-line);
    border-radius: 12px;
    background: rgba(var(--kw-bg-rgb), var(--kw-alpha));
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    transition: opacity var(--kw-speed);
  }
  :host([data-align="right"]) .bar { justify-content: flex-end; }
  :host([data-align="center"]) .bar { justify-content: center; }
  button { white-space: nowrap; border-radius: 999px; background: rgba(255, 255, 255, 0.06); }
  button.active { border-color: var(--kw-green); color: #5fe0b0; }
  button.help { width: 2.3em; padding-left: 0; padding-right: 0; }
`;

const KW_TOOLBAR_POSITIONS = {
  'top-right': { css: 'top:16px;right:16px;', align: 'right' },
  'top-left': { css: 'top:16px;left:16px;', align: 'left' },
  'top-center': { css: 'top:16px;left:50%;transform:translateX(-50%);', align: 'center' }
};

/**
 * @param {() => Element} getContainer  elemento in cui inserire la barra
 * @param {() => object} getSettings    impostazioni correnti (aspetto e nascondimento)
 * @returns {{ render: Function, show: Function, applySettings: Function, isVisible: Function }}
 *
 * render(buttons): [{ id, label, title, primary, active, extraClass, onClick }]
 * show(): mostra la barra (e programma il nascondimento, se attivo).
 */
function kwCreateToolbar(getContainer, getSettings) {
  let host = null;
  let bar = null;
  let hideTimer = null;
  let hovered = false;
  let renderedKey = '';
  let handlers = {};

  const settings = () => (getSettings && getSettings()) || {};
  const autoHideMs = () => {
    const s = Number(settings().uiAutoHide);
    return Number.isFinite(s) ? s * 1000 : 3000;
  };

  function ensure() {
    const container = getContainer();
    if (!host) {
      const made = kwCreateHost(KW_TOOLBAR_CSS, '', 'toolbar');
      host = made.host;
      host.addEventListener('pointerenter', () => { hovered = true; clearTimeout(hideTimer); });
      host.addEventListener('pointerleave', () => { hovered = false; scheduleHide(); });
      host.addEventListener('focusout', () => scheduleHide());
      bar = document.createElement('div');
      bar.className = 'bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Keep_Watching');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && handlers[btn.dataset.id]) handlers[btn.dataset.id]();
        scheduleHide();
      });
      made.root.appendChild(bar);
      applySettings();
      host.style.display = 'none';
    }
    if (host.parentNode !== container) container.appendChild(host);
  }

  /** Posizione, aspetto e nascondimento: si possono cambiare mentre si guarda. */
  function applySettings() {
    if (!host) return;
    const s = settings();
    const pos = KW_TOOLBAR_POSITIONS[s.uiPosition] || KW_TOOLBAR_POSITIONS['top-right'];
    const display = host.style.display;
    host.style.cssText = `position:absolute;z-index:2147483647;${pos.css}`;
    host.style.display = display;
    host.dataset.align = pos.align;
    kwApplyUiVars(host, s);
    if (autoHideMs() === 0 && bar && bar.childElementCount) host.style.display = '';
    else scheduleHide();
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    const ms = autoHideMs();
    if (!host || ms === 0) return;
    hideTimer = setTimeout(() => {
      // Non si nasconde mentre la si usa: mouse sopra o pulsante con il focus.
      if (hovered || (host && host.matches(':focus-within'))) return;
      if (host) host.style.display = 'none';
    }, ms);
  }

  function render(buttons) {
    ensure();
    handlers = Object.fromEntries(buttons.map((b) => [b.id, b.onClick]));
    const key = JSON.stringify(buttons.map((b) => [b.id, b.label, b.title || '', !!b.primary, !!b.active, b.extraClass || '']));
    if (key === renderedKey) return;
    renderedKey = key;
    bar.replaceChildren(...buttons.map((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.id = b.id;
      el.textContent = b.label;
      if (b.title) { el.title = b.title; el.setAttribute('aria-label', b.title); }
      el.className = [b.primary && 'primary', b.active && 'active', b.extraClass].filter(Boolean).join(' ');
      if (b.active) el.setAttribute('aria-pressed', 'true');
      return el;
    }));
    if (!buttons.length) host.style.display = 'none';
    else if (autoHideMs() === 0) host.style.display = '';
  }

  function show() {
    ensure();
    if (!bar.childElementCount) return;
    host.style.display = '';
    scheduleHide();
  }

  return { render, show, applySettings, isVisible: () => Boolean(host && host.style.display !== 'none') };
}
