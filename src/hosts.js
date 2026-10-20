/**
 * Keep_Watching — indirizzi del player supportati.
 *
 * Unico punto da aggiornare quando il sito sposta il player su un altro dominio
 * (successo con vixcloud.co → vixcloud.cc nell'ottobre 2026). Insieme a questo elenco
 * vanno aggiornati, perché il browser li vuole scritti per esteso:
 *   - manifest.json → content_scripts[0].matches (dove gira player.js);
 *   - rules.json → requestDomains delle due regole.
 * Vedi docs/MANUTENZIONE.md, "Il player cambia dominio".
 */
const KW_PLAYER_HOSTS = ['vixcloud.co', 'vixcloud.cc'];

/** Host di un indirizzo (anche relativo o senza protocollo), '' se non leggibile. */
function kwHostOf(url, base) {
  try {
    const b = base || (typeof location !== 'undefined' ? location.href : 'https://x.invalid/');
    const u = new URL(String(url || ''), b);
    return /^https?:$/.test(u.protocol) ? u.hostname.toLowerCase() : '';
  } catch (e) {
    return '';
  }
}

const kwHostMatches = (host, list) => list.some((h) => host === h || host.endsWith(`.${h}`));

/** Indirizzo del player supportato (host esatto o suo sottodominio, mai una parola nell'URL). */
function kwIsPlayerUrl(url, base) {
  const host = kwHostOf(url, base);
  return Boolean(host) && kwHostMatches(host, KW_PLAYER_HOSTS);
}

/**
 * Sembra il player ma su un dominio non ancora supportato (per esempio vixcloud.xyz):
 * serve solo alla diagnosi, non viene mai toccato.
 */
function kwLooksLikeOtherPlayer(url, base) {
  const host = kwHostOf(url, base);
  return Boolean(host) && /(^|\.)vixcloud\.[a-z]+$/.test(host) && !kwHostMatches(host, KW_PLAYER_HOSTS);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { KW_PLAYER_HOSTS, kwHostOf, kwIsPlayerUrl, kwLooksLikeOtherPlayer };
}
