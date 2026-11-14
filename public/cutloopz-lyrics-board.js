/* CutLoopz: compact, scrollable lyrics editor.
 * On paste/restore/show-page, show the first line of the song.
 * During normal typing, allow the caret and scroll position to follow the artist.
 * Never truncate, rewrite, or save the lyrics from this view helper.
 */
(() => {
  'use strict';
  let lyrics;
  function resetToTop() {
    if (!lyrics) return;
    lyrics.scrollTop = 0;
  }
  function afterPaste() {
    // On Android the browser may adjust the caret/scroll after the paste event.
    // Reset after that default insertion without moving the caret itself.
    requestAnimationFrame(resetToTop);
    setTimeout(resetToTop, 70);
  }
  function install() {
    lyrics = document.getElementById('lyrics');
    if (!lyrics || lyrics.dataset.cutloopzLyricsCompact === 'true') return;
    lyrics.dataset.cutloopzLyricsCompact = 'true';
    lyrics.style.removeProperty('height');
    lyrics.style.removeProperty('max-height');
    lyrics.style.removeProperty('overflow-y');
    lyrics.addEventListener('paste', afterPaste);
    window.addEventListener('pageshow', resetToTop);
    requestAnimationFrame(resetToTop);
  }
  window.CutLoopzLyricsBoard = {refresh: () => requestAnimationFrame(resetToTop)};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true});
  else install();
})();
