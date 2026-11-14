/* CutLoopz Studio portable creative-work backup, v1.
 * No account secrets, audio bytes, images, tokens or third-party requests.
 * Works offline in the browser; also testable in Node without a DOM.
 */
(function (root) {
  'use strict';
  const FORMAT = 'cutloopz-studio-project';
  const VERSION = 1;
  const MAX_IMPORT_BYTES = 1024 * 1024;
  const text = (value, length) => String(value == null ? '' : value).slice(0, length);
  const integer = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  };
  const number = (value, fallback, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const safeName = (title) => text(title, 70).normalize('NFKD')
    .replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'my-cutloopz-video';
  function safeDraft(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('The backup has no valid Studio project.');
    const scenes = Array.isArray(input.scenes) ? input.scenes : [];
    if (scenes.length > 40) throw Error('The backup contains more than 40 scenes.');
    return {
      source: input.source === 'link' ? 'link' : 'upload',
      songLink: text(input.songLink, 2048),
      title: text(input.title, 120),
      lyrics: text(input.lyrics, 12000),
      songSeconds: integer(input.songSeconds, 30, 15, 360),
      sceneSeconds: integer(input.sceneSeconds, 15, 10, 30),
      style: text(input.style, 80),
      format: input.format === 'landscape' ? 'landscape' : 'vertical',
      direction: text(input.direction, 4000),
      characterNotes: text(input.characterNotes, 1000),
      songName: text(input.songName, 180),
      photoName: text(input.photoName, 180),
      page: integer(input.page, 0, 0, 4),
      scenePage: integer(input.scenePage, 0, 0, 40),
      // Raw previews and signatures aren't imported: the new browser cannot
      // prove that uploaded media matches the original audio and photo.
      scenes: scenes.map((s, i) => ({
        number: i + 1,
        startSeconds: number(s?.startSeconds, i * 15, 0, 360),
        endSeconds: number(s?.endSeconds, (i + 1) * 15, 0, 360),
        emotion: text(s?.emotion, 55),
        location: text(s?.location, 500),
        action: text(s?.action, 800),
        prompt: text(s?.prompt, 4000)
      }))
    };
  }
  function createBackup(draft) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      mediaIncluded: false,
      reminder: 'This backup contains creative planning only. Reattach your own MP3/WAV and artist photo for production. Your account login and GPU configuration are not included.',
      draft: safeDraft(draft)
    };
  }
  function parseBackup(raw) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_IMPORT_BYTES)
      throw Error('Choose a CutLoopz backup smaller than 1 MB.');
    let content;
    try { content = JSON.parse(raw); } catch { throw Error('The selected file is not valid JSON.'); }
    if (!content || content.format !== FORMAT || content.version !== VERSION)
      throw Error('Choose a CutLoopz Studio project backup (version 1).');
    return safeDraft(content.draft);
  }
  function storyboardText(draft) {
    const d = safeDraft(draft);
    const lines = [
      'CUTLOOPZ MEDIA · LISTENING DIRECTOR STORYBOARD',
      'Your Music. Your Vision. Your Video.',
      '',
      `Song: ${d.title || 'Untitled Song'}`,
      `Video duration: ${d.songSeconds} seconds`,
      `Music source: ${d.source === 'link' ? d.songLink || 'Song link' : d.songName || 'MP3/WAV not selected'}`,
      `Cinematic style: ${d.style || 'Cinematic Realism'}`,
      `Format: ${d.format === 'landscape' ? '16:9 Widescreen' : '9:16 Vertical'}`,
      `Scene duration: ${d.sceneSeconds} seconds`,
      '', 'ARTIST APPEARANCE & CONTINUITY', d.characterNotes || 'Not specified',
      '', 'CREATIVE DIRECTION', d.direction || 'Not specified',
      '', 'LYRICS', d.lyrics || 'Not provided',
      '', `STORYBOARD · ${d.scenes.length} SCENE${d.scenes.length === 1 ? '' : 'S'}`
    ];
    for (const s of d.scenes) {
      lines.push('', `SCENE ${s.number} · ${s.startSeconds}s–${s.endSeconds}s`,
        `Emotion: ${s.emotion || 'Director choice'}`,
        `Location: ${s.location || 'Not specified'}`,
        `Action: ${s.action || 'Not specified'}`,
        `Director prompt: ${s.prompt || 'Not specified'}`);
    }
    lines.push('', 'Creative planning document only; not a rendered video.', '');
    return lines.join('\n');
  }
  root.CutLoopzProjectBackup = Object.freeze({safeName, safeDraft, createBackup, parseBackup, storyboardText, FORMAT, VERSION, MAX_IMPORT_BYTES});
})(typeof window !== 'undefined' ? window : globalThis);
