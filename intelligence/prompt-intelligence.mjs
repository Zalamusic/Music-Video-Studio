import {prepareSceneReview} from './human-intelligence-bridge.mjs';
// Text guidance only: does not claim pose conditioning or renderer compliance.
export function compileScenePrompt({creativeDirection='',scenePrompts=[],startSeconds=0}={}) {
 const scenes=scenePrompts.filter(s=>Number.isFinite(s.startSeconds)&&s.startSeconds>=0&&typeof s.prompt==='string').sort((a,b)=>a.startSeconds-b.startSeconds);
 const active=scenes.findLast(s=>s.startSeconds<=startSeconds);
 const previous=active?scenes[scenes.indexOf(active)-1]:null;
 const review=prepareSceneReview({action:active?.prompt||creativeDirection});
 const guidance='Maintain identity, wardrobe, anatomy and natural gestures; preserve spatial continuity and believable contact. Separate camera motion from body motion. Do not restart completed actions.';
 const parts=[active?.prompt||creativeDirection,active&&creativeDirection?`Overall direction: ${creativeDirection}`:'',previous?`Prior scene context (do not replay): ${previous.prompt}`:'',`Current song time: ${startSeconds}s. ${guidance}`].filter(Boolean);
 return {prompt:parts.join('\n'),review,rendererControlVerified:false};
}
