
import assert from 'node:assert/strict';

import {
    getHumanIntelligence,
    prepareSceneReview
} from './human-intelligence-bridge.mjs';

const data = getHumanIntelligence();

assert.equal(data.productionEnabled, false);
assert.equal(data.rendererControlVerified, false);
assert.ok(data.motionProfiles.length > 0);
assert.equal(
    data.motionReports.length,
    data.motionProfiles.length
);

const scene = {
    action: 'walk, greet friend, continue walking'
};

const review = prepareSceneReview(scene);

assert.equal(review.reviewOnly, true);
assert.equal(review.renderAllowedByAdapter, false);
assert.equal(review.scene.action, scene.action);
assert.equal(review.reviewRequirements.length, 6);

console.log('EIGHT BRIDGE CHECKS: PASS');
