/**
 * CutLoopz Media — Story Intelligence v5.2: Emotional Director
 *
 * Drop-in replacement for cutloopz-story-intelligence.js.
 * Existing server API: createStoryIntelligencePlan({
 * title, lyrics, songSeconds, musicPlan, prompt, format,
 * sceneSeconds, visualStyle
 * })
 *
 * No external APIs, no paid video generation, no file writes.
 * Intent: combine lyric meaning, audio-derived energy and customer
 * direction into coherent, editable music-video storyboards.
 * This is interpretable, rule-based analysis; it is NOT an LLM or
 * automatic speech/lyric transcription system.
 */
const MAX_SECONDS = 360;
const MAX_LYRICS = 12000;
const MAX_SCENES = 100;
const round = n => Math.round(n * 100) / 100;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const clean = (v, limit = 1000) => String(v ?? '').trim().slice(0, limit);
const normalize = s => clean(s, 35000).toLowerCase()
 .replace(/[’‘]/g, "'")
 .replace(/[^\p{L}\p{N}\s']/gu, ' ')
 .replace(/\s+/g, ' ').trim();
const contains = (text, term) => (` ${normalize(text)} `).includes(` ${normalize(term)} `);
// Phrases are deliberately more specific than individual sentiment words.
// Wider labels remain distinguishable (love ≠ happiness, pain ≠ aggression).
const EMOTIONS = {
 reassurance: [
 ['reassurance', 5], ['reassure', 5], ['safe', 7], ['feel safe', 5],
 ['safety', 4], ['security', 4], ['comfort', 4], ['comforting', 4],
 ['support', 4], ['supportive', 4], ['protected', 4],
 ['you can count on me', 7], ['here for you', 6],
 ['stand by you', 6], ['trust me', 5], ['stay together', 4],
 ['always there', 4], ['not alone', 6], ['stay', 3], ['remain', 3],
 ['still here', 4], ['rely on me', 5],
 ['shelter', 3], ['peace of mind', 5], ['depend on me', 5]
 ],
 vulnerability: [
 ['vulnerability', 6], ['vulnerable', 6], ['fragile', 4],
 ['exposed', 3], ['insecure', 4], ['afraid', 4], ['scared', 4],
 ['fear', 3], ['cry', 3], ['tears', 4], ['hurt', 4],
 ['broken', 4], ['pain', 4], ['uncertain', 3],
 ['anxious', 4], ['weak', 3], ['hide my feelings', 5],
 ['struggling', 4], ['falling apart', 6]
 ],
 heartbreak: [
 ['heartbreak', 7], ['broken heart', 7], ['goodbye', 4],
 ['breakup', 7], ['separation', 5], ['rejected', 5],
 ['lost love', 6], ['unrequited', 6], ['betrayed', 6],
 ['cheated on', 7], ['love is over', 6], ['ended our love', 7]
 ],
 romance: [
 ['romance', 6], ['romantic', 5], ['in love', 5],
 ['fall in love', 6], ['falling in love', 6], ['love you', 4],
 ['affection', 5], ['lover', 4], ['sweetheart', 4],
 ['kiss', 4], ['adore', 5], ['passion', 4],
 ['devotion', 4], ['tenderness', 4], ['intimate', 3]
 ],
 grief: [
 ['grief', 7], ['mourning', 7], ['bereavement', 7],
 ['passed away', 7], ['funeral', 7], ['death', 5],
 ['memorial', 5], ['remembrance', 5], ['in loving memory', 6]
 ],
 longing: [ ['longing', 6], ['yearning', 6], ['homesick', 6],
 ['homesickness', 6], ['miss you', 5], ['missing you', 5],
 ['distance', 3], ['far away', 3], ['separated', 4],
 ['waiting for you', 4], ['wish you were here', 5]
 ],
 hope: [
 ['hope', 5], ['hopeful', 5], ['optimism', 5],
 ['healing', 5], ['new beginning', 6], ['new start', 5],
 ['brighter future', 5], ['better days', 5],
 ['rise again', 5], ['recover', 4], ['renewal', 5],
 ['possibility', 4], ['persevere', 4], ['forgive', 4]
 ],
 reflection: [
 ['remember', 4], ['memories', 4], ['looking back', 5],
 ['regret', 5], ['reminisce', 5], ['the past', 3],
 ['yesterday', 3], ['nostalgia', 5], ['reflection', 5],
 ['questioning myself', 5]
 ],
 confidence: [
 ['confidence', 6], ['confident', 6], ['self respect', 6],
 ['self assured', 5], ['proud', 5], ['pride', 4],
 ['independent', 5], ['independence', 5], ['self worth', 5],
 ['ambitious', 4], ['empowered', 5], ['unstoppable', 5],
 ['bragging', 5], ['swagger', 5], ['boast', 5],
 ['accomplished', 4], ['self esteem', 5]
 ],
 luxury: [
 ['luxury', 6], ['designer', 5], ['diamonds', 5],
 ['jewelry', 4], ['wealthy', 6], ['rich', 3],
 ['money', 3], ['mansion', 5], ['penthouse', 5],
 ['expensive', 4], ['vip', 4], ['fashion', 3],
 ['shopping', 3], ['private jet', 7], ['sports car', 5],
 ['lavish', 5], ['opulent', 5]
 ],
 celebration: [
 ['party', 5], ['celebrate', 6], ['celebration', 6],
 ['dancing', 4], ['dance', 3], ['joyful', 4],
 ['club', 3], ['winning', 5], ['festival', 5],
 ['have fun', 4], ['excited', 4], ['victory', 5],
 ['cheering', 4], ['festive', 4]
 ],
 conflict: [
 ['conflict', 5], ['revenge', 7], ['betrayal', 5],
 ['fight', 4], ['enemy', 5], ['argument', 5],
 ['furious', 6], ['war', 4], ['angry', 5],
 ['cheating', 4], ['injustice', 5], ['resentment', 5],
 ['confrontation', 5]
 ]
};
// A second layer interprets more specific human feelings. These are
// weighted cues, not psychological diagnoses or universal emotion rules.
// The artist's instructions and lyric context always outrank these hints.
// Each fine-grained feeling contributes to a cinematic theme that the
// existing Director already knows how to stage.
const NUANCE_LEXICON = {
 joy: {theme:'celebration', cues:['joy','happy','happiness','delight','bliss','euphoria','elated','pleasure','ecstasy']},
 serenity: {theme:'reassurance', cues:['peace','serenity','calm','contentment','satisfied','tranquil','equanimity','at ease']},
 gratitude: {theme:'hope', cues:['grateful','gratitude','thankful','appreciate you','blessed','thank you for']},
 tenderness: {theme:'romance', cues:['tender','tenderness','affection','adoration','fondness','warmth','gentle touch']},
 compassion: {theme:'reassurance', cues:['compassion','empathy','sympathy','mercy','kindness','care about you','concern for']},
 trust: {theme:'reassurance', cues:['trust','faith in you','loyalty','believe in you','rely on you','i feel safe']},
 belonging: {theme:'reassurance', cues:['belong','belonging','connection','connected to you','you are my home','you are not alone','by my side']},
 relief: {theme:'reassurance', cues:['relief','relieved','breathing again','burden lifted','safe again','finally at ease']},
 optimism: {theme:'hope', cues:['optimism','optimistic','hopeful','healing','brighter tomorrow','new beginning','better days']},
 pride: {theme:'confidence', cues:['pride','proud','self respect','dignity','made it','earned this','head held high']},
 arrogance: {theme:'confidence', cues:['arrogant','arrogance','vanity','cocky','better than you','show off','boastful','self important']},
 amusement: {theme:'celebration', cues:['laughing','laughter','playful','silly','joking','teasing','amused']},
 excitement: {theme:'celebration', cues:['excited','excitement','thrill','enthusiasm','hyped','eager','pumped']}, triumph: {theme:'celebration', cues:['triumph','victory','won','champion','accomplishment','achievement','overcame']},
 curiosity: {theme:'reflection', cues:['curious','curiosity','intrigued','fascinated','i wonder why','discover','question everything']},
 determination: {theme:'confidence', cues:['determined','resolve','grit','never give up','keep going','unstoppable','brave','courage']},
 forgiveness: {theme:'hope', cues:['forgive','forgiveness','forgiven','acceptance','let it go','make peace','reconcile']},
 desire: {theme:'romance', cues:['desire','craving','passion','lust','infatuation','want you','long for your touch']},
 awe: {theme:'reflection', cues:['awe','wonder','amazed','astonished','sublime','beautiful beyond words','transcendence','reverence']},
 nostalgia: {theme:'reflection', cues:['nostalgia','nostalgic','wistful','remember when','the old days','memories','used to be','homesick']},
 sadness: {theme:'vulnerability', cues:['sad','sadness','sorrow','melancholy','gloom','dejected','despondent','downhearted','crying']},
 grief: {theme:'grief', cues:['grief','mourning','bereavement','funeral','passed away','rest in peace','loss of you']},
 despair: {theme:'heartbreak', cues:['despair','hopeless','hopelessness','emptiness','nothing left','helpless','defeated','worthless']},
 loneliness: {theme:'longing', cues:['lonely','loneliness','isolation','abandoned','alone again','left behind','disconnected','alienated']},
 rejection: {theme:'heartbreak', cues:['rejected','rejection','excluded','unwanted','you left me','you shut me out']},
 shame: {theme:'vulnerability', cues:['ashamed','shame','embarrassed','humiliated','inadequate','inferior','self conscious','disgrace']},
 guilt: {theme:'reflection', cues:['guilt','guilty','regret','remorse','repentance','i was wrong','i am sorry','my fault']},
 fear: {theme:'vulnerability', cues:['fear','afraid','anxiety','anxious','dread','panic','nervous','terrified','apprehension','worried']},
 insecurity: {theme:'vulnerability', cues:['insecurity','insecure','uncertain','doubt','fragile','fragility','exposed','vulnerable']},
 anger: {theme:'conflict', cues:['anger','angry','rage','furious','fury','irritated','frustrated','indignant','outraged','resentment']},
 bitterness: {theme:'conflict', cues:['bitterness','bitter','hostile','hatred','loathing','contempt','scorn','disdain','spite']},
 betrayal: {theme:'heartbreak', cues:['betrayed','betrayal','cheated on','lied to me','broken trust','deceived','distrust','suspicious']},
 jealousy: {theme:'conflict', cues:['jealous','jealousy','envy','envious','rivalry','i envy','covet']},
 disgust: {theme:'conflict', cues:['disgust','revulsion','repulsed','revolted','distaste','makes me sick','disapproval']},
 stress: {theme:'vulnerability', cues:['stressed','stress','overwhelmed','burnout','exhausted','exhaustion','drained','restless']},
 confusion: {theme:'reflection', cues:['confused','confusion','uncertain','ambivalence','mixed feelings','torn between','not sure why']},
 boredom: {theme:'reflection', cues:['bored','boredom','apathy','indifferent','indifference','ennui','numb']},
 longing: {theme:'longing', cues:['yearning','longing','miss you','miss home','wish you were here','come back','saudade']},
 surprise: {theme:'reflection', cues:['surprise','surprised','astonished','shocked','did not expect','never imagined']},
 moralOutrage: {theme:'conflict', cues:['injustice','unfair','moral outrage','wrongdoing','indignation','disrespect']},
 selfCompassion: {theme:'hope', cues:['self compassion','i accept myself','love myself','worthy of love','healing myself']}
};
const BLENDED_CUES = [
 {name:'bittersweetness', cues:['bittersweet','happy and sad','smile through the tears'], themes:['hope','vulnerability']},
 {name:'nervous excitement', cues:['nervous excitement','excited but scared','scared and excited'], themes:['celebration','vulnerability']},
 {name:'relieved sadness', cues:['relieved but sad','sad but relieved','relieved sadness'], themes:['reassurance','vulnerability']},
 {name:'angry hurt', cues:['angry and hurt','hurt and angry','angry hurt'], themes:['conflict','vulnerability']},
 {name:'jealous admiration', cues:['jealous admiration','admire and envy'], themes:['confidence','conflict']},
 {name:'guilty pleasure', cues:['guilty pleasure','feel guilty but love'], themes:['reflection','romance']},
 {name:'loving frustration', cues:['loving frustration','love and frustration','love you but i am frustrated','love you but you frustrate me'], themes:['romance','conflict']},
 {name:'hopeful anxiety', cues:['hopeful anxiety','hopeful but afraid','hope and fear','hopeful but anxious'], themes:['hope','vulnerability']},
 {name:'nostalgic joy', cues:['nostalgic joy','happy memories','joyful memories'], themes:['reflection','celebration']},
 {name:'compassionate anger', cues:['compassionate anger','angry on your behalf'], themes:['reassurance','conflict']}
];
function nuanceScores(text, concept = '', conceptWeight = 0.35) {
 const scores = {};
 for (const [feeling, descriptor] of Object.entries(NUANCE_LEXICON)) {
 let score = 0;
 for (const phrase of descriptor.cues) {
 if (contains(text, phrase)) score += phrase.includes(' ') ? 3 : 2;
 if (concept && contains(concept, phrase)) score += (phrase.includes(' ') ? 3 : 2) * conceptWeight;
 }
 if (score > 0) scores[feeling] = round(score);
 }
 return scores;
}
function nuanceRanking(scores) {
 return Object.entries(scores).sort((a,b) => b[1] - a[1]);
}
function blendedEmotion(text, nuance = {}) {
 for (const entry of BLENDED_CUES) {
 if (entry.cues.some(cue => contains(text, cue))) return entry.name;
 }
 const ranked = nuanceRanking(nuance).filter(([,value]) => value >= 3.5);
 if (ranked.length < 2) return null;
 const [first,second] = ranked;
 const a = NUANCE_LEXICON[first[0]]?.theme;
 const b = NUANCE_LEXICON[second[0]]?.theme;
 if (a === b || second[1] < first[1] * 0.65) return null;
 return `${first[0]} + ${second[0]}`;
} const INTIMATE = new Set([
 'reassurance', 'vulnerability', 'heartbreak', 'romance',
 'grief', 'longing', 'hope', 'reflection'
]);
const EXPRESSIVE = new Set(['confidence', 'luxury', 'celebration', 'conflict']);
const LOCATION_CUES = [
 ['private jet', 'private jet cabin'], ['runway', 'airport runway'],
 ['penthouse', 'luxury penthouse'], ['mansion', 'mansion residence'],
 ['boutique', 'upscale boutique'], ['shopping district', 'shopping district'],
 ['nightclub', 'nightclub'], ['vip club', 'exclusive lounge'],
 ['rooftop', 'rooftop'], ['sports car', 'luxury car exterior'],
 ['hotel', 'hotel interior'], ['restaurant', 'restaurant'],
 ['beach', 'beach'], ['ocean', 'oceanfront'],
 ['airport', 'airport'], ['recording studio', 'recording studio'],
 ['studio', 'studio'], ['bedroom', 'bedroom'], ['kitchen', 'kitchen'],
 ['living room', 'living room'], ['hallway', 'hallway'],
 ['city street', 'city street'], ['street', 'city street'],
 ['park', 'park'], ['forest', 'forest'], ['desert', 'desert'],
 ['space station', 'space station'], ['planet', 'otherworldly planet landscape'],
 ['home', 'home interior']
];
function scoreEmotions(text, concept = '', conceptWeight = 0.35) {
 const scores = {};
 for (const [emotion, entries] of Object.entries(EMOTIONS)) {
 let total = 0;
 for (const [phrase, weight] of entries) {
 if (contains(text, phrase)) total += weight;
 if (concept && contains(concept, phrase)) total += weight * conceptWeight;
 }
 scores[emotion] = round(total);
 }
 // Broader feelings enrich the existing director categories without
 // requiring new shot/action implementations or additional API calls.
 for (const [feeling, value] of Object.entries(nuanceScores(text, concept, conceptWeight))) {
 const theme = NUANCE_LEXICON[feeling].theme;
 scores[theme] = round((scores[theme] || 0) + value * 0.65);
 }
 return scores;
}
function ranking(scores) {
 return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}
function topEmotion(scores, fallback = 'undetermined') {
 const ranked = ranking(scores);
 return ranked[0] && ranked[0][1] > 0 ? ranked[0][0] : fallback;
}
function emotionalFamily(emotion) {
 return INTIMATE.has(emotion) ? 'intimate'
 : EXPRESSIVE.has(emotion) ? 'expressive' : 'neutral';
}
function findLocations(text) {
 const places = [];
 for (const [cue, place] of LOCATION_CUES) {
 if (contains(text, cue) && !places.includes(place)) places.push(place);
 }
 return places;
}
function oneLocation(text) {
 return /\b(single location|one location|same location|never leave|entirely inside|one room)\b/i.test(text);
}
function timestamp(text) {
 const m = String(text).match(/^\s*(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\s*$/);
 if (!m) return null;
 const h = Number(m[1] || 0), minutes = Number(m[2]), seconds = Number(m[3]);
 if ((m[1] && minutes > 59) || seconds > 59) return null; return h * 3600 + minutes * 60 + seconds + Number(`0.${m[4] || '0'}`);
}
function parseLyrics(raw) {
 let section = 'unlabeled';
 const lines = [];
 for (const item of clean(raw, MAX_LYRICS).split(/\r?\n/)) {
 const line = item.trim();
 if (!line) continue;
 const tag = line.match(/^\[(intro|verse|pre-chorus|chorus|hook|bridge|outro|refrain|instrumental)(?:\s*\d+)?\]$/i);
 if (tag) { section = tag[1].toLowerCase(); continue; }
 const lrc = line.match(/^\[([\d:.]+)\]\s*(.*)$/);
 const time = lrc ? timestamp(lrc[1]) : null;
 const text = time !== null ? lrc[2].trim() : line;
 if (text) lines.push({ text, section, time });
 }
 return lines;
}
function lyricTimeline(lines, duration) {
 if (!lines.length) return [];
 if (lines.every(line => Number.isFinite(line.time))) {
 const ordered = [...lines].sort((a, b) => a.time - b.time);
 return ordered.map((line, index) => ({
 ...line,
 startSeconds: clamp(line.time, 0, duration),
 endSeconds: clamp(index + 1 < ordered.length ? ordered[index + 1].time : duration, 0, duration),
 timingSource: 'provided'
 })).filter(line => line.endSeconds > line.startSeconds);
 }
 return lines.map((line, index) => ({
 ...line,
 startSeconds: round(index * duration / lines.length),
 endSeconds: round((index + 1) * duration / lines.length),
 timingSource: 'estimated'
 }));
}
// Produce continuous segments at the requested clip length. Audio scenes
// contribute energy labels but can never create gaps or overlapping shots.
function segmentMusic(plan, duration, clip) {
 const source = (Array.isArray(plan?.scenes) ? plan.scenes : [])
 .map(item => ({
 startSeconds: Number(item.startSeconds),
 endSeconds: Number(item.endSeconds),
 intensity: ['low','medium','high'].includes(item.intensity) ? item.intensity : 'medium',
 energyChange: clean(item.energyChange, 35) || 'steady'
 }))
 .filter(item => Number.isFinite(item.startSeconds) && Number.isFinite(item.endSeconds)
 && item.endSeconds > item.startSeconds && item.endSeconds > 0)
 .sort((a, b) => a.startSeconds - b.startSeconds);
 const segments = [];
 for (let start = 0; start < duration && segments.length < MAX_SCENES; start += clip) {
 const end = Math.min(duration, start + clip);
 const midpoint = (start + end) / 2;
 const audio = source.find(item => item.startSeconds <= midpoint && item.endSeconds > midpoint)
 || source.find(item => item.startSeconds < end && item.endSeconds > start);
 segments.push({
 startSeconds: round(start),
 endSeconds: round(end),
 intensity: audio ? audio.intensity : 'medium',
 energyChange: audio ? audio.energyChange : 'steady',
 audioMatched: !!audio
 });
 }
 return segments;
}
const LOCATION_SETS = {
 intimate: [
 'quiet apartment living room beside a window', 'softly lit apartment hallway',
 'peaceful tree-lined path at dawn'
 ],
 luxury: [
 'elegant penthouse overlooking the skyline',
 'high-fashion designer boutique',
 'upscale rooftop overlooking the city',
 'premium arrivals entrance'
 ],
 expressive: [
 'cinematic city rooftop',
 'polished performance studio',
 'striking downtown exterior',
 'dramatic night skyline'
 ],
 neutral: [
 'cinematic indoor performance space',
 'quiet outdoor walkway',
 'naturally lit interior'
 ]
};
const ACTIONS = {
 reassurance: [
 'The performer meets the camera with a steady, reassuring gaze; an uncertain expression becomes calm.',
 'The performer takes a breath, gently reaches a hand toward the edge of frame, then lets the moment settle.',
 'The performer shifts from guarded stillness to an open, welcoming posture, without forced romance.',
 'The performer listens attentively toward the edge of the frame, then responds with a subtle reassuring nod.',
 'The performer remains present and grounded, holding a quiet expression of compassion.'
 ],
 vulnerability: [
 'The performer hesitates beside a window, revealing a vulnerable expression without exaggerated tears.',
 'The performer lowers their gaze and takes a measured breath, communicating emotional uncertainty.',
 'A fleeting expression of sadness crosses the performer’s face before they regain composure.',
 'The performer rests one hand against a doorframe, pausing in a private reflective moment.',
 'The performer looks briefly away from the camera and returns with unguarded honesty.'
 ],
 heartbreak: [
 'The performer sits alone with a quiet sense of distance, avoiding melodramatic gestures.',
 'The performer notices an empty space nearby and allows an understated expression of loss.',
 'The performer walks slowly away from a familiar place, carrying unresolved emotion.',
 'The performer stops mid-step, as though reconsidering a painful memory.'
 ],
 romance: [
 'The performer offers a gentle, warm camera-facing smile with natural romantic chemistry.',
 'The performer responds to a fond thought with a soft expression and relaxed movement.',
 'The performer turns toward warm light, allowing a tender, intimate moment to unfold.'
 ],
 grief: [
 'The performer remains still in a respectful private moment, expression weighted by loss.',
 'The performer lowers their gaze in remembrance, holding back an understated emotional response.',
 'A long, quiet pause gives the performer space to process grief.'
 ],
 longing: [
 'The performer watches the distant horizon as though hoping for someone to return.',
 'The performer moves slowly toward a window with a thoughtful, longing expression.',
 'The performer pauses and glances back, suggesting emotional distance.'
 ],
 hope: [
 'The performer takes a small, deliberate step into warmer light, suggesting renewed trust.',
 'A guarded expression softens into a subtle sense of relief and possibility.',
 'The performer looks ahead and moves forward calmly, signaling emotional progress.'
 ],
 reflection: [
 'The performer pauses over a familiar object and then quietly sets it aside.',
 'The performer looks toward a familiar space as a memory returns, keeping the moment grounded.',
 'The performer sits quietly in thought while the camera observes without interruption.'
 ], confidence: [
 'The performer makes a self-assured entrance and confidently holds the lens.',
 'The performer delivers a playful, commanding performance with deliberate body language.',
 'The performer walks through the setting with poised, runway-inspired energy.',
 'The performer stops for a striking editorial pose and moves naturally into the next beat.'
 ],
 luxury: [
 'The performer confidently moves through elegant surroundings, revealing fine details of the setting.',
 'The performer adjusts a stylish accessory and holds an effortless editorial pose.',
 'The performer arrives at a premium location with a self-assured, polished presence.'
 ],
 celebration: [
 'The performer celebrates through naturally energetic movement synchronized to the track.',
 'The performer gives an upbeat camera-facing performance with unmistakable joy.',
 'The performer moves confidently through a lively environment without confusing jump cuts.'
 ],
 conflict: [
 'The performer conveys tension with controlled expression and body language, without invented violence.',
 'A measured confrontation is suggested through framing and reaction, not graphic action.',
 'The performer takes a decisive step away from an emotionally tense situation.'
 ],
 undetermined: [
 'The performer delivers an emotionally neutral, lyric-led performance without invented plot details.',
 'The performer moves naturally within the chosen location, allowing the lyrics to guide expression.'
 ]
};
// Generic semantic cues only; never embed example-song lyrics in production rules.
// When an action is not justified by the lyric's meaning, fall back to an
// emotion-appropriate performance. These rules are advisory, not transcription.
function lyricSpecificAction(text, emotion) {
 if (!text) return null;
 if (['reassurance', 'romance', 'longing'].includes(emotion)
 && /\b(hand|hands|touch|embrace|hug)\b/i.test(text))
 return 'The performer uses a natural, gentle gesture toward the camera, suggesting human connection without inventing another performer.';
 if (['vulnerability', 'heartbreak', 'grief'].includes(emotion)
 && /\b(tear|tears|cry|crying|sorrow|sadness)\b/i.test(text))
 return 'A quiet change in the performer’s eyes suggests emotion without forcing theatrical crying.';
 if (['reflection', 'longing', 'hope'].includes(emotion)
 && /\b(memory|memories|remember|past|yesterday)\b/i.test(text))
 return 'The performer glances toward a familiar part of the environment, briefly remembering, then returns to the present.';
 if (['confidence', 'luxury'].includes(emotion)
 && /\b(style|fashion|clothes|outfit|designer|dress|shoes)\b/i.test(text))
 return 'The performer delivers an assured editorial fashion moment with graceful, realistic body movement.';
 if (emotion === 'celebration' && /\b(dance|dancing|celebrate|party|victory)\b/i.test(text))
 return 'The performer celebrates with rhythmically natural movement appropriate to the measured musical intensity.';
 return null;
}
function roleForIndex(index, total) {
 const position = total <= 1 ? 1 : index / (total - 1);
 if (position < 0.25) return 'emotional setup';
 if (position < 0.72) return 'development and deepening';
 if (position < 0.9) return 'emotional turning point';
 return 'resolution or lingering final image';
}
function chooseVisualEnergy(audioEnergy, emotion, overall, change) {
 const family = emotionalFamily(emotion);
 const overarchingIntimate = emotionalFamily(overall) === 'intimate';
 if (family === 'intimate' || (family === 'neutral' && overarchingIntimate)) {
 if (audioEnergy === 'high' || /rising|build/i.test(change)) return 'emotional crescendo';
 return 'restrained';
 }
 if (family === 'expressive') return audioEnergy === 'high' ? 'energetic' : audioEnergy === 'low' ? 'measured' : 'dynamic';
 return audioEnergy === 'high' ? 'dynamic' : 'measured';
}
function filmDirection(emotion, visualEnergy, index, total) { const stage = roleForIndex(index, total);
 if (visualEnergy === 'restrained' || visualEnergy === 'emotional crescendo') {
 const intimateShots = ['intimate close-up', 'patient medium shot', 'over-the-shoulder-style profile',
 'quiet wide establishing shot', 'natural eye-level close-up'];
 const intimateMoves = ['almost imperceptible dolly-in', 'restrained locked-off frame',
 'slow lateral slider', 'gentle measured pull-back', 'subtle handheld drift'];
 const shots = visualEnergy === 'emotional crescendo'
 ? ['expressive medium close-up', 'intimate tracking close-up', 'composed wide emotional reveal']
 : intimateShots;
 const moves = visualEnergy === 'emotional crescendo'
 ? ['controlled gradual push-in', 'slow rising camera reveal', 'gentle tracking move']
 : intimateMoves;
 return {
 shot: shots[index % shots.length],
 cameraMovement: moves[Math.floor(index / 2) % moves.length],
 pacing: visualEnergy === 'emotional crescendo'
 ? 'emotionally intense but physically restrained, no fast montage'
 : 'slow, natural, unhurried',
 framingPurpose: stage
 };
 }
 const shots = ['editorial medium shot', 'dynamic wide shot', 'confident low-angle shot',
 'expressive tracking medium shot', 'full-body performance frame', 'cinematic wide establishing shot'];
 const moves = visualEnergy === 'energetic'
 ? ['energetic but controlled tracking shot', 'smooth crane reveal', 'deliberate orbital movement']
 : ['smooth side tracking', 'controlled forward dolly', 'wide floating camera move'];
 return {
 shot: shots[index % shots.length],
 cameraMovement: moves[index % moves.length],
 pacing: visualEnergy === 'energetic' ? 'lively and rhythmic, still physically believable' : 'measured and rhythmic',
 framingPurpose: stage
 };
}
function lightingFor(emotion, stage) {
 const map = {
 reassurance: 'warm practical light with gentle natural fill',
 vulnerability: 'soft window light with delicate shadows',
 heartbreak: 'subdued atmospheric natural light',
 romance: 'warm intimate cinematic light',
 grief: 'soft muted respectful lighting',
 longing: 'wistful dusk light with a natural horizon',
 hope: 'gradually brightening natural light',
 reflection: 'muted nostalgic indirect light',
 confidence: 'crisp fashion editorial lighting',
 luxury: 'polished high-end cinematic lighting',
 celebration: 'vivid festive performance lighting',
 conflict: 'controlled high-contrast dramatic light',
 undetermined: 'natural motivated cinematic light'
 };
 const base = map[emotion] || map.undetermined;
 return stage.includes('resolution') && emotionalFamily(emotion) === 'intimate'
 ? 'softly brightening natural light suggesting acceptance' : base;
}
function sceneLocation(index, total, overall, chosen, fixed, segmentLyrics) {
 if (chosen.length) {
 if (fixed) return chosen[0];
 // Keep each requested location for a coherent block of shots.
 return chosen[Math.min(chosen.length - 1, Math.floor(index * chosen.length / total))];
 }
 const family = emotionalFamily(overall);
 const pool = overall === 'luxury' ? LOCATION_SETS.luxury
 : (LOCATION_SETS[family] || LOCATION_SETS.neutral);
 const lyricalPlaces = findLocations(segmentLyrics);
 if (lyricalPlaces.length && contains(segmentLyrics, 'at ' + lyricalPlaces[0]))
 return lyricalPlaces[0];
 // Avoid location hopping: intimate videos hold environments over several shots.
 const count = family === 'intimate' ? Math.min(3, Math.ceil(total / 4)) : Math.min(pool.length, Math.max(2, Math.ceil(total / 3)));
 const group = Math.min(count - 1, Math.floor(index * count / total));
 return pool[group];
}
function confidenceLabel(scores, emotion, timing) {
 const ranked = ranking(scores);
 const leader = scores[emotion] || 0;
 const next = ranked.filter(([key]) => key !== emotion)[0]?.[1] || 0;
 if (leader >= 8 && leader - next >= 3 && timing === 'provided') return 'high';
 if (leader >= 4 && leader - next >= 1) return 'medium';
 return 'low';
}
export function createStoryIntelligencePlan({
 title = 'Untitled Song', lyrics = '', songSeconds, musicPlan = null,
 prompt = '', format = 'vertical', sceneSeconds = 15,
 visualStyle = 'photorealistic'
} = {}) {
 const duration = Number(songSeconds);
 const clip = Number(sceneSeconds);
 if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_SECONDS)
 throw new Error('Song duration must be above 0 and at most 360 seconds.');
 if (!Number.isFinite(clip) || clip < 3 || clip > 30)
 throw new Error('Scene duration must be between 3 and 30 seconds.');
 if (typeof lyrics !== 'string' || lyrics.length > MAX_LYRICS)
 throw new Error('Lyrics must be text under 12,000 characters.');
 const concept = clean(prompt, 4000);
 const lines = parseLyrics(lyrics);
 const timed = lyricTimeline(lines, duration);
 const segments = segmentMusic(musicPlan, duration, clip);
 const wholeLyrics = lines.map(line => line.text).join(' ');
 const totals = scoreEmotions(wholeLyrics, concept, 0.55);
 // Song title provides a small clue, never enough to erase contradictory lyrics.
 const titleScores = scoreEmotions(clean(title, 120));
 for (const emotion of Object.keys(totals)) {
 totals[emotion] = round(totals[emotion] + titleScores[emotion] * 0.5);
 }
 const overall = topEmotion(totals);
 const wholeNuances = nuanceScores(wholeLyrics, concept, 0.5);
 const songBlend = blendedEmotion(`${wholeLyrics} ${concept}`, wholeNuances);
 const ranked = ranking(totals).filter(([, score]) => score > 0).slice(0, 4);
 const locations = findLocations(concept);
 const fixed = oneLocation(concept);
 const usedActions = new Set();
 const storyArc = [];
 const scenes = segments.map((segment, index) => {
 const matches = timed.filter(line => line.startSeconds < segment.endSeconds && line.endSeconds > segment.startSeconds);
 const excerpt = clean(matches.map(line => line.text).join(' '), 600);
 const localScores = scoreEmotions(excerpt, concept, 0.25);
 const localNuances = nuanceRanking(nuanceScores(excerpt, concept, 0.15))
 .filter(([,value]) => value >= 2).slice(0, 3).map(([name]) => name);
 const localBlend = blendedEmotion(excerpt, nuanceScores(excerpt));
 const local = topEmotion(localScores);
 // A single weak word should not override a strong song-wide theme.
 const localValue = local === 'undetermined' ? 0 : localScores[local];
 let emotion = localValue >= 3 ? local : overall;
 if (emotion === 'undetermined' && concept) emotion = topEmotion(scoreEmotions('', concept, 1));
 if (emotion === 'undetermined') emotion = 'undetermined';
 const narrativeBeat = roleForIndex(index, segments.length);
 const visualEnergy = chooseVisualEnergy(segment.intensity, emotion, overall, segment.energyChange);
 const camera = filmDirection(emotion, visualEnergy, index, segments.length);
 const location = sceneLocation(index, segments.length, overall, locations, fixed, excerpt);
 const lighting = lightingFor(emotion, narrativeBeat);
 const candidates = ACTIONS[emotion] || ACTIONS.undetermined; const specific = lyricSpecificAction(excerpt, emotion);
 let action = specific || candidates[index % candidates.length];
 const key = normalize(action);
 // Avoid repeated instructions, including repeated chorus lyric cues.
 if (usedActions.has(key)) {
 action = candidates.find(candidate => !usedActions.has(normalize(candidate)))
 || `${candidates[index % candidates.length]} Allow the ${narrativeBeat} to develop naturally.`;
 }
 usedActions.add(normalize(action));
 if (narrativeBeat.includes('resolution') && emotionalFamily(overall) === 'intimate'
 && !['heartbreak', 'grief', 'conflict'].includes(overall)) {
 action = `${action} End on an earned, understated feeling of emotional safety; avoid forced celebration.`;
 }
 // The current Listening Director renders production prompts from intensity,
 // not from scene.prompt. Send *visual performance* energy in that legacy
 // field, retaining measured musical intensity separately.
 const performanceIntensity = visualEnergy === 'restrained' ? 'low'
 : visualEnergy === 'emotional crescendo' ? 'medium' : segment.intensity;
 const originalEnergy = segment.audioMatched ? segment.intensity : 'unverified';
 const promptText = [
 `CutLoopz cinematic music video for "${clean(title, 120)}".`,
 `Scene ${index + 1} of ${segments.length}; ${segment.startSeconds}–${segment.endSeconds} seconds.`,
 `Customer direction (priority): ${concept || 'let the lyrics guide the creative direction'}.`,
 `Story continuity: ${narrativeBeat}. Maintain the same central performer and consistent visual world.`,
 `Emotion: ${emotion}. Song-wide emotional theme: ${overall}.`,
 localNuances.length ? `Emotional subtext: ${localNuances.join(', ')}.` : '',
 (localBlend || songBlend) ? `Blended emotional tone: ${localBlend || songBlend}. Express this naturally, not as exaggerated acting.` : '',
 `Lyric inspiration: ${excerpt || 'lyrics not provided for this moment'}.`,
 `Location: ${location}.`,
 `On-screen action: ${action}`, 
 `Camera framing: ${camera.shot}. Movement: ${camera.cameraMovement}.`,
 `Lighting: ${lighting}. Performance pace: ${camera.pacing}.`,
 `Audio energy: ${originalEnergy}; energy movement: ${segment.energyChange}. Visually interpreted as: ${visualEnergy}.`,
 `Style: ${clean(visualStyle, 150)}; ${format === 'landscape' ? '16:9' : '9:16'}.`,
 'Preserve the supplied performer reference identity, hairstyle, wardrobe and body proportions across all shots when a reference image is provided.',
 'Natural human anatomy, facial expression, realistic movement, grounded gravity and lighting; a single continuous shot.',
 'No unrelated subplots, forced new characters, excessive scene changes, morphing, slideshow, subtitles, logos or watermarks.'
 ].join(' ');
 storyArc.push({scene: index + 1, emotion, narrativeBeat, visualEnergy});
 return {
 number: index + 1,
 startSeconds: segment.startSeconds,
 endSeconds: segment.endSeconds,
 durationSeconds: round(segment.endSeconds - segment.startSeconds),
 section: matches[0]?.section || 'unlabeled',
 lyricExcerpt: excerpt,
 lyricTiming: matches[0]?.timingSource || (timed.length ? 'estimated' : 'unavailable'),
 emotion,
 emotionalSubtones: localNuances,
 blendedEmotion: localBlend || songBlend,
 emotionConfidence: confidenceLabel(localScores, emotion, matches[0]?.timingSource),
 intensity: performanceIntensity, // The UI uses this for performance pace.
 audioIntensity: originalEnergy, // Preserve the original audio measurement.
 energyChange: segment.energyChange,
 visualEnergy,
 location,
 shot: camera.shot,
 action: `Story phase: ${narrativeBeat}. ${action}`,
 prompt: promptText,
 narrativeBeat,
 lighting,
 cameraMovement: camera.cameraMovement
 };
 });
 const warnings = [];
 if (!lines.length) warnings.push('No lyrics supplied. Emotion is based on the customer concept only.');
 if (lines.length && timed[0]?.timingSource === 'estimated') warnings.push('Lyrics have no timestamps, so scene-to-lyric alignment is estimated.');
 if (!musicPlan || !segments.some(segment => segment.audioMatched))
 warnings.push('No usable audio-derived intensity plan. Camera pace is conservatively estimated.');
 if (overall === 'undetermined') warnings.push('Insufficient lyrical evidence to classify the song confidently.');
 if (locations.length && !fixed && locations.length > segments.length)
 warnings.push('More locations requested than available scenes; some locations may be omitted.');
 return {
 version: '5.2',
 engine: 'CutLoopz Emotional Director',
 status: 'preview',
 title: clean(title, 120),
 songSeconds: duration,
 totalScenes: scenes.length,
 lyricSource: lines.length ? 'customer-provided' : 'none',
 lyricTiming: lines.length ? timed[0]?.timingSource : 'unavailable',
 storyEmotion: overall,
 customerConcept: concept,
 emotionalProfile: {
 primary: overall,
 secondary: ranked.filter(([emotion]) => emotion !== overall).slice(0, 3).map(([emotion]) => emotion),
 nuancedFeelings: nuanceRanking(wholeNuances).slice(0, 8).map(([name]) => name),
 blendedEmotion: songBlend,
 approach: emotionalFamily(overall),
 audioBpmEstimate: Number.isFinite(Number(musicPlan?.bpmEstimate))
 && Number(musicPlan?.bpmEstimate) > 0 ? Number(musicPlan.bpmEstimate) : null,
 note: 'BPM is context only. Lyric emotion and section intensity guide visual pace.'
 },
 storyArc,
 scenes,
 qualityChecks: {
 uniqueLocations: new Set(scenes.map(scene => scene.location)).size,
 requestedLocations: locations.length,
 restrainedOrCrescendoShots: scenes.filter(scene =>
 ['restrained','emotional crescendo'].includes(scene.visualEnergy)).length,
 warnings
 },
 limitations: [
 'Rule-based emotional interpretation, not open-ended semantic understanding; figurative language, sarcasm, negation and cultural meaning can be misread.',
 'No automatic lyric transcription; supply the lyrics separately.',
 'Untimed lyrics are assigned approximate positions, not exact vocal alignment.',
 'Audio-derived intensity and BPM are approximations and can be wrong.',
 'Storyboard preview only; does not trigger paid video generation.'
 ]
 };
}
