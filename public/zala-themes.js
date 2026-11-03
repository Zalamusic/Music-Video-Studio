
/*
 * CUTLOOPZ MEDIA
 * Living Atmosphere Theme Controller
 *
 * Morning: 6 AM – 4:59 PM
 * Sunset: 5 PM – 7:59 PM
 * Midnight: 8 PM – 5:59 AM
 *
 * Shared Back-to-Top navigation
 */

(() => {
  'use strict';

  const STORAGE_KEY = 'zala-world-theme';

  const VALID_MODES = [
    'automatic',
    'morning',
    'sunset',
    'midnight',
    'hollywood'
  ];

  const LABELS = {
    morning: 'Morning Glow',
    sunset: 'Sunset Elegance',
    midnight: 'Midnight Luxe',
    hollywood: 'Hollywood Premiere'
  };

  function getSavedMode() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return VALID_MODES.includes(saved)
        ? saved
        : 'hollywood';
    } catch {
      return 'hollywood';
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Theme works without storage.
    }
  }

  function automaticTheme() {
    const hour = new Date().getHours();

    if (hour >= 6 && hour < 17) {
      return 'morning';
    }

    if (hour >= 17 && hour < 20) {
      return 'sunset';
    }

    return 'midnight';
  }

  let currentMode = getSavedMode();

  function applyTheme() {
    const theme = currentMode === 'automatic'
      ? automaticTheme()
      : currentMode;

    document.documentElement.setAttribute(
      'data-zala-theme',
      theme
    );

    if (document.body) {
      document.body.classList.add('zala-themed');
    }

    const selector = document.getElementById(
      'zala-theme-select'
    );

    if (selector && selector.value !== currentMode) {
      selector.value = currentMode;
    }

    const status = document.getElementById(
      'zala-theme-status'
    );

    if (status) {
      status.textContent = currentMode === 'automatic'
        ? 'Automatic · ' + LABELS[theme]
        : LABELS[theme];
    }
  }

  function setMode(mode) {
    if (!VALID_MODES.includes(mode)) {
      return;
    }

    currentMode = mode;
    saveMode(mode);
    applyTheme();
  }

  function createThemeSelector() {
    if (!document.body) return;

    if (document.getElementById('zala-theme-control')) {
      return;
    }

    const control = document.createElement('section');
    control.className = 'zala-theme-control';
    control.id = 'zala-theme-control';

    const label = document.createElement('label');
    label.htmlFor = 'zala-theme-select';
    label.textContent = '🎨 Choose Your Atmosphere';

    const select = document.createElement('select');
    select.id = 'zala-theme-select';

    const choices = [
      ['automatic', 'Automatic · Time of Day'],
      ['morning', 'Morning Glow'],
      ['sunset', 'Sunset Elegance'],
      ['midnight', 'Midnight Luxe'],
      ['hollywood', '🎬 Hollywood Premiere · Black & Gold']
    ];

    for (const [value, title] of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = title;
      select.appendChild(option);
    }

    select.value = currentMode;

    select.addEventListener('change', () => {
      setMode(select.value);
    });

    const status = document.createElement('p');
    status.id = 'zala-theme-status';
    status.style.margin = '10px 0 0';
    status.style.fontSize = '12px';
    status.style.color = 'var(--z-muted)';

    control.append(label, select, status);

    const destination =
      document.querySelector('main') ||
      document.querySelector('.container') ||
      document.body;

    destination.appendChild(control);
  }

  /*
   * CUTLOOPZ BACK-TO-TOP BUTTON
   */

  function createBackToTop() {
    if (!document.body) return;

    if (document.getElementById('cutloopz-back-to-top')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'cutloopz-back-to-top-style';

    style.textContent = `
      #cutloopz-back-to-top {
        position: fixed;
        right: 18px;
        bottom: calc(22px + env(safe-area-inset-bottom, 0px));
        z-index: 10000;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--z-primary, #2469cc);
        color: var(--z-primary-text, #ffffff);
        border: 2px solid var(--z-border, #cddff2);
        box-shadow: 0 6px 22px rgba(0,0,0,.24);
        font-family: Arial, sans-serif;
        font-size: 27px;
        font-weight: 800;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: translateY(12px);
        transition:
          opacity .25s ease,
          transform .25s ease,
          visibility .25s ease,
          background-color .5s ease,
          color .5s ease;
      }

      #cutloopz-back-to-top.is-visible {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateY(0);
      }

      #cutloopz-back-to-top:focus-visible {
        outline: 3px solid var(--z-accent, #c59b53);
        outline-offset: 4px;
      }

      @media (max-width: 600px) {
        #cutloopz-back-to-top {
          width: 46px;
          height: 46px;
          right: 14px;
          bottom: calc(18px + env(safe-area-inset-bottom, 0px));
          font-size: 25px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        #cutloopz-back-to-top {
          transition: none;
        }
      }
    `;

    document.head.appendChild(style);

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'cutloopz-back-to-top';
    button.textContent = '↑';
    button.setAttribute('aria-label', 'Back to top');
    button.setAttribute('title', 'Back to top');

    document.body.appendChild(button);

    function updateVisibility() {
      const scrollTop =
        window.scrollY ||
        document.documentElement.scrollTop ||
        0;

      const scrollableHeight =
        document.documentElement.scrollHeight -
        window.innerHeight;

      const shouldShow =
        scrollTop > 350 &&
        scrollableHeight > 350;

      button.classList.toggle(
        'is-visible',
        shouldShow
      );

      button.tabIndex = shouldShow ? 0 : -1;
    }

    button.addEventListener('click', () => {
      const reducedMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      window.scrollTo({
        top: 0,
        behavior: reducedMotion ? 'auto' : 'smooth'
      });
    });

    window.addEventListener(
      'scroll',
      updateVisibility,
      { passive: true }
    );

    window.addEventListener(
      'resize',
      updateVisibility
    );

    updateVisibility();
  }

  function initialize() {
    createThemeSelector();
    applyTheme();
    createBackToTop();

    window.setInterval(() => {
      if (currentMode === 'automatic') {
        applyTheme();
      }
    }, 60000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        applyTheme();
      }
    });
  }

  applyTheme();

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialize,
      { once: true }
    );
  } else {
    initialize();
  }

  window.ZalaThemes = {
    apply: applyTheme,
    setMode,
    getMode: () => currentMode,
    getActiveTheme: () =>
      document.documentElement.getAttribute(
        'data-zala-theme'
      )
  };
})();
