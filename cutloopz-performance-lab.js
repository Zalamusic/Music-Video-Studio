
/**
 * CutLoopz Media v0.9
 * Private Performance Lab
 * Read-only integration. No paid generation.
 */

const STAGES = [
  ['Music Intelligence', 'Existing engine; integration pending'],
  ['Story Director', 'Existing engine; integration pending'],
  ['Worker Queue', 'Offline-tested; GPU not connected'],
  ['Singing Performance', 'Real singing model not connected'],
  ['Video Assembly', 'Offline-tested; live integration pending'],
  ['Performance Quality', 'Synthetic timing passed; real singing untested']
];

export function performanceLabStatus() {
  return {
    ok: true,
    version: '0.9',
    testDurationSeconds: 30,
    adminOnly: true,
    generationEnabled: false,
    paidProviderCallsEnabled: false,
    customersEnabled: false,
    actualPerformanceScore: null,
    stages: STAGES.map(([name, status]) => ({
      name, status
    })),
    blockingReasons: [
      'Production infrastructure not yet deployed',
      'Real singing model not yet connected',
      'Live GPU worker not verified',
      'Paid generation cost controls not yet verified'
    ]
  };
}

const LAB_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Performance Lab | CutLoopz Media</title>
<style>
:root {
  color-scheme: dark;
  --bg:#0c1220;
  --panel:#182438;
  --gold:#eed09b;
  --line:#364862;
  --muted:#c4d2e4;
}
* {box-sizing:border-box}
body {
  margin:0;
  background:radial-gradient(
    circle at top right,#25344e,var(--bg) 67%
  );
  font:16px/1.5 system-ui,sans-serif;
  color:#f5f7ff;
}
main {
  max-width:870px;
  margin:auto;
  padding:24px 18px 75px;
}
a {color:var(--gold);text-decoration:none}
header {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:15px;
  border-bottom:1px solid var(--line);
  padding-bottom:18px;
}
h1 {
  font-size:clamp(2rem,5vw,3.1rem);
  line-height:1.1;
  margin:28px 0 10px;
}
.eyebrow {
  color:var(--gold);
  font-size:.8rem;
  letter-spacing:.13em;
  font-weight:800;
}
p {color:var(--muted)}
section {
  background:var(--panel);
  border:1px solid var(--line);
  border-radius:17px;
  margin:18px 0;
  padding:22px;
}
.grid {
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:10px;
}
.stage {
  border:1px solid var(--line);
  background:#101b2b;
  padding:14px;
  border-radius:10px;
  font-weight:700;
}
.stage small {
  display:block;
  color:var(--muted);
  font-weight:400;
  margin-top:5px;
}
label {
  display:block;
  margin:8px 0 6px;
  font-weight:600;
}
input {
  width:100%;
  padding:13px;
  border-radius:9px;
  border:1px solid #7185a2;
  background:#0b1322;
  color:#fff;
  font:inherit;
}
button {
  margin-top:12px;
  border:0;
  background:var(--gold);
  border-radius:9px;
  padding:12px 17px;
  font:inherit;
  font-weight:800;
  cursor:pointer;
  color:#111724;
}
button:disabled {
  opacity:.55;
  cursor:not-allowed;
}
.subtle {font-size:.88rem}
.alert {
  border-left:3px solid var(--gold);
  padding-left:13px;
}
@media(max-width:560px) {
  section {padding:17px}
  .grid {grid-template-columns:1fr}
}
</style>
</head>
<body>
<main>
<header>
  <strong>CutLoopz
    <span style="color:var(--gold)">Media</span>
  </strong>
  <a href="/">Main site</a>
</header>

<div class="eyebrow" style="margin-top:25px">
  PRIVATE ADMINISTRATOR LAB · V0.9
</div>

<h1>A Director That Listens.</h1>
<p>
  Our 30-second performance production preview,
  directly on the CutLoopz main website.
</p>

<section>
  <h2>Administrator check</h2>
  <p>
    Enter your current video admin key to view readiness.
    The key is not saved on this page.
  </p>
  <form id="labAuth">
    <label for="key">Administrator key</label>
    <input id="key" type="password"
      autocomplete="off" required>
    <button type="submit">Check readiness</button>
  </form>
  <p id="authStatus" role="status">
    No check completed.
  </p>
</section>

<section>
  <h2>Production pipeline</h2>
  <div id="stages" class="grid"></div>
</section>

<section>
  <h2>30-second test authorization</h2>
  <p class="alert">
    The new integrated generation engine is not deployed.
    Synthetic timing scores do not prove realistic singing.
  </p>
  <button type="button" disabled>
    Generate — waiting for integrated engine
  </button>
  <div id="blockers" class="subtle"></div>
</section>

</main>
<script>
document.getElementById('labAuth')
.addEventListener('submit', async event => {
  event.preventDefault();

  const field = document.getElementById('key');
  const key = field.value;
  field.value = '';

  const status = document.getElementById('authStatus');
  status.textContent = 'Checking administrator access...';

  try {
    const response = await fetch(
      '/api/cutloopz-performance-lab/status',
      {
        headers: {'X-Video-Admin-Key':key},
        cache:'no-store'
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || 'Unable to authorize'
      );
    }

    status.textContent =
      'Administrator verified. Current readiness displayed.';

    const stages = document.getElementById('stages');
    stages.replaceChildren();

    data.stages.forEach(item => {
      const card = document.createElement('div');
      card.className = 'stage';

      const title = document.createElement('div');
      title.textContent = item.name;

      const detail = document.createElement('small');
      detail.textContent = item.status;

      card.append(title, detail);
      stages.appendChild(card);
    });

    const blockers = document.getElementById('blockers');
    blockers.replaceChildren();

    const heading = document.createElement('p');
    heading.textContent = 'Required before real generation:';
    blockers.appendChild(heading);

    const list = document.createElement('ul');

    data.blockingReasons.forEach(reason => {
      const item = document.createElement('li');
      item.textContent = reason;
      list.appendChild(item);
    });

    blockers.appendChild(list);

  } catch(error) {
    status.textContent =
      'Cannot verify: ' + error.message;
  }
});
</script>
</body>
</html>`;

export function registerCutLoopzPerformanceLab({
  app,
  isVideoAdmin
}) {
  if (!app || typeof app.get !== 'function') {
    throw new TypeError('Express app required');
  }

  if (typeof isVideoAdmin !== 'function') {
    throw new TypeError(
      'Existing administrator authorization required'
    );
  }

  app.get('/cutloopz-performance-lab', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.type('html').send(LAB_HTML);
  });

  app.get(
    '/api/cutloopz-performance-lab/status',
    (req, res) => {
      res.set('Cache-Control', 'no-store');

      if (!isVideoAdmin(req)) {
        return res.status(403).json({
          error:'Administrator password required.'
        });
      }

      return res.json(performanceLabStatus());
    }
  );
}
