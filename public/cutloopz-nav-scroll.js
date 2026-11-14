'use strict';
(()=>{
 function install(nav){
  if(!nav || nav.dataset.scrollHintReady==='yes')return;
  nav.dataset.scrollHintReady='yes';
  const wrap=document.createElement('div');wrap.className='nav-scroll-control';
  const button=document.createElement('button');button.type='button';button.className='nav-scroll-button';
  button.setAttribute('aria-controls',nav.id||(nav.id='cutloopz-nav-'+(document.querySelectorAll('.nav-scroll-control').length+1)));
  wrap.append(button);nav.insertAdjacentElement('afterend',wrap);
  let atEnd=false;
  function update(){
   const remaining=nav.scrollWidth-nav.clientWidth;
   wrap.hidden=remaining<8;
   if(wrap.hidden)return;
   atEnd=nav.scrollLeft>=remaining-5;
   button.textContent=atEnd?'← Scroll':'Scroll →';
   button.setAttribute('aria-label',atEnd?'Scroll navigation tabs left':'Scroll navigation tabs right');
  }
  button.addEventListener('click',()=>{
   const distance=Math.max(180,Math.round(nav.clientWidth*.85));
   nav.scrollBy({left:atEnd?-distance:distance,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
   // The scroll event updates the arrow after movement has finished.
  });
  nav.addEventListener('scroll',update,{passive:true});
  window.addEventListener('resize',update);
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(nav);
  update();
 }
 function start(){document.querySelectorAll('.tabs').forEach(install)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
