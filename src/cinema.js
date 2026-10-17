/**
 * Keep_Watching — modalità cinema (schermo intero tra un episodio e l'altro).
 *
 * Gira nelle pagine del sito: la pagina principale (…/it/watch/<id>) e l'iframe
 * intermedio (…/it/iframe/<id>). Quando la modalità è attiva (chiave "cinema"),
 * allarga a tutta la finestra l'iframe che porta al player, a entrambi i livelli.
 * La finestra del browser viene messa a schermo intero dal service worker.
 *
 * Perché non lo schermo intero "vero": il browser lo concede solo in risposta a un
 * click dell'utente, e al cambio episodio il player viene ricreato da zero.
 *
 * Nelle stesse pagine risponde anche alle verifiche delle scorciatoie (campo di testo
 * con il focus) e inoltra Esc per chiudere la guida alle scorciatoie.
 */
(() => {
  'use strict';

  const STYLE_ID = 'kw-cinema-style';
  const CSS = `
    html, body { overflow: hidden !important; }
    iframe[src*="/iframe/"], iframe[src*="vixcloud"] {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      border: 0 !important;
      background: #000 !important;
      z-index: 2147483647 !important;
    }`;
  const IS_TOP = window === window.top;

  let active = false;
  let leaveCheck = null;

  const exitCinema = () => chrome.runtime.sendMessage({ type: 'exitCinema' }).catch(() => {});

  function setStyle(on) {
    const root = document.head || document.documentElement;
    if (!root) {
      // A document_start la pagina può non avere ancora elementi: si riprova dopo.
      document.addEventListener('DOMContentLoaded', () => setStyle(active), { once: true });
      return;
    }
    const style = document.getElementById(STYLE_ID);
    if (on && !style) {
      const el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = CSS;
      root.appendChild(el);
    } else if (!on && style) {
      style.remove();
    }
  }

  function apply(on) {
    active = on;
    setStyle(on);

    // Pagina principale: se si lascia la pagina dell'episodio (navigazione interna del
    // sito, senza ricaricare), la modalità termina. Il controllo gira solo a modalità attiva.
    if (!IS_TOP) return;
    clearInterval(leaveCheck);
    leaveCheck = on
      ? setInterval(() => { if (!location.pathname.includes('/watch/')) exitCinema(); }, 1000)
      : null;
  }

  chrome.storage.local.get({ cinema: false }).then((s) => apply(s.cinema));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.cinema) apply(changes.cinema.newValue);
  });

  // Esc chiude la modalità (se il focus è su questa pagina e non sul player) e la guida
  // alle scorciatoie, che sta nel player: il service worker inoltra la richiesta.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (active) exitCinema();
    chrome.runtime.sendMessage({ type: 'kwEscape' }).catch(() => {});
  }, true);

  // Scorciatoie: prima di eseguirle, il service worker chiede a tutti i frame se si sta
  // scrivendo in un campo di testo. Risponde solo il frame che ha il focus su un campo.
  const isEditable = (el) => Boolean(el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
    (el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(el.type))));

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'kwIsEditing' && document.hasFocus() && isEditable(document.activeElement)) {
      sendResponse({ editing: true });
    }
  });

  if (IS_TOP) window.addEventListener('pagehide', () => { if (active) exitCinema(); });
})();
