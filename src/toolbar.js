/**
 * Keep_Watching — barra di pulsanti in alto a destra sul player.
 *
 * Usata da player.js. Compare quando si muove il mouse sul player e sparisce dopo
 * qualche secondo, come i controlli di JW Player, ma con una logica propria (non
 * dipende dalle classi interne di JW). Lo stile è isolato in uno Shadow DOM chiuso.
 */

const KW_TOOLBAR_CSS = `
  :host { all: initial; }
  .bar { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; max-width: 520px; }
  button {
    padding: 7px 13px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    background: rgba(21, 25, 30, 0.82);
    color: #e9edf0;
    font: 600 13px/1.2 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    cursor: pointer;
    backdrop-filter: blur(4px);
  }
  button:hover { background: rgba(40, 46, 54, 0.92); }
  button.primary { border-color: #19ad79; background: #19ad79; color: #0d1512; }
  button.primary:hover { background: #1fc58b; }
  button.active { border-color: #19ad79; color: #4fd6a3; }
  button:focus-visible { outline: 2px solid #19ad79; outline-offset: 2px; }
`;

const KW_TOOLBAR_HIDE_MS = 3000;

/**
 * @param {() => Element} getContainer  elemento in cui inserire la barra
 * @returns {{ render: Function, show: Function }}
 *
 * render(buttons): [{ id, label, primary, active, onClick }] — la barra si ridisegna
 *   solo se i pulsanti cambiano; con un elenco vuoto resta nascosta.
 * show(): mostra la barra per qualche secondo.
 */
function kwCreateToolbar(getContainer) {
  let host = null;
  let bar = null;
  let hideTimer = null;
  let hovered = false;
  let renderedKey = '';
  let handlers = {};

  function ensure() {
    const container = getContainer();
    if (host && host.parentNode === container) return;
    if (!host) {
      host = document.createElement('div');
      host.style.cssText = 'position:absolute;top:16px;right:16px;z-index:2147483647;display:none;';
      KW_PANEL_BLOCKED_EVENTS.forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));
      host.addEventListener('pointerenter', () => { hovered = true; });
      host.addEventListener('pointerleave', () => { hovered = false; scheduleHide(); });

      const root = host.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>${KW_TOOLBAR_CSS}</style><div class="bar"></div>`;
      bar = root.querySelector('.bar');
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && handlers[btn.dataset.id]) handlers[btn.dataset.id]();
      });
    }
    container.appendChild(host);
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!hovered && host) host.style.display = 'none';
    }, KW_TOOLBAR_HIDE_MS);
  }

  function render(buttons) {
    ensure();
    handlers = Object.fromEntries(buttons.map((b) => [b.id, b.onClick]));
    const key = JSON.stringify(buttons.map((b) => [b.id, b.label, !!b.primary, !!b.active]));
    if (key === renderedKey) return;
    renderedKey = key;
    bar.replaceChildren(...buttons.map((b) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.dataset.id = b.id;
      el.textContent = b.label;
      el.className = [b.primary && 'primary', b.active && 'active'].filter(Boolean).join(' ');
      if (b.active) el.setAttribute('aria-pressed', 'true');
      return el;
    }));
    if (!buttons.length) host.style.display = 'none';
  }

  function show() {
    ensure();
    if (!bar.childElementCount) return;
    host.style.display = '';
    scheduleHide();
  }

  return { render, show };
}
