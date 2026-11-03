
/*
 * CutLoopz Reading Experience
 * Improves readability and lyrics positioning.
 * Does not modify the storyboard engine.
 */
(() => {
  'use strict';

  const style = document.createElement('style');

  style.textContent = `
    body {
      font-weight: 500;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    p, label, input, textarea, select {
      font-weight: 500;
    }

    input, textarea, select {
      line-height: 1.65;
      letter-spacing: 0.01em;
    }

    #lyrics {
      font-weight: 500;
      line-height: 1.75;
      overflow-y: auto;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      scroll-padding-top: 0;
    }
  `;

  document.head.appendChild(style);

  function initializeLyrics() {
    const lyrics = document.getElementById('lyrics');

    if (!lyrics) return;

    function showBeginning() {
      lyrics.scrollTop = 0;
      lyrics.scrollLeft = 0;
    }

    lyrics.addEventListener('paste', () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(showBeginning);
      });
    });

    window.addEventListener('pageshow', () => {
      requestAnimationFrame(showBeginning);
    });

    requestAnimationFrame(showBeginning);
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initializeLyrics,
      { once: true }
    );
  } else {
    initializeLyrics();
  }
})();
