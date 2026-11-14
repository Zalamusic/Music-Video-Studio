/* Lightweight, offline page-aware help; no external model calls or personal-data collection. */
'use strict';(()=>{
 if(document.getElementById('cutloopzHelperButton'))return;
 const guides={
  0:{title:'Your Song & Artist',description:'Start with your song title, choose a music source, and add your lyrics. An MP3/WAV and artist photo are required only when you generate an actual video.',action:'Choose MP3 / WAV or Paste Song Link. Add lyrics so the Listening Director can interpret your song.'},
  1:{title:'Song Analyzer',description:'Analyze a song file to discover rhythmic ideas. If you only brought a streaming link, you can skip beat analysis and continue using your lyrics.',action:'If you have an MP3/WAV, use Analyze; otherwise select Next to continue.'},
  2:{title:'Listening Director',description:'Describe your artist’s appearance separately from your creative direction. The Director can then turn your lyrics and instructions into editable scenes.',action:'Describe the mood, outfit and settings, then select Get Director Input · Create Storyboard.'},
  3:{title:'Your Storyboard',description:'Edit each scene’s direction. Scene navigation moves through the storyboard in pairs.',action:'Review scenes and use Download Storyboard to keep a copy. Use Next when ready.'},
  4:{title:'Review & Make Video',description:'Check your scene plan before producing. Private owner generation needs authorized account access, an audio file, an artist photo and a connected GPU.',action:'Use Check GPU Connection first. Don’t generate until the engine is ready and you have rights to use the files.'}
 };
 let open=false;
 const style=document.createElement('style');style.textContent=`
 #cutloopzHelperButton{position:fixed;z-index:970;right:max(15px,env(safe-area-inset-right));bottom:max(83px,calc(env(safe-area-inset-bottom) + 66px));width:49px;height:49px;border-radius:50%;border:2px solid #f8d28a;background:#151216;color:#f5d089;font-size:24px;font-weight:900;box-shadow:0 5px 21px #0008;cursor:pointer}
 #cutloopzHelperPanel{position:fixed;z-index:969;right:max(13px,env(safe-area-inset-right));bottom:max(141px,calc(env(safe-area-inset-bottom) + 123px));width:min(350px,calc(100vw - 26px));max-height:65dvh;overflow:auto;background:#17151a;color:#f6f3ed;border:1px solid #947547;border-radius:14px;padding:17px;box-shadow:0 16px 44px #000b;font:15px/1.55 'DM Sans',Arial,sans-serif}
 #cutloopzHelperPanel h2{font:800 20px/1.2 'DM Sans',Arial,sans-serif;color:#edc77b;margin:4px 0 10px}#cutloopzHelperPanel p{font-size:15px;color:#f0e9df;margin:8px 0}#cutloopzHelperPanel .helper-tip{background:#29241f;border-left:3px solid #d5a651;padding:11px 12px;border-radius:5px}
 #cutloopzHelperPanel .helper-menu{display:flex;gap:7px;flex-wrap:wrap;margin:13px 0}#cutloopzHelperPanel button{font:750 14px 'DM Sans',Arial,sans-serif;background:#332b23;border:1px solid #a78550;color:#f8e3b6;border-radius:8px;padding:10px;min-height:43px;cursor:pointer}#cutloopzHelperPanel .helper-close{float:right;font-size:19px;padding:0;width:36px;height:36px}#cutloopzHelperButton:focus-visible,#cutloopzHelperPanel button:focus-visible{outline:3px solid #fff;outline-offset:2px}#cutloopzHelperPanel[hidden]{display:none!important}@media(max-width:600px){#cutloopzHelperButton{right:max(12px,env(safe-area-inset-right));width:47px;height:47px}}@media print{#cutloopzHelperPanel,#cutloopzHelperButton{display:none!important}}
 `;document.head.append(style);
 const trigger=document.createElement('button');trigger.id='cutloopzHelperButton';trigger.type='button';trigger.textContent='?';trigger.title='Studio Helper';trigger.setAttribute('aria-label','Open CutLoopz Studio Helper');trigger.setAttribute('aria-controls','cutloopzHelperPanel');trigger.setAttribute('aria-expanded','false');
 const panel=document.createElement('aside');panel.id='cutloopzHelperPanel';panel.setAttribute('role','region');panel.setAttribute('aria-label','CutLoopz Studio Helper');panel.hidden=true;
 const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.className='helper-close';closeBtn.textContent='×';closeBtn.setAttribute('aria-label','Close Studio Helper');
 const eyebrow=document.createElement('div');eyebrow.textContent='✦ CUTLOOPZ GUIDE';eyebrow.style.cssText='font-size:11px;letter-spacing:.12em;color:#d7b06c;font-weight:900;';
 const title=document.createElement('h2'),description=document.createElement('p'),tip=document.createElement('p');tip.className='helper-tip';
 const actions=document.createElement('div');actions.className='helper-menu';
 function button(label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;}
 function currentGuide(){
  if(location.pathname.endsWith('/my-studio.html')){const step=[...document.querySelectorAll('.wizard-step')].find(s=>!s.hidden);return guides[Number(step?.dataset.step)||0];}
  if(location.pathname.includes('creator-profile'))return {title:'Artist Profile',description:'You choose the information that appears in the public directory. Profiles start private and videos remain hosted on YouTube or your other platforms.',action:'Save the profile. Select Public when you want visitors to discover it.'};
  if(location.pathname.includes('creator-directory'))return {title:'Creator Directory',description:'Search for independent artists and visit their original music and video pages. We store links, not showcase videos.',action:'Choose Edit My Artist Profile to add your own listing.'};
  if(location.pathname.includes('cinema'))return {title:'Artist Cinema',description:'The black screening room is for reviewing videos the current account or private link is allowed to see.',action:'Download your finished video while it is available. Publish it externally and link it on your artist profile.'};
  return {title:'Welcome to CutLoopz',description:'Your Studio is where you add your song, get a free Director storyboard, and plan a cinematic music video.',action:'Use My Studio to begin, or visit Creator Directory to discover independent artists.'};
 }
 function refresh(){const guide=currentGuide();title.textContent=guide.title;description.textContent=guide.description;tip.textContent=guide.action;
  actions.replaceChildren(button('Save & Download',()=>{title.textContent='Keep your creative work';description.textContent='In My Studio, Save Now stores the current text draft. Download Storyboard creates a readable scene plan. Download Project Backup creates a portable JSON backup. Neither backup includes audio or artist photos.';tip.textContent='Reattach your song and artist photo when restoring a backup.';}),button('Where are my videos?',()=>{title.textContent='Review your video';description.textContent='After owner generation completes, choose Review in Artist Cinema. Shareable private review links expire; public artist profiles use external video links only.';tip.textContent='Video production requires the authorized owner account and a connected engine in the current preview.';}),button('My Artist Profile',()=>{location.href='/creator-profile.html';}));}
 panel.append(closeBtn,eyebrow,title,description,tip,actions);document.body.append(panel,trigger);
 function setOpen(value){open=value;panel.hidden=!value;trigger.setAttribute('aria-expanded',String(value));trigger.setAttribute('aria-label',value?'Close CutLoopz Studio Helper':'Open CutLoopz Studio Helper');if(value){refresh();closeBtn.focus();}else trigger.focus();}
 trigger.addEventListener('click',()=>setOpen(!open));closeBtn.addEventListener('click',()=>setOpen(false));
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open)setOpen(false)});
 // Studio step changes are synchronous DOM updates; re-read current step on opening.
})();
