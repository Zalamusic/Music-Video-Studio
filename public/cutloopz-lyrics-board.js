/* CutLoopz Studio — Android-safe compact lyrics editor.
 * Keep the first lyric visible after paste, draft restore and page return.
 * Never expand the box or interfere with ordinary typing and scrolling.
 */
(() => {
  'use strict';
  let lyrics;
  let pasteSequence = 0;
  let resetSequence = 0;

  // Clipboard sources sometimes add empty lines before the first lyric.
  // Remove only leading empty lines, never words, timestamps or verse spacing.
  function removeLeadingEmptyLines() {
    if (!lyrics || !lyrics.value) return false;
    const cleaned = lyrics.value.replace(/^(?:[\t ]*(?:\r\n|\n|\r))+/, '');
    if (cleaned === lyrics.value) return false;
    lyrics.value = cleaned;
    lyrics.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  function top({ tidy = false } = {}) {
    if (!lyrics) return;
    if (tidy) removeLeadingEmptyLines();
    // Android may scroll a textarea back to its remembered cursor even after
    // scrollTop=0. Move the *unfocused/restored* cursor to the start as well.
    // Only paste/restore/page return invokes this; typing remains unaffected.
    try { lyrics.setSelectionRange(0, 0); } catch (_) { /* Some browsers restrict selection temporarily. */ }
    lyrics.scrollTop = 0;
  }

  function revealStart({ tidy = false } = {}) {
    if (!lyrics) return;
    const sequence = ++resetSequence;
    top({ tidy });
    requestAnimationFrame(() => {
      if (sequence === resetSequence) top();
    });
    setTimeout(() => {
      if (sequence === resetSequence && document.activeElement !== lyrics) top();
    }, 90);
  }

  function afterPaste() {
    const sequence = ++pasteSequence;
    // The browser inserts clipboard text *after* the paste event.
    // Return to the beginning once that insertion has completed.
    const finish = () => {
      if (sequence !== pasteSequence) return;
      top({ tidy: true });
    };
    setTimeout(finish, 0);
    requestAnimationFrame(finish);
    setTimeout(finish, 90);
  }

  function install() {
    lyrics = document.getElementById('lyrics');
    if (!lyrics || lyrics.dataset.cutloopzLyricsTopFixed === 'true') return;
    lyrics.dataset.cutloopzLyricsTopFixed = 'true';
    lyrics.addEventListener('paste', afterPaste);
    lyrics.addEventListener('input', event => {
      // A normal keystroke must cancel any delayed paste repositioning.
      if (event.inputType && event.inputType !== 'insertFromPaste' && event.inputType !== 'insertFromDrop') {
        ++pasteSequence;
      }
    });
    lyrics.addEventListener('blur', () => revealStart({ tidy: true }));
    lyrics.addEventListener('change', () => {
      if (document.activeElement !== lyrics) revealStart({ tidy: true });
    });
    window.addEventListener('pageshow', () => revealStart({ tidy: true }));
    // Wizard transitions toggle [hidden] without replacing the field.
    const page = lyrics.closest('.wizard-step');
    if (page) new MutationObserver(() => {
      if (!page.hidden && document.activeElement !== lyrics) revealStart({ tidy: true });
    }).observe(page, { attributes: true, attributeFilter: ['hidden'] });
    revealStart({ tidy: true });
  }

  window.CutLoopzLyricsBoard = {
    refresh: () => {
      if (!lyrics) install();
      if (lyrics && document.activeElement !== lyrics) revealStart({ tidy: true });
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();
