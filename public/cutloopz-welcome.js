/* CutLoopz: one-time welcome triggered only by a successful new registration. */
'use strict';
(() => {
  const KEY = 'cutloopz:registered-welcome:v1';
  const MAX_AGE_MS = 2 * 60 * 1000;
  let active = null;
  function queue(user) {
    const name = String(user?.name || 'Hitmaker').trim().slice(0,100);
    try { sessionStorage.setItem(KEY, JSON.stringify({name,expires:Date.now()+MAX_AGE_MS})); return true; }
    catch { return false; }
  }
  function close() {
    if(!active) return;
    const {host,timer,escape} = active;
    active = null;
    clearTimeout(timer);
    document.removeEventListener('keydown',escape);
    host.classList.remove('is-visible');
    setTimeout(() => host.remove(), 240);
  }
  function show(name) {
    close();
    const first = String(name || 'Hitmaker').trim().split(/\s+/)[0].slice(0,35) || 'Hitmaker';
    const host=document.createElement('aside');
    host.id='cutloopzWelcome';
    host.className='cutloopz-welcome';
    host.setAttribute('role','status');
    host.setAttribute('aria-live','polite');
    host.setAttribute('aria-label','Welcome to CutLoopz Media');
    const label=document.createElement('span');label.className='cutloopz-welcome__eyebrow';label.textContent='Your creative journey begins';
    const heading=document.createElement('h2');heading.className='cutloopz-welcome__title';heading.textContent=`Welcome to CutLoopz, ${first}! ✨`;
    const description=document.createElement('p');description.className='cutloopz-welcome__desc';description.textContent='Your Studio is ready. Upload your song, explore the free Director, and turn your vision into a storyboard.';
    const closeButton=document.createElement('button');closeButton.className='cutloopz-welcome__close';closeButton.type='button';closeButton.setAttribute('aria-label','Dismiss welcome message');closeButton.textContent='×';closeButton.addEventListener('click',close);
    const actions=document.createElement('div');actions.className='cutloopz-welcome__actions';
    const studio=document.createElement('a');studio.className='cutloopz-welcome__primary';studio.href='/my-studio.html';studio.textContent='Explore My Studio';
    studio.addEventListener('click',()=>{ if(location.pathname==='/my-studio.html'){close();} });
    const later=document.createElement('button');later.className='cutloopz-welcome__later';later.type='button';later.textContent='Maybe later';later.addEventListener('click',close);
    actions.append(studio,later);
    host.append(label,heading,description,closeButton,actions);
    document.body.append(host);
    const escape=event=>{if(event.key==='Escape')close();};
    document.addEventListener('keydown',escape);
    const timer=setTimeout(close,18000);
    active={host,timer,escape};
    requestAnimationFrame(()=>host.classList.add('is-visible'));
  }
  function consume() {
    let data=null;
    try {
      const raw=sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY); // consume before displaying; never repeat on refresh
      if(raw)data=JSON.parse(raw);
    } catch { return false; }
    if(!data || typeof data.expires!=='number'||data.expires<Date.now()||data.expires>Date.now()+MAX_AGE_MS) return false;
    show(data.name);
    return true;
  }
  window.CutLoopzWelcome=Object.freeze({queue,consume,show});
})();
