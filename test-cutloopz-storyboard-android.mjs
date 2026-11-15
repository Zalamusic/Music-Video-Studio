import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = name => readFileSync(new URL(`./public/${name}`, import.meta.url), 'utf8');

test('Opening Android keyboard does not rebuild and blur the scene editor', () => {
  const code = read('my-studio.js');
  assert.doesNotMatch(code, /window\.addEventListener\('resize',\(\)=>\{if\(page===3\)renderScenes\(\)\}/);
  assert.match(code, /function fitSceneTextarea\(input\)/);
  assert.match(code, /input\.addEventListener\('input',\(\)=>\{change\(input\.value\);if\(textarea\)fitSceneTextarea\(input\)/);
  assert.match(read('my-studio.css'), /\.scene-card \.scene-auto-grow \{/);
  assert.match(read('my-studio.css'), /touch-action: pan-y;/);
});

test('Scene lyric cues are present and portable in the full storyboard', () => {
  const code = read('my-studio.js');
  const backup = read('cutloopz-project-backup.js');
  assert.match(code, /lyricExcerpt:s\.lyricExcerpt\|\|''/);
  assert.match(code, /Lyric cue \(approximate\)/);
  assert.match(code, /lyricExcerpt:safeText\(s\.lyricExcerpt\)\.slice\(0,1000\)/);
  assert.match(backup, /lyricExcerpt: text\(s\?\.lyricExcerpt, 1000\)/);
  assert.match(backup, /Lyric cue \(estimated\):/);
});
