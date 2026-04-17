/* popup.js — LingoFlip Browser Action Popup */

const LANGUAGES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', nl: 'Dutch', pl: 'Polish', sv: 'Swedish', tr: 'Turkish', hi: 'Hindi'
};

let isEnabled = true;
let settings  = {};

document.addEventListener('DOMContentLoaded', async () => {
  settings = await browser.runtime.sendMessage({ type: 'LG_GET_SETTINGS' }) || {};
  settings = Object.assign({ L1: 'en', L2: 'es', enabledSites: {} }, settings);

  document.getElementById('lg-l1').textContent = LANGUAGES[settings.L1] || settings.L1;
  document.getElementById('lg-l2').textContent = LANGUAGES[settings.L2] || settings.L2;

  // Detect if current site is enabled
  const hostname = window.location.hostname;
  let siteEnabled = true;
  if (hostname.includes('youtube')) siteEnabled = settings.enabledSites?.youtube ?? true;
  else if (hostname.includes('netflix')) siteEnabled = settings.enabledSites?.netflix ?? true;

  if (!siteEnabled) {
    document.getElementById('lg-status-dot').className  = 'lg-dot lg-dot-off';
    document.getElementById('lg-status-text').textContent = 'Disabled on this site';
    document.getElementById('lg-btn-toggle').textContent   = '▶ Resume Extension';
    isEnabled = false;
  }

  // Send message to content script
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    browser.tabs.sendMessage(tab.id, { type: 'LG_GET_STATUS' }).catch(() => {});
  }

  // Vocabulary button
  document.getElementById('lg-btn-vocab').addEventListener('click', async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) browser.tabs.sendMessage(tab.id, { type: 'LG_TOGGLE_VOCAB' });
    window.close();
  });

  // Settings button
  document.getElementById('lg-btn-settings').addEventListener('click', async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) browser.tabs.sendMessage(tab.id, { type: 'LG_OPEN_SETTINGS' });
    window.close();
  });

  // Toggle button
  document.getElementById('lg-btn-toggle').addEventListener('click', async () => {
    isEnabled = !isEnabled;
    const dot  = document.getElementById('lg-status-dot');
    const text = document.getElementById('lg-status-text');
    const btn  = document.getElementById('lg-btn-toggle');

    if (isEnabled) {
      dot.className = 'lg-dot lg-dot-on';
      text.textContent = 'Active on this page';
      btn.textContent  = '⏸ Pause Extension';
    } else {
      dot.className = 'lg-dot lg-dot-off';
      text.textContent = 'Paused on this page';
      btn.textContent  = '▶ Resume Extension';
    }

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab) browser.tabs.sendMessage(tab.id, { type: 'LG_SET_ENABLED', enabled: isEnabled });
  });
});
