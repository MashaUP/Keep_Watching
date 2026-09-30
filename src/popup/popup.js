(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const toggles = ['autoNext', 'autoPlay'];
  const selects = ['skipCredits', 'stopAfter'];

  function render(s) {
    toggles.forEach((k) => { $(k).checked = s[k]; });
    selects.forEach((k) => { $(k).value = String(s[k]); });
    $('nextOptions').classList.toggle('disabled', !s.autoNext);
    renderStreak(s);
  }

  function renderStreak(s) {
    const active = s.stopAfter > 0 && s.streak > 0 && Date.now() - s.lastAutoAt < KW_STREAK_RESET_MS;
    $('streakBox').hidden = !active;
    if (active) $('streakText').textContent = `Episodi cambiati di fila: ${s.streak} su ${s.stopAfter}`;
  }

  const load = () =>
    chrome.storage.local.get({ ...KW_DEFAULTS, streak: 0, lastAutoAt: 0 }).then(render);

  toggles.forEach((k) => $(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: e.target.checked });
  }));

  selects.forEach((k) => $(k).addEventListener('change', (e) => {
    chrome.storage.local.set({ [k]: Number(e.target.value) });
  }));

  $('resetStreak').addEventListener('click', () => {
    chrome.storage.local.set({ streak: 0, lastAutoAt: 0 });
  });

  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  chrome.storage.onChanged.addListener((_, area) => { if (area === 'local') load(); });
  load();
})();
