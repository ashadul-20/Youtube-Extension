/**
 * YouTube Seek Controls — content.js
 *
 * Injects ±seek buttons into the native YouTube player controls bar,
 * handles keyboard shortcuts, and keeps everything alive across
 * YouTube's single-page-app navigation (video changes without a full
 * page reload).
 *
 * Scope note (V1): Shorts (/shorts/*) use a different player DOM and
 * are intentionally excluded. Only the standard /watch player is supported.
 */

(() => {
  'use strict';

  // ---------------------------------------------------------------------
  // Settings (persisted via chrome.storage.sync, live-updated)
  // ---------------------------------------------------------------------
  const DEFAULT_SETTINGS = { enabled: true, seekAmount: 10 };
  let settings = { ...DEFAULT_SETTINGS };

  function loadSettings(callback) {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      settings = { ...DEFAULT_SETTINGS, ...stored };
      if (callback) callback();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    let relevant = false;
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
      relevant = true;
    }
    if (changes.seekAmount) {
      settings.seekAmount = changes.seekAmount.newValue;
      relevant = true;
    }
    if (relevant) refreshControlsState();
  });

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------
  const REWIND_ID = 'ysc-rewind-btn';
  const FORWARD_ID = 'ysc-forward-btn';
  const FEEDBACK_ID = 'ysc-feedback-overlay';
  const CONTROLS_GROUP_CLASS = 'ysc-controls-group';

  // ---------------------------------------------------------------------
  // Helpers: finding the video + the player chrome
  // ---------------------------------------------------------------------
  function isWatchPage() {
    return location.pathname === '/watch';
  }

  function getPlayerContainer() {
    // .html5-video-player is YouTube's stable player wrapper; it also
    // becomes the Fullscreen API element, so anything appended inside it
    // keeps rendering correctly in fullscreen.
    return document.querySelector('.html5-video-player');
  }

  function getVideo() {
    const player = getPlayerContainer();
    if (!player) return null;
    return player.querySelector('video.html5-main-video') || player.querySelector('video');
  }

  function getLeftControls() {
    const player = getPlayerContainer();
    if (!player) return null;
    return player.querySelector('.ytp-left-controls');
  }

  // ---------------------------------------------------------------------
  // Building the buttons
  // ---------------------------------------------------------------------
  function makeIconSVG(direction) {
    // direction: 'back' | 'forward' — simple circular-arrow glyph, no
    // external assets, inherits currentColor so it matches YT's theme.
    const flip = direction === 'forward' ? ' transform="scale(-1,1) translate(-24,0)"' : '';
    return `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g${flip}>
          <path d="M12 5V1L6.5 6.5L12 12V8C15.31 8 18 10.69 18 14C18 17.31 15.31 20 12 20C8.69 20 6 17.31 6 14H4C4 18.42 7.58 22 12 22C16.42 22 20 18.42 20 14C20 9.58 16.42 6 12 6V5Z" fill="currentColor"/>
        </g>
      </svg>`;
  }

  function createSeekButton(direction) {
    // direction: 'back' | 'forward'
    const btn = document.createElement('button');
    btn.id = direction === 'back' ? REWIND_ID : FORWARD_ID;
    btn.className = `ytp-button ysc-seek-btn ysc-seek-btn--${direction}`;
    btn.type = 'button';
    btn.dataset.tooltipTitle = direction === 'back' ? 'Rewind' : 'Forward';
    btn.setAttribute('aria-label', direction === 'back' ? 'Rewind' : 'Forward');
    btn.innerHTML = `${makeIconSVG(direction)}<span class="ysc-seek-label">${direction === 'back' ? '-' : '+'}${settings.seekAmount}</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      performSeek(direction);
    });
    return btn;
  }

  function updateButtonLabels() {
    const back = document.getElementById(REWIND_ID);
    const fwd = document.getElementById(FORWARD_ID);
    if (back) {
      const label = back.querySelector('.ysc-seek-label');
      if (label) label.textContent = `-${settings.seekAmount}`;
    }
    if (fwd) {
      const label = fwd.querySelector('.ysc-seek-label');
      if (label) label.textContent = `+${settings.seekAmount}`;
    }
  }

  // ---------------------------------------------------------------------
  // Seeking + visual feedback
  // ---------------------------------------------------------------------
  function performSeek(direction) {
    const video = getVideo();
    if (!video) return;
    const amount = settings.seekAmount;
    if (direction === 'back') {
      video.currentTime = Math.max(0, video.currentTime - amount);
    } else {
      const dur = isFinite(video.duration) ? video.duration : video.currentTime + amount;
      video.currentTime = Math.min(dur, video.currentTime + amount);
    }
    showFeedback(direction, amount);
  }

  function showFeedback(direction, amount) {
    const player = getPlayerContainer();
    if (!player) return;

    let overlay = player.querySelector(`#${FEEDBACK_ID}`);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = FEEDBACK_ID;
      player.appendChild(overlay);
    }

    const sign = direction === 'back' ? '-' : '+';
    overlay.innerHTML = `<div class="ysc-feedback-pill ysc-feedback-pill--${direction}">${makeIconSVG(direction)}<span>${sign}${amount}s</span></div>`;

    // Restart the animation even on rapid repeat clicks.
    overlay.classList.remove('ysc-feedback-show');
    // Force reflow so removing/re-adding the class re-triggers the CSS animation.
    void overlay.offsetWidth;
    overlay.classList.add('ysc-feedback-show');
  }

  // ---------------------------------------------------------------------
  // Injection / lifecycle
  // ---------------------------------------------------------------------
  function injectControls() {
    if (!settings.enabled) return;
    if (!isWatchPage()) {
      removeControls();
      return;
    }

    const video = getVideo();
    const leftControls = getLeftControls();
    if (!video || !leftControls) return; // player not ready / no video on this page

    // Prevent duplicate injection.
    if (document.getElementById(REWIND_ID) && document.getElementById(FORWARD_ID)) {
      return;
    }

    // Clean up any stray leftovers before re-inserting (e.g. after YT
    // re-renders its control bar on navigation).
    removeControls();

    const group = document.createElement('span');
    group.className = CONTROLS_GROUP_CLASS;

    const rewindBtn = createSeekButton('back');
    const forwardBtn = createSeekButton('forward');
    group.appendChild(rewindBtn);
    group.appendChild(forwardBtn);

    // Insert right after the play/pause button so it reads naturally
    // left-to-right: [play] [-10] [+10] [volume] ...
    const playButton = leftControls.querySelector('.ytp-play-button');
    if (playButton && playButton.nextSibling) {
      leftControls.insertBefore(group, playButton.nextSibling);
    } else {
      leftControls.appendChild(group);
    }
  }

  function removeControls() {
    document.querySelectorAll(`.${CONTROLS_GROUP_CLASS}`).forEach((el) => el.remove());
    const overlay = document.getElementById(FEEDBACK_ID);
    if (overlay) overlay.remove();
  }

  function refreshControlsState() {
    if (!settings.enabled) {
      removeControls();
      return;
    }
    updateButtonLabels();
    injectControls();
  }

  // Runs on every SPA navigation + periodically as a safety net; cheap
  // no-ops when nothing has changed since injectControls() is idempotent.
  function tick() {
    if (!settings.enabled) {
      removeControls();
      return;
    }
    if (!isWatchPage() || !getVideo()) {
      removeControls();
      return;
    }
    injectControls();
  }

  // ---------------------------------------------------------------------
  // SPA navigation detection
  // ---------------------------------------------------------------------
  // YouTube fires this custom event on `document` once a client-side
  // navigation (new video, search result click, etc.) has finished
  // rendering. It's the most reliable hook available.
  document.addEventListener('yt-navigate-finish', () => {
    removeControls();
    // Player DOM may still be re-rendering for a beat; try a couple of times.
    setTimeout(tick, 50);
    setTimeout(tick, 400);
  });

  // Fallback: observe the player container's subtree for structural
  // changes (covers edge cases yt-navigate-finish might miss, e.g.
  // the control bar being rebuilt without a full navigation event).
  let playerObserver = null;
  function attachPlayerObserver() {
    const player = getPlayerContainer();
    if (!player || playerObserver) return;
    playerObserver = new MutationObserver(() => {
      tick();
    });
    playerObserver.observe(player, { childList: true, subtree: false });
  }

  // Lightweight safety-net interval — cheap since tick() is idempotent
  // and does nothing when controls are already correctly in place.
  setInterval(() => {
    tick();
    attachPlayerObserver();
  }, 1500);

  // ---------------------------------------------------------------------
  // Keyboard shortcuts (Z = rewind, X = forward)
  // ---------------------------------------------------------------------
  function isTypingContext(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return true;
    if (target.isContentEditable) return true;
    return false;
  }

  document.addEventListener('keydown', (e) => {
    if (!settings.enabled) return;
    if (!isWatchPage()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingContext(e.target)) return;
    // Also bail out if focus is inside YouTube's search box or any
    // element flagged as a live-search/typing surface.
    if (document.activeElement && isTypingContext(document.activeElement)) return;

    const key = e.key.toLowerCase();
    if (key === 'z') {
      performSeek('back');
    } else if (key === 'x') {
      performSeek('forward');
    }
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  loadSettings(() => {
    tick();
    attachPlayerObserver();
  });

  document.addEventListener('yt-navigate-start', () => {
    // Player is about to be torn down/rebuilt; drop our observer so it
    // doesn't hold a reference to a stale node.
    if (playerObserver) {
      playerObserver.disconnect();
      playerObserver = null;
    }
  });
})();
