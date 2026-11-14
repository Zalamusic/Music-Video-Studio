/* CutLoopz: the lyrics board expands to show the whole song.
 * Never truncates the text, changes its content, or forces the on-screen keyboard.
 */
(() => {
  'use strict';
  let lyrics;
  const minHeight = 265;
  function refresh() {
    if (!lyrics || !lyrics.getClientRects().length) return;
    // Calculate the full wrapped-text height, even after restoring a saved draft.
    lyrics.style.height = 'auto';
    lyrics.style.height = Math.max(minHeight, Math.ceil(lyrics.scrollHeight) + 5) + 'px';
    lyrics.scrollTop = 0;
  }
  function scheduleRefresh() {
    requestAnimationFrame(refresh);
  }
  function install() {
    lyrics = document.getElementById('lyrics');
    if (!lyrics || lyrics.dataset.cutloopzLyricsExpanded === 'true') return;
    lyrics.dataset.cutloopzLyricsExpanded = 'true';
    lyrics.style.maxHeight = 'none';
    lyrics.style.overflowY = 'hidden';
    lyrics.style.resize = 'vertical';
    lyrics.addEventListener('input', scheduleRefresh);
    lyrics.addEventListener('paste', () => requestAnimationFrame(scheduleRefresh));
    window.addEventListener('resize', scheduleRefresh, {passive:true});
    window.addEventListener('pageshow', scheduleRefresh);
    scheduleRefresh();
  }
  // The 5-page wizard can hide the lyrics while restoring a saved draft.
  // Its showPage() calls refresh again only once Page 1 becomes visible.
  window.CutLoopzLyricsBoard = {refresh: scheduleRefresh};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();
