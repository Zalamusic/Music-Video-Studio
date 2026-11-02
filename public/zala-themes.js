
/*
 * ZALA QI'S WORLD
 * Living Atmosphere Theme Controller
 *
 * Automatic:
 * Morning:  6:00 AM – 4:59 PM
 * Sunset:   5:00 PM – 7:59 PM
 * Midnight: 8:00 PM – 5:59 AM
 *
 * Optional Hollywood Premiere theme.
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
        : 'automatic';
    } catch {
      return 'automatic';
    }
  }

  function saveMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Theme still works if storage is unavailable.
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
    if (!document.body) {
      return;
    }

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

  function initialize() {
    createThemeSelector();
    applyTheme();

    // Check for a time-of-day change once per minute.
    window.setInterval(() => {
      if (currentMode === 'automatic') {
        applyTheme();
      }
    }, 60000);

    // Refresh when a customer returns to the page.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        applyTheme();
      }
    });
  }

  // Set the theme early to reduce visible color flashes.
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
