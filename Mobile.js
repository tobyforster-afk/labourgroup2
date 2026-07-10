/*************************************************************
 *
 * MOBILE SCALE / IOS FIXES
 *
 *************************************************************/

function forceNoInputZoom() {
  const viewport = document.querySelector('meta[name="viewport"]');

  if (viewport) {
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover'
    );
  }

  document
    .querySelectorAll('input, textarea, select, [contenteditable="true"]')
    .forEach(function(field) {
      field.style.fontSize = '18px';
      field.style.lineHeight = '1.35';
      field.style.webkitTextSizeAdjust = '100%';
      field.style.transform = 'none';
    });
}

document.addEventListener('DOMContentLoaded', forceNoInputZoom);
window.addEventListener('load', forceNoInputZoom);

document.addEventListener('focusin', function(e) {
  if (
    e.target.matches &&
    e.target.matches('input, textarea, select, [contenteditable="true"]')
  ) {
    forceNoInputZoom();
  }
});

new MutationObserver(forceNoInputZoom).observe(document.documentElement, {
  childList: true,
  subtree: true
});

document.addEventListener('gesturestart', function(e) {
  e.preventDefault();
});

document.addEventListener('gesturechange', function(e) {
  e.preventDefault();
});

document.addEventListener('gestureend', function(e) {
  e.preventDefault();
});

let labourGroupLastTouchEnd = 0;

document.addEventListener('touchend', function(e) {
  const now = Date.now();

  if (now - labourGroupLastTouchEnd <= 300) {
    e.preventDefault();
  }

  labourGroupLastTouchEnd = now;
}, { passive: false });
