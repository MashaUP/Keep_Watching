/**
 * Keep_Watching — service worker.
 *
 *   - badge sull'icona: "OFF" se sospesa, "2/3" durante un limite di episodi;
 *   - scorciatoia da tastiera per attivare o sospendere l'estensione;
 *   - notifiche sul desktop (richieste da player.js);
 *   - schermo intero della finestra tra un episodio e l'altro ("cinema").
 *
 * Il service worker può essere fermato dal browser in qualsiasi momento: lo stato
 * va sempre tenuto in chrome.storage, mai in variabili globali.
 */
importScripts('defaults.js');

const BADGE_GREEN = '#19AD79';
const BADGE_GREY = '#5A6370';
// Dopo l'attivazione della modalità cinema, ignora per un attimo i cambi di dimensione
// della finestra: sono quelli provocati dalla transizione stessa.
const CINEMA_SETTLE_MS = 2500;

// ---------- Badge ----------

async function updateBadge() {
  const s = await chrome.storage.local.get({ ...KW_DEFAULTS, streak: 0, lastAutoAt: 0 });
  let text = '';
  let color = BADGE_GREEN;
  let title = 'Keep_Watching: attivo';

  if (!s.enabled) {
    text = 'OFF';
    color = BADGE_GREY;
    title = 'Keep_Watching: sospeso';
  } else if (s.stopAfter > 0 && s.streak > 0 && Date.now() - s.lastAutoAt < KW_STREAK_RESET_MS) {
    text = `${s.streak}/${s.stopAfter}`;
    title = `Keep_Watching: ${s.streak} episodi su ${s.stopAfter} prima di chiedere`;
  }

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setTitle({ title });
}

// ---------- Interruttore rapido ----------

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-enabled') return;
  const { enabled } = await chrome.storage.local.get({ enabled: KW_DEFAULTS.enabled });
  await chrome.storage.local.set({ enabled: !enabled });
});

// ---------- Modalità cinema ----------

async function enterCinema(windowId) {
  const win = await chrome.windows.get(windowId);
  const prev = win.state === 'fullscreen' || win.state === 'minimized' ? 'maximized' : win.state;
  await chrome.storage.local.set({
    cinema: true, cinemaWindowId: windowId, cinemaPrevState: prev, cinemaSince: Date.now()
  });
  if (win.state !== 'fullscreen') await chrome.windows.update(windowId, { state: 'fullscreen' });
}

async function exitCinema() {
  const s = await chrome.storage.local.get({ cinema: false, cinemaWindowId: null, cinemaPrevState: 'maximized' });
  if (!s.cinema) return;
  await chrome.storage.local.set({ cinema: false });
  if (s.cinemaWindowId == null) return;
  try {
    const win = await chrome.windows.get(s.cinemaWindowId);
    if (win.state === 'fullscreen') await chrome.windows.update(s.cinemaWindowId, { state: s.cinemaPrevState });
  } catch (e) { /* finestra già chiusa */ }
}

// Se l'utente esce dallo schermo intero da solo (F11), la modalità cinema termina.
chrome.windows.onBoundsChanged.addListener(async (win) => {
  const s = await chrome.storage.local.get({ cinema: false, cinemaWindowId: null, cinemaSince: 0 });
  if (!s.cinema || win.id !== s.cinemaWindowId) return;
  if (Date.now() - s.cinemaSince < CINEMA_SETTLE_MS) return;
  const current = await chrome.windows.get(win.id);
  if (current.state !== 'fullscreen') await chrome.storage.local.set({ cinema: false });
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const s = await chrome.storage.local.get({ cinema: false, cinemaWindowId: null });
  if (s.cinema && windowId === s.cinemaWindowId) await chrome.storage.local.set({ cinema: false });
});

// ---------- Notifiche ----------

async function notify(title, message, tab) {
  const id = await chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message
  });
  if (tab) await chrome.storage.session.set({ [`notif:${id}`]: { tabId: tab.id, windowId: tab.windowId } });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const key = `notif:${id}`;
  const { [key]: target } = await chrome.storage.session.get(key);
  chrome.notifications.clear(id);
  if (!target) return;
  try {
    await chrome.windows.update(target.windowId, { focused: true });
    await chrome.tabs.update(target.tabId, { active: true });
  } catch (e) { /* scheda già chiusa */ }
});

chrome.notifications.onClosed.addListener((id) => chrome.storage.session.remove(`notif:${id}`));

// ---------- Messaggi dai content script ----------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case 'notify':
        await notify(msg.title, msg.message, sender.tab);
        break;
      case 'enterCinema':
        if (sender.tab) await enterCinema(sender.tab.windowId);
        break;
      case 'exitCinema':
        await exitCinema();
        break;
      case 'reloadEpisode':
        // Inoltrato a tutti i frame della scheda: risponde solo l'iframe intermedio (recovery.js).
        if (sender.tab) await chrome.tabs.sendMessage(sender.tab.id, { type: 'kwReloadEpisode', minute: msg.minute });
        break;
    }
  })().then(() => sendResponse({ ok: true }), (err) => sendResponse({ ok: false, error: String(err) }));
  return true; // risposta asincrona
});

// ---------- Reazioni alle impostazioni ----------

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (['enabled', 'stopAfter', 'streak', 'lastAutoAt'].some((k) => k in changes)) updateBadge();

  // Sospendere l'estensione o disattivare l'opzione chiude la modalità cinema.
  const turnedOff = (k) => changes[k] && changes[k].newValue === false;
  if (turnedOff('enabled') || turnedOff('keepFullscreen')) exitCinema();
});

// All'avvio del browser (o dopo un'installazione o un aggiornamento) la modalità cinema
// non può essere attiva, e il badge va ricalcolato.
function resetOnStart() {
  chrome.storage.local.set({ cinema: false });
  updateBadge();
}
chrome.runtime.onStartup.addListener(resetOnStart);
chrome.runtime.onInstalled.addListener(resetOnStart);
