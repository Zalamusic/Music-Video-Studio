
/**
 * CutLoopz Production Director — Free Test
 * Run with: node test-production-director.js
 *
 * No FAL calls. No paid video generation.
 */

import assert from 'node:assert/strict';

import {
  createProductionPlan,
  getProductionScenePrompt
} from './cutloopz-production-director.js';

function runTest() {
  console.log('\nCUTLOOPZ PRODUCTION DIRECTOR TEST\n');

  const plan = createProductionPlan({
    title: 'Cinematic Test Song',
    songSeconds: 45,
    customerPrompt:
      'An emotional R&B story in one elegant apartment. ' +
      'Keep the same woman throughout. No concert stages, ' +
      'rooftops, or unrelated locations.',
    lyrics:
      'I remember when you held me close\n' +
      'Now I am standing here alone\n' +
      'I finally found the strength to go',
    format: 'landscape',
    hasReferencePhoto: true,
    shotSeconds: 15,
    maxVideoBudgetUSD: 20
  });

  assert.equal(plan.mode, 'planning-only');
  assert.equal(plan.songSeconds, 45);
  assert.equal(plan.format, 'landscape');

  assert.ok(plan.storyPlan);
  assert.ok(plan.manifest);
  assert.equal(plan.manifest.totalShots, 3);
  assert.equal(plan.manifest.shots.length, 3);

  for (let i = 1; i <= 3; i++) {
    const shot = plan.manifest.shots[i - 1];
    const prompt = getProductionScenePrompt(plan, i);

    assert.equal(shot.number, i);
    assert.equal(shot.startSeconds, (i - 1) * 15);
    assert.equal(shot.endSeconds, i * 15);
    assert.ok(prompt.length > 20);
    assert.equal(
      shot.originalIdentityReferenceRequired,
      true
    );

    console.log(`SCENE ${i}`);
    console.log(`Time: ${shot.startSeconds}-${shot.endSeconds}s`);
    console.log(`Prompt: ${prompt}\n`);
  }

  assert.throws(
    () => getProductionScenePrompt(plan, 4),
    RangeError
  );

  assert.throws(
    () => createProductionPlan({
      songSeconds: 400,
      customerPrompt: 'Test'
    }),
    RangeError
  );

  console.log('PASS: Scene timing');
  console.log('PASS: Storyboard generation');
  console.log('PASS: Character-reference requirement');
  console.log('PASS: Invalid scene protection');
  console.log('PASS: Maximum song duration');
  console.log('\nALL TEST ASSERTIONS PASSED');
  console.log(
    'NOTE: Budget estimates and creative quality ' +
    'require separate validation.'
  );
}

try {
  runTest();
} catch (error) {
  console.error('\nTEST FAILED:', error);
  process.exitCode = 1;
}
