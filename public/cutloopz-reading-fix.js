
/*
 * CutLoopz Reading Experience v2
 * Larger, softer, more readable typography.
 * Keeps existing themes and storyboard functions.
 */
(() => {
  'use strict';

  const style = document.createElement('style');

  style.textContent = `
    body {
      font-size: 19px !important;
      line-height: 1.75 !important;
      font-weight: 500;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    h1 {
      font-size: clamp(32px, 8vw, 40px) !important;
      line-height: 1.2 !important;
      letter-spacing: -0.5px;
    }

    h2 {
      font-size: 25px !important;
      line-height: 1.35 !important;
    }

    h3 {
      font-size: 21px !important;
      line-height: 1.4 !important;
    }

    p {
      font-size: 19px;
      line-height: 1.75;
      font-weight: 500;
    }

    label {
      font-size: 18px !important;
      line-height: 1.5;
      font-weight: 700;
    }

    input,
    textarea,
    select {
      font-family: "DM Sans", Arial, sans-serif;
      font-size: 18px !important;
      font-weight: 500;
      line-height: 1.65;
      letter-spacing: 0.01em;
    }

    #lyrics {
      font-size: 19px !important;
      font-weight: 500;
      line-height: 1.8;
      min-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      scroll-padding-top: 0;
    }

    button,
    .button-link {
      font-size: 18px !important;
      font-weight: 700;
      line-height: 1.45;
    }

    .small,
    .duration-help,
    .duration-message,
    .note,
    .step-head p,
    .scene p,
    .scene-time,
    .summary-item span,
    .duration-result span,
    .progress-labels,
    .progress-labels span,
    #progressText,
    footer {
      font-size: 16px !important;
      line-height: 1.65;
    }

    .scene-number,
    .summary-item strong {
      font-size: 17px !important;
    }

    .brand {
      font-size: 17px !important;
    }

    .sub {
      font-size: 12px !important;
      letter-spacing: 0.02em;
    }

    .header-link {
      font-size: 15px !important;
    }

    .eyebrow {
      font-size: 14px !important;
    }

    .panel {
      line-height: 1.7;
    }

    .scene {
      line-height: 1.7;
    }

    .scene p {
      font-size: 17px !important;
    }

    .duration-grid input {
      font-size: 22px !important;
    }

    .duration-result strong {
      font-size: 24px !important;
    }

    @media (max-width: 480px) {
      main {
        padding-left: 16px;
        padding-right: 16px;
      }

      .panel {
        padding: 18px;
      }

      .brand {
        font-size: 15px !important;
      }

      .header-link {
        font-size: 14px !important;
      }

      .sub {
        font-size: 10px !important;
      }
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
