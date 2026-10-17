/**
 * Keep_Watching — guida alle scorciatoie mostrata sul player.
 *
 * Usata da player.js. Si apre con la scorciatoia "Guida alle scorciatoie", con il
 * pulsante "?" della barra o dal menu dell'estensione; si chiude con Esc, con "Chiudi"
 * o da sola dopo guideAutoClose secondi (0 = mai).
 *
 * Mostra solo i comandi dichiarati in manifest.json. Lo stato di ogni scorciatoia arriva
 * dal service worker (chrome.commands.getAll, vedi kwShortcutStates in defaults.js); la
 * disponibilità nel momento attuale la calcola il player.
 */

const KW_GUIDE_CSS = `
  .win {
    width: min(calc(440px * var(--kw-scale)), calc(100vw - 32px));
    max-height: calc(100vh - 48px);
    overflow: auto;
    padding: calc(16px * var(--kw-scale));
    border: 1px solid var(--kw-line);
    border-radius: 14px;
    background: rgba(var(--kw-bg-rgb), max(var(--kw-alpha), 0.92));
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
    animation: kw-in var(--kw-speed) ease-out;
  }
  @keyframes kw-in { from { opacity: 0; transform: translateY(8px); } }
  h2 { margin: 0 0 4px; font-size: 1.1em; }
  .sub { margin: 0 0 10px; color: var(--kw-muted); font-size: 0.9em; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center;
    padding: 8px 0; border-top: 1px solid var(--kw-line); }
  li:first-child { border-top: 0; }
  .label { font-weight: 600; }
  kbd { justify-self: end; padding: 2px 8px; border: 1px solid rgba(255, 255, 255, 0.22); border-bottom-width: 2px;
    border-radius: 6px; background: rgba(255, 255, 255, 0.06); font: 600 0.88em/1.5 ui-monospace, Consolas, monospace; white-space: nowrap; }
  kbd.none { color: var(--kw-muted); font-family: inherit; font-weight: 500; border-style: dashed; }
  .state { grid-column: 1 / -1; font-size: 0.86em; color: var(--kw-muted); }
  .state.ok { color: #5fe0b0; }
  .state.warn { color: var(--kw-amber); }
  .foot { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 12px; }
  .note { margin: 10px 0 0; color: var(--kw-muted); font-size: 0.82em; }
`;

/**
 * @param {() => Element} getContainer
 * @param {() => object} getSettings
 * @param {{ onConfigure: Function }} actions
 */
function kwCreateGuide(getContainer, getSettings, actions) {
  let host = null;
  let timer = null;

  function close() {
    clearTimeout(timer);
    if (host) host.remove();
    host = null;
  }

  /**
   * @param {Array} states        [{ name, label, shortcut, state, conflict }]
   * @param {object} availability { [name]: true | 'motivo per cui non è disponibile' }
   */
  function open(states, availability) {
    close();
    const settings = (getSettings && getSettings()) || {};
    const made = kwCreateHost(KW_GUIDE_CSS, 'position:absolute;top:12%;left:50%;transform:translateX(-50%);z-index:2147483647;', 'guide');
    host = made.host;
    kwApplyUiVars(host, settings);

    const win = document.createElement('div');
    win.className = 'win';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', 'Scorciatoie di Keep_Watching');
    win.innerHTML = `<h2>Scorciatoie di Keep_Watching</h2>
      <p class="sub">Funzionano con il focus sul player o sulla pagina del sito, non mentre scrivi in un campo di testo.</p>
      <ul></ul>
      <p class="note">Il browser segnala solo le scorciatoie che non ha potuto assegnare. Eventuali tasti usati dal sito o da altre estensioni non sono rilevabili da qui.</p>
      <div class="foot"><button type="button" data-a="configure">Configura scorciatoie</button><button type="button" class="primary" data-a="close">Chiudi (Esc)</button></div>`;
    const list = win.querySelector('ul');
    for (const s of states || []) {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = s.label;
      const kbd = document.createElement('kbd');
      kbd.textContent = s.display || s.shortcut || 'Non assegnata';
      if (!s.shortcut) kbd.className = 'none';
      const state = document.createElement('span');
      state.className = 'state';
      const avail = availability ? availability[s.name] : true;
      if (s.state === 'missing') {
        state.classList.add('warn');
        state.textContent = 'Il browser non l\'ha assegnata: probabilmente la usa già un\'altra estensione. Sceglila in "Configura scorciatoie".';
      } else if (s.state === 'unassigned') {
        state.textContent = 'Nessuna combinazione: puoi assegnarla in "Configura scorciatoie".';
      } else if (s.conflict) {
        state.classList.add('warn');
        state.textContent = `Possibile conflitto: ${s.conflict}.`;
      } else if (avail !== true) {
        state.textContent = `Non disponibile ora${typeof avail === 'string' ? `: ${avail}` : ''}.`;
      } else {
        state.classList.add('ok');
        state.textContent = 'Attiva';
      }
      li.append(label, kbd, state);
      list.appendChild(li);
    }
    win.addEventListener('click', (e) => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'close') close();
      if (a === 'configure' && actions && actions.onConfigure) actions.onConfigure();
    });
    made.root.appendChild(win);
    getContainer().appendChild(host);

    const auto = Number(settings.guideAutoClose) || 0;
    if (auto > 0) timer = setTimeout(close, auto * 1000);
  }

  return { open, close, isOpen: () => host !== null };
}
