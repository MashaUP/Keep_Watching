/**
 * Keep_Watching — riquadro mostrato sul player (conto alla rovescia e domande).
 *
 * Usato da player.js. Lo stile è isolato in uno Shadow DOM chiuso, così il CSS del
 * sito non lo altera. Il riquadro va inserito nel contenitore che va a schermo intero,
 * altrimenti non si vedrebbe a schermo intero.
 */

const KW_PANEL_CSS = `
  :host { all: initial; }
  .box {
    min-width: 240px;
    max-width: 320px;
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    background: rgba(21, 25, 30, 0.94);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
    color: #e9edf0;
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  .title { font-weight: 650; font-size: 15px; }
  .text { margin-top: 2px; color: #a7b0ba; }
  .bar { height: 3px; margin-top: 10px; overflow: hidden; border-radius: 2px; background: #2b323b; }
  .bar > i { display: block; width: 100%; height: 100%; background: #19ad79; transform-origin: left; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
  button {
    padding: 7px 14px;
    border: 1px solid #3a424c;
    border-radius: 6px;
    background: transparent;
    color: #e9edf0;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: rgba(255, 255, 255, 0.08); }
  button.primary { border-color: #19ad79; background: #19ad79; color: #0d1512; }
  button.primary:hover { background: #1fc58b; }
  button:focus-visible { outline: 2px solid #19ad79; outline-offset: 2px; }
`;

// Eventi da non far arrivare al player: un click sul riquadro metterebbe in pausa il video.
const KW_PANEL_BLOCKED_EVENTS = ['click', 'dblclick', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'];

/**
 * @param {() => Element} getContainer  elemento in cui inserire il riquadro
 * @returns {{ open: Function, close: Function, isOpen: () => boolean }}
 *
 * open({ title, text, buttons, countdown })
 *   buttons:   [{ label, primary, onClick }]  — ogni click chiude il riquadro
 *   countdown: { seconds, text(secondiRimasti), onDone }  — facoltativo, al posto di text
 */
function kwCreatePanel(getContainer) {
  let host = null;
  let timer = null;

  function close() {
    clearInterval(timer);
    timer = null;
    if (host) host.remove();
    host = null;
  }

  function open({ title, text, buttons, countdown }) {
    close();
    host = document.createElement('div');
    host.style.cssText = 'position:absolute;right:24px;bottom:84px;z-index:2147483647;';
    KW_PANEL_BLOCKED_EVENTS.forEach((type) => host.addEventListener(type, (e) => e.stopPropagation()));

    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${KW_PANEL_CSS}</style>
      <div class="box" role="dialog" aria-live="polite">
        <div class="title"></div>
        <div class="text"></div>
        ${countdown ? '<div class="bar"><i></i></div>' : ''}
        <div class="actions"></div>
      </div>`;
    root.querySelector('.title').textContent = title;
    const textEl = root.querySelector('.text');

    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.textContent = b.label;
      if (b.primary) el.className = 'primary';
      el.addEventListener('click', () => { close(); b.onClick(); });
      root.querySelector('.actions').appendChild(el);
    }

    getContainer().appendChild(host);

    if (!countdown) {
      textEl.textContent = text;
      return;
    }

    const bar = root.querySelector('.bar > i');
    const totalMs = countdown.seconds * 1000;
    const end = Date.now() + totalMs;
    const tick = () => {
      const msLeft = Math.max(0, end - Date.now());
      textEl.textContent = countdown.text(Math.ceil(msLeft / 1000));
      bar.style.transform = `scaleX(${msLeft / totalMs})`;
      if (msLeft === 0) {
        close();
        countdown.onDone();
      }
    };
    tick();
    timer = setInterval(tick, 200);
  }

  return { open, close, isOpen: () => host !== null };
}
