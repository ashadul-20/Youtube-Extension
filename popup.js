// YouTube Seek Controls — popup.js
// Reads/writes settings via chrome.storage.sync so the content script
// (running on any open YouTube tab) picks up changes live via
// chrome.storage.onChanged.

const DEFAULT_SETTINGS = { enabled: true, seekAmount: 10 };

const enabledToggle = document.getElementById('enabledToggle');
const seekAmountSelect = document.getElementById('seekAmountSelect');

function loadUI() {
  chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
    enabledToggle.checked = settings.enabled;
    seekAmountSelect.value = String(settings.seekAmount);
  });
}

enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

seekAmountSelect.addEventListener('change', () => {
  chrome.storage.sync.set({ seekAmount: parseInt(seekAmountSelect.value, 10) });
});

document.addEventListener('DOMContentLoaded', loadUI);
