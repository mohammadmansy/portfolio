/* ============================================================
   Stack — input layer
   One callback (onAction) for "drop the block" regardless of
   whether the player tapped, clicked or pressed a key. Handles
   the mobile quirks: no double-tap zoom, no scroll while
   playing, and no accidental drops from the on-screen keyboard.
   ============================================================ */

/**
 * @param {HTMLElement} target  element that receives pointer input
 * @param {Function} onAction   fired when the player wants to drop
 * @param {Function} onPause    fired when the player wants to pause
 */
export function createInput(target, onAction, onPause) {
  const ALLOWED_KEY = new Set([' ', 'Enter', 'Spacebar']);
  const BLOCKED_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

  function isBlockedTag() {
    const el = document.activeElement;
    return el ? BLOCKED_TAGS.has(el.tagName) : false;
  }

  /* --- pointer (mouse / touch / pen) --- */
  function onPointerDown(e) {
    // ignore anything but the primary button for mouse input
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    onAction();
  }

  /* --- keyboard --- */
  function onKeyDown(e) {
    if (e.repeat) return; // ignore held keys
    if (isBlockedTag()) return;

    if (ALLOWED_KEY.has(e.key)) {
      e.preventDefault();
      onAction();
    } else if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      onPause();
    }
  }

  /* --- stop the page bouncing / scrolling under the game --- */
  function preventScroll(e) {
    e.preventDefault();
  }

  target.addEventListener('pointerdown', onPointerDown, { passive: false });
  target.addEventListener('touchmove', preventScroll, { passive: false });
  window.addEventListener('keydown', onKeyDown);

  return function dispose() {
    target.removeEventListener('pointerdown', onPointerDown);
    target.removeEventListener('touchmove', preventScroll);
    window.removeEventListener('keydown', onKeyDown);
  };
}
