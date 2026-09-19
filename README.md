# YouTube Seek Controls

A Chrome extension (Manifest V3) that adds visible **-10 / +10 second**
buttons to the YouTube desktop video player, since YouTube doesn't ship
dedicated clickable skip buttons like some other platforms.

---

## 1. What each file does

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest. Declares the popup, icons, and the content script that runs on `*.youtube.com`. Requests only the `storage` permission — nothing else is needed. |
| `content.js` | The core logic. Injected into every YouTube page. Finds the video player, injects the two buttons, handles clicks, keyboard shortcuts, settings sync, and YouTube's SPA navigation. |
| `content.css` | Styles the injected buttons to match YouTube's native dark player chrome, plus the "-10s / +10s" feedback animation. |
| `popup.html` | The popup UI shown when you click the extension icon: enable/disable toggle, seek-amount dropdown, shortcut reference, about section. |
| `popup.js` | Reads and writes settings to `chrome.storage.sync` when you interact with the popup. |
| `popup.css` | Dark, minimal styling for the popup, visually consistent with the in-player buttons. |
| `icons/` | 16/48/128px extension icons. |

---

## 2. How the extension works

**Finding the player.** `content.js` looks for YouTube's stable player
wrapper (`.html5-video-player`) and the `<video>` element inside it. This
is far more robust than trying to track YouTube's frequently-changing
internal class names for individual controls.

**Injecting the buttons.** The two buttons are inserted directly into
YouTube's own left-hand control bar (`.ytp-left-controls`), right after
the play/pause button — so they look and feel like a native part of the
player instead of a floating overlay. Because they live *inside*
`.html5-video-player`, they keep working correctly in **theater mode**
and **fullscreen** (the Fullscreen API element is that same container,
and anything outside it stops rendering in fullscreen — which is why the
buttons are deliberately placed inside it).

**Seeking.** Clicking a button (or pressing a shortcut) runs:
```js
video.currentTime = Math.max(0, video.currentTime - seekAmount);      // rewind
video.currentTime = Math.min(video.duration, video.currentTime + seekAmount); // forward
```

**Visual feedback.** Each seek briefly shows a centered "-10s" / "+10s"
pill with an icon, matching the currently configured seek amount.

**Settings & sync.** `enabled` and `seekAmount` are stored in
`chrome.storage.sync`, so they follow you across any Chrome instance
you're signed into. The content script listens for `storage.onChanged`
and updates live — no page reload needed after changing a setting in the
popup.

**Handling YouTube's SPA behavior.** YouTube almost never does a full
page reload when you click a new video. `content.js` handles this by:
1. Listening for YouTube's own `yt-navigate-finish` event (fired on
   `document` once a client-side navigation completes) and re-checking
   the player shortly after.
2. A `MutationObserver` on the player container as a fallback, in case
   the control bar gets rebuilt without a full navigation event.
3. A lightweight 1.5s safety-net interval that re-injects the controls
   if they're ever missing and removes them if there's no video (e.g.
   you've navigated to the homepage).

**Duplicate-injection guard.** Before inserting, the script checks for
existing button IDs and always clears out any stray copies first, so
rapid navigation events can't create duplicates.

**Keyboard shortcuts.** `Z` = rewind, `X` = forward. These are ignored
whenever focus is inside an `<input>`, `<textarea>`, or any
`contenteditable` element (e.g. YouTube's search box or comment box), and
whenever a modifier key (Ctrl/Cmd/Alt) is held.

**Scope note (V1):** YouTube Shorts uses a completely different player
DOM and is intentionally **not** supported in this version — the buttons
only appear on standard `/watch` pages, as specified.

---

## 3. Loading the extension into Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top-right corner).
3. Click **Load unpacked**.
4. Select the `youtube-seek-controls` folder (the one containing
   `manifest.json`).
5. The extension should appear in your extensions list and its icon in
   the toolbar.

---

## 4. Testing it

1. Go to any YouTube video, e.g. `https://www.youtube.com/watch?v=...`.
2. You should see two small buttons appear right next to the play/pause
   button in the player controls bar.
3. Click the rewind button — the video should jump back, and a "-10s"
   pill should briefly appear over the video.
4. Click the forward button — same, but "+10s" and jumping forward.
5. Press `Z` / `X` on your keyboard (make sure you're not focused in a
   text box) — should behave the same as clicking.
6. Click into the YouTube search bar or a comment box and press `Z`/`X`
   — nothing should happen (this is expected).
7. Open the popup (click the extension icon):
   - Toggle **Enabled** off — buttons should disappear from the player
     immediately.
   - Toggle it back on, change **Seek amount** to `30` — the button
     labels should update to "-30 / +30" without reloading the page.
8. Click a different video from the sidebar/search results (no full page
   reload) — confirm the buttons are still present and not duplicated.
9. Enter theater mode, then fullscreen — confirm buttons remain visible
   and clickable in both.
10. Navigate to the YouTube homepage — confirm the buttons disappear
    (no video present).

---

## 5. Debugging checklist

If something isn't working:

- **Buttons don't appear at all**
  - Open DevTools Console on the YouTube tab, check for errors from
    `content.js`.
  - Confirm the extension is enabled in `chrome://extensions` and that
    you reloaded the YouTube tab after installing/updating it.
  - Check the popup's **Enabled** toggle is on.

- **Buttons appear but do nothing on click**
  - Check the console for JS errors on click.
  - Verify `video.currentTime` is a valid number by running
    `document.querySelector('video').currentTime` in the console.

- **Duplicate buttons after switching videos**
  - Shouldn't happen (there's an explicit duplicate guard + cleanup on
    every navigation event), but if it does, check whether
    `yt-navigate-finish` fired more than expected and whether
    `removeControls()` is being called — add a `console.log` inside it
    temporarily.

- **Buttons vanish in fullscreen**
  - Confirm they're still children of `.html5-video-player` in the
    Elements panel while in fullscreen — if YouTube ever restructures
    this DOM, the injection point in `content.js` (`getLeftControls()`)
    may need updating.

- **Settings don't persist / don't sync live**
  - Check `chrome://extensions` → the extension's "service worker" /
    background context isn't relevant here (no background script is
    used), but confirm `storage` permission is present in
    `chrome://extensions` → Details → Permissions.
  - Run `chrome.storage.sync.get(null, console.log)` in the console on
    a YouTube tab to inspect current stored values.

- **Shortcuts trigger while typing**
  - Confirm focus is actually inside the field (click into it first);
    the guard checks `document.activeElement` and the event target.

---

## 6. Known limitations (by design, for V1)

- YouTube Shorts is not supported (different player DOM).
- No custom keyboard shortcut remapping yet (fixed to Z/X).
- No per-site (e.g. embedded YouTube players on other domains) support —
  scoped to `youtube.com` only, per the minimal-permissions requirement.
