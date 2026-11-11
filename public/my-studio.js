'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const fieldNames=['songLink','title','duration','lyrics','visualStyle','format','sceneSeconds','direction','characterNotes'];
 const pageTitles=['Your Song & Artist','Song Analyzer','Listening Director','Your Storyboard','Review Your Vision'];
 const pageDescriptions=['Bring your music into the Studio.','Learn its rhythm and energy.','Shape the story and visual performance.','Fine-tune each numbered scene.','Check every creative choice before production.'];
 const storagePrefix='cutloopz:artist-studio:v1:';
 const MEDIA_DB_NAME='cutloopz-studio-media-v1';
 // Audio and photos are kept in browser-owned IndexedDB, never in localStorage or
 // the account text-draft API. A browser may refuse storage; in that case the file
 // remains usable for the current page session and we clearly explain the limit.
 let mediaDbPromise=null;
 function mediaDb(){
   if(mediaDbPromise)return mediaDbPromise;
   mediaDbPromise=new Promise((resolve,reject)=>{
     if(!('indexedDB' in window)){reject(Error('Browser file storage unavailable'));return;}
     const request=indexedDB.open(MEDIA_DB_NAME,1);
     request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files');};
     request.onsuccess=()=>resolve(request.result);
     request.onerror=()=>reject(request.error||Error('Unable to open file storage'));
     request.onblocked=()=>reject(Error('File storage blocked'));
   }).catch(error=>{mediaDbPromise=null;throw error});
   return mediaDbPromise;
 }
 async function mediaWrite(kind,file){
   const db=await mediaDb();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction('files','readwrite');
     const key=storageKey+':'+kind;
     if(file)tx.objectStore('files').put({name:file.name,type:file.type,modified:file.lastModified,blob:file},key);
     else tx.objectStore('files').delete(key);
     tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Unable to save file'));
     tx.onabort=()=>reject(tx.error||Error('File storage aborted'));
   });
 }
 async function mediaRead(kind){
   const db=await mediaDb();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction('files','readonly');
     const request=tx.objectStore('files').get(storageKey+':'+kind);
     request.onsuccess=()=>{
       const entry=request.result;
       if(!entry||!(entry.blob instanceof Blob)||!entry.name){resolve(null);return;}
       resolve(new File([entry.blob],entry.name,{type:entry.type||'',lastModified:entry.modified||Date.now()}));
     };
     request.onerror=()=>reject(request.error||Error('Cannot read retained file'));
   });
 }
 function refreshAnalysisIntro(){
   const label=$('analysisIntro');if(!label)return;
   if(lastSongFile){label.textContent=`Ready to analyze: ${lastSongFile.name}. This is the song you selected on Page 1; no second upload needed.`;return;}
   const name=$('songAudio').dataset.previousName;
   const link=window.CutLoopzSongLink?.inspect($('songLink').value);
   if(link?.ok){label.textContent=`${link.name} link is saved. Beat analysis requires an authorized MP3/WAV on Page 1. You can continue to the Listening Director with your lyrics now.`;return;}
   label.textContent=name?`Your draft remembers “${name}”, but the actual audio file is unavailable in this browser. Go Back to Page 1 and choose the MP3 or WAV again.`:'No music selected yet. Choose a song on Page 1, or skip analysis and go directly to the Listening Director.';
 }

 const durationOptions=[15,30,60,120,180,240,300,360];
 function selectedDuration(){
  if($('duration').value!=='custom')return Number($('duration').value);
  const raw=$('customTime').value.trim(),match=/^(\d{1,2}):([0-5]\d)$/.exec(raw);
  const seconds=match?(Number(match[1])*60+Number(match[2])):NaN;
  return Number.isFinite(seconds)&&seconds>=15&&seconds<=360?seconds:NaN;
 }
 function syncCustomTime(){ $('customTimeField').hidden=$('duration').value!=='custom'; }
 let storageKey=storagePrefix+'guest', account=null, saveTimer=null, serverTimer=null;
 let page=0, scenePage=0, scenes=[], musicResult=null, lastSongFile=null, lastPhotoFile=null, restoring=false, photoPreviewUrl=null;
 const notify=(id,text,bad=false)=>{const node=$(id);if(node){node.textContent=text;node.style.color=bad?'#ffafaa':'';}};
 const safeText=value=>String(value==null?'':value);
 const serializable=()=>({songLink:(window.CutLoopzSongLink?.inspect($('songLink').value)?.url)||'',title:$('title').value,lyrics:$('lyrics').value,songSeconds:selectedDuration(),sceneSeconds:Number($('sceneSeconds').value),style:$('visualStyle').value,format:$('format').value,direction:$('direction').value,
  characterNotes:$('characterNotes').value,songName:lastSongFile?.name||$('songAudio').dataset.previousName||'',photoName:lastPhotoFile?.name||$('artistPhoto').dataset.previousName||'',page,scenePage,scenes,musicResult});
 function saveLocal(){
   try{localStorage.setItem(storageKey,JSON.stringify({at:Date.now(),draft:serializable()}));return true;}
   catch{notify('saveStatus','Storage is full. Draft not saved.',true);return false;}
 }
 async function saveServer(){
   if(!account)return;
   try{
    const response=await fetch('/api/customer-auth/studio/draft',{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({draft:serializable()})});
    if(!response.ok)throw Error('Cloud draft unavailable');
    notify('saveStatus','Saved to account and device');
   }catch{notify('saveStatus','Saved on this device · account sync unavailable');}
 }
 function scheduleSave(){
   if(restoring)return;
   clearTimeout(saveTimer);clearTimeout(serverTimer);
   notify('saveStatus','Saving changes…');
   saveTimer=setTimeout(()=>{
     const ok=saveLocal();
     if(ok)notify('saveStatus',account?'Saved on device · syncing…':'Saved on this device');
   },220);
   if(account)serverTimer=setTimeout(saveServer,1600);
 }
 function hydrate(draft){
   if(!draft || typeof draft!=='object')return;
   restoring=true;
   $('songLink').value=safeText(draft.songLink).slice(0,2048);
   renderLinkStatus(false);
   $('title').value=safeText(draft.title).slice(0,120);
   $('lyrics').value=safeText(draft.lyrics).slice(0,12000);
   const seconds=Number(draft.songSeconds);
   $('duration').value=durationOptions.includes(seconds)?String(seconds):(seconds>=15&&seconds<=360?'custom':'30');
   if($('duration').value==='custom')$('customTime').value=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
   syncCustomTime();
   $('sceneSeconds').value=String([10,15,20,30].includes(Number(draft.sceneSeconds))?draft.sceneSeconds:15);
   $('visualStyle').value=[...$('visualStyle').options].some(o=>o.value===draft.style)?draft.style:'Cinematic Realism';
   $('format').value=draft.format==='landscape'?'landscape':'vertical';
   $('direction').value=safeText(draft.direction).slice(0,4000);
   $('characterNotes').value=safeText(draft.characterNotes).slice(0,1000);
   $('songAudio').dataset.previousName=safeText(draft.songName).slice(0,180);
   $('artistPhoto').dataset.previousName=safeText(draft.photoName).slice(0,180);
   if(draft.songName)$('audioLabel').textContent=`Previously selected: ${draft.songName}. Reselect this file to analyze it again.`;
   if(draft.photoName)$('photoLabel').textContent=`Previously selected: ${draft.photoName}. Reselect this photo before production.`;
   musicResult=draft.musicResult && typeof draft.musicResult==='object'?draft.musicResult:null;
   scenes=Array.isArray(draft.scenes)?draft.scenes.slice(0,40).map(s=>({number:Number(s.number)||1,startSeconds:Number(s.startSeconds)||0,endSeconds:Number(s.endSeconds)||0,emotion:safeText(s.emotion).slice(0,55),location:safeText(s.location).slice(0,500),action:safeText(s.action).slice(0,800),prompt:safeText(s.prompt).slice(0,4000)})):[];
   scenePage=Math.max(0,Math.min(Math.ceil(scenes.length/(window.matchMedia('(max-width:620px)').matches?1:2))-1,Number(draft.scenePage)||0));
   page=Math.max(0,Math.min(4,Number(draft.page)||0));
   restoring=false;updateUploadLabels();refreshAnalysisIntro();renderAnalysis();showPage(page);
 }
 async function initialize(){
   let localDraft=null,localUpdatedAt=0,serverUpdatedAt=0;
   try{
    const res=await fetch('/api/customer-auth/me',{credentials:'same-origin',cache:'no-store'});
    if(res.ok){const d=await res.json();account=d.user||d.customer||null;}
   }catch{}
   storageKey=storagePrefix+(account?.id?'account:'+account.id:'guest');
   $('signInStatus').textContent=account?`Signed in: ${account.name||account.email||'Artist'}`:'Guest Studio · Free tools';
   try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');localDraft=saved?.draft||null;localUpdatedAt=Number(saved?.at)||0;}catch{}
   let serverDraft=null;
   if(account){try{const r=await fetch('/api/customer-auth/studio/draft',{credentials:'same-origin',cache:'no-store'});if(r.ok){const response=await r.json();serverDraft=response.draft;serverUpdatedAt=Date.parse(response.updatedAt)||0;}}catch{}}
   // Use the most recent draft when account sync and local edits differ.
   hydrate(localDraft && (localUpdatedAt>=serverUpdatedAt || !serverDraft)?localDraft:serverDraft);
   const restoredName=$('songAudio').dataset.previousName;
   const restoredPhotoName=$('artistPhoto').dataset.previousName;
   try{
     const [audio,photo]=await Promise.all([mediaRead('audio'),mediaRead('photo')]);
     if(audio&&audio.name===restoredName&&audio.size<=25*1024*1024&&/\.(mp3|wav)$/i.test(audio.name))lastSongFile=audio;
     if(photo&&photo.name===restoredPhotoName&&photo.size<=12*1024*1024&&['image/jpeg','image/png','image/webp'].includes(photo.type)){
       lastPhotoFile=photo;updatePhotoPreview(photo);
     }
   }catch{ /* A retained file is optional; the artist can select it again. */ }
   updateUploadLabels();refreshAnalysisIntro();
   if(new URLSearchParams(location.search).get('source')==='link')$('songLink').focus({preventScroll:true});
   // Deep links override the saved page, but do not reset any project fields.
   const urlPage=new URLSearchParams(location.search).get('step');
   const destination={song:0,analyze:1,director:2,storyboard:3,review:4}[urlPage];
   if(Number.isInteger(destination))showPage(destination);
   notify('saveStatus',account?'Account draft ready':'Draft saved on this device');
 }
 function showPage(index){
   page=Math.max(0,Math.min(4,index));
   document.querySelectorAll('.wizard-step').forEach(section=>{section.hidden=Number(section.dataset.step)!==page});
   $('stepTitle').textContent=pageTitles[page];$('stepSubtitle').textContent=pageDescriptions[page];
   $('stepTag').textContent=`PAGE ${String(page+1).padStart(2,'0')} / 05`;
   $('stepCounter').textContent=`Page ${page+1} of 5`;
   $('stepProgress').setAttribute('aria-valuenow',String(page+1));
   $('progressFill').style.width=`${20*(page+1)}%`;
   $('backBtn').disabled=page===0;$('nextBtn').textContent=page===4?'Back to Start':'Next →';
   if(page===1)refreshAnalysisIntro();
   if(page===3)renderScenes();if(page===4)renderReview();
   scheduleSave();
 }
 function clearOrphanedStoryboard(){
   if(!scenes.length)return;
   const count=Math.ceil(selectedDuration()/Number($('sceneSeconds').value));
   if(count!==scenes.length){scenes=[];scenePage=0;musicResult=null;}
 }
 function updatePhotoPreview(file){
   if(photoPreviewUrl){URL.revokeObjectURL(photoPreviewUrl);photoPreviewUrl=null;}
   const wrap=$('photoPreviewWrap'),img=$('photoPreview');
   if(!file){wrap.hidden=true;img.removeAttribute('src');return;}
   photoPreviewUrl=URL.createObjectURL(file);
   img.src=photoPreviewUrl;wrap.hidden=false;
 }
 function updateUploadLabels(){
  if(lastSongFile)$('audioLabel').textContent=`Ready: ${lastSongFile.name}. Saved privately on this device. Page 2 uses this selection automatically.`;
  if(lastPhotoFile)$('photoLabel').textContent=`Ready: ${lastPhotoFile.name}. Saved privately on this device.`;
 }
 function renderLinkStatus(announce=true){
   const parsed=window.CutLoopzSongLink?.inspect($('songLink').value);
   const status=$('songLinkStatus'),open=$('openSongLink');
   if(!parsed?.ok){
     status.textContent=parsed?.error||'Paste a public song share link.';
     status.style.color=announce?'#ffafaa':'';
     open.hidden=true;open.removeAttribute('href');
     return false;
   }
   status.style.color='';
   status.textContent=`${parsed.name} link attached to your project. Use your authorized audio file for beat analysis; the Director can work from lyrics now.`;
   open.href=parsed.url;open.hidden=false;
   if(announce){scheduleSave();refreshAnalysisIntro();}
   return true;
 }
 function renderAnalysis(){
   if(!musicResult){$('analysisResult').hidden=true;return;}
   $('analysisResult').hidden=false;
   const summary=musicResult.summary||{};
   $('bpmValue').textContent=Number.isFinite(Number(summary.bpmEstimate))&&Number(summary.bpmEstimate)>0?`${Math.round(summary.bpmEstimate)} BPM`:'Uncertain';
   $('audioDurationValue').textContent=Number.isFinite(Number(summary.durationSeconds))?`${Math.round(summary.durationSeconds)} sec`:'—';
   $('energyValue').textContent=String(musicResult.plan?.scenes?.length||0);
   $('analysisCaveat').textContent=musicResult.note||'Tempo and energy are estimates; analysis does not transcribe vocals.';
 }
 async function analyze(){
   if(!lastSongFile){notify('analyzeStatus','The actual MP3/WAV file is missing. Tap Back, select it on Page 1, then return here. Or skip analysis and use the Director.',true);return;}
   if(lastSongFile.size>25*1024*1024){notify('analyzeStatus','The song must be smaller than 25 MB.',true);return;}
   const form=new FormData();form.append('audio',lastSongFile);
   const btn=$('analyzeBtn');btn.disabled=true;notify('analyzeStatus','Analyzing rhythm and intensity…');
   try{
    const response=await fetch('/api/creative-preview/music-analysis',{method:'POST',body:form});const payload=await response.json();
    if(!response.ok||!payload.ok)throw Error(payload.error||'Unable to analyze audio');
    musicResult=payload;renderAnalysis();scheduleSave();notify('analyzeStatus','Song analysis complete. Continue to the Director.');
   }catch(error){notify('analyzeStatus',error.message,true)}finally{btn.disabled=false;}
 }
 async function makeStoryboard(){
   const btn=$('directorBtn');btn.disabled=true;notify('directorStatus','Creating your numbered storyboard…');
   try{
    const input={title:$('title').value||'Untitled Song',lyrics:$('lyrics').value,prompt:[ $('direction').value,$('characterNotes').value&&`Artist identity: ${$('characterNotes').value}`].filter(Boolean).join('\n').slice(0,4000),songSeconds:selectedDuration(),sceneSeconds:Number($('sceneSeconds').value),visualStyle:$('visualStyle').value,format:$('format').value,musicPlan:musicResult?.plan||null};
    const res=await fetch('/api/creative-preview/storyboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'Cannot create storyboard');
    if(scenes.length&&!window.confirm('Replace the existing storyboard, including any manual edits?')){notify('directorStatus','Existing storyboard preserved.');return;}
    scenes=(data.plan.scenes||[]).map(s=>({number:s.number,startSeconds:s.startSeconds,endSeconds:s.endSeconds,emotion:s.emotion,location:s.location,action:s.action,prompt:s.prompt}));
    scenePage=0;
    $('storyEmotion').textContent=`Emotional direction: ${data.plan.storyEmotion||'unclassified'}`;
    notify('directorStatus',`Storyboard ready · ${scenes.length} editable scenes. No video created.`);
    showPage(3);
   }catch(error){notify('directorStatus',error.message,true)}finally{btn.disabled=false}
 }
 const lineField=(title,value,change,textarea=false)=>{
   const wrap=document.createElement('label');wrap.textContent=title;
   const input=document.createElement(textarea?'textarea':'input');if(textarea)input.rows=5;
   input.value=value||'';input.setAttribute('aria-label',title);input.maxLength=textarea?4000:800;
   input.addEventListener('input',()=>{change(input.value);scheduleSave()});
   wrap.appendChild(input);return wrap;
 };
 function renderScenes(){
   const empty=$('storyEmpty'),content=$('storyContent');empty.hidden=scenes.length>0;content.hidden=!scenes.length;
   if(!scenes.length)return;
   const batchSize=window.matchMedia('(max-width:620px)').matches?1:2;
   const count=Math.ceil(scenes.length/batchSize);scenePage=Math.max(0,Math.min(count-1,scenePage));
   const first=scenePage*batchSize;const batch=scenes.slice(first,first+batchSize);
   $('scenePairLabel').textContent=`Scene ${first+1}${batch.length>1?'–'+(first+2):''} of ${scenes.length}`;
   $('scenePrev').disabled=scenePage===0;$('sceneNext').disabled=scenePage===count-1;
   const host=$('sceneCards');host.replaceChildren();
   for(const scene of batch){
    const card=document.createElement('article');card.className='scene-card';
    const heading=document.createElement('h4');heading.textContent=`Scene ${scene.number}`;card.appendChild(heading);
    const meta=document.createElement('div');meta.className='scene-meta';meta.textContent=`${scene.startSeconds}s – ${scene.endSeconds}s · ${scene.emotion||'Director preview'}`;card.appendChild(meta);
    card.appendChild(lineField('Location',scene.location,val=>{scene.location=val}));
    card.appendChild(lineField('Action',scene.action,val=>{scene.action=val},true));
    card.appendChild(lineField('Director Prompt',scene.prompt,val=>{scene.prompt=val},true));
    host.appendChild(card);
   }
 }
 function addReview(label,value){const box=document.createElement('div'),small=document.createElement('small'),strong=document.createElement('strong');small.textContent=label;strong.textContent=value||'Not provided';box.append(small,strong);$('reviewSummary').appendChild(box)}
 function renderReview(){
  $('reviewSummary').replaceChildren();
  const linked=window.CutLoopzSongLink?.inspect($('songLink').value);
  addReview('Music source',lastSongFile?'Uploaded MP3/WAV':linked?.ok?`${linked.name} link (audio upload required)`:'Not attached');if(linked?.ok)addReview('Song share link',linked.url);
  addReview('Song',$('title').value||'Untitled');addReview('Duration',`${selectedDuration()} seconds`);
  addReview('Style',$('visualStyle').value);addReview('Format',$('format').value==='landscape'?'16:9 Landscape':'9:16 Vertical');
  addReview('Director direction',$('direction').value.slice(0,350));addReview('Scenes',`${scenes.length} editable scenes`);
  addReview('Audio analysis',musicResult?'Completed':'Not run');addReview('Artist reference',lastPhotoFile?.name||$('artistPhoto').dataset.previousName||'Not selected');
 }
 function newProject(){
   if(!window.confirm('Start a new project? Your current saved draft will be cleared.'))return;
   const oldKey=storageKey;localStorage.removeItem(oldKey);
   Promise.all([mediaWrite('audio',null),mediaWrite('photo',null)]).catch(()=>notify('saveStatus','Project reset; stored files could not be cleared. Clear site data in browser settings.',true));
   if(account)fetch('/api/customer-auth/studio/draft',{method:'DELETE',credentials:'same-origin'}).catch(()=>{});
   for(const id of fieldNames){const element=$(id);element.value=element.tagName==='SELECT'?element.options[0].value:'';}
   $('songLinkStatus').textContent='Paste a public song link to attach its source to your project.';$('songLinkStatus').style.color='';$('openSongLink').hidden=true;$('openSongLink').removeAttribute('href');
   $('duration').value='30';$('customTime').value='';syncCustomTime();$('sceneSeconds').value='15';$('format').value='vertical';$('songAudio').value='';$('artistPhoto').value='';
   $('songAudio').dataset.previousName='';$('artistPhoto').dataset.previousName='';lastSongFile=null;lastPhotoFile=null;
   $('audioLabel').textContent='Choose an audio file for beat-informed analysis. Maximum 25 MB.';
   $('photoLabel').textContent='JPG, PNG or WebP · Max 12 MB · One reference photo in the standard Studio.';
   updatePhotoPreview(null);
   scenes=[];musicResult=null;scenePage=0;renderAnalysis();notify('directorStatus','');notify('analyzeStatus','');showPage(0);
 }
 for(const id of fieldNames){const input=$(id);input.addEventListener('input',scheduleSave);input.addEventListener('change',()=>{if(['duration','sceneSeconds'].includes(id))clearOrphanedStoryboard();scheduleSave()});}
 $('useSongLink').addEventListener('click',()=>{renderLinkStatus(true)});
 $('songLink').addEventListener('input',()=>{const a=$('openSongLink');a.hidden=true;a.removeAttribute('href');$('songLinkStatus').textContent='Tap Use Link to confirm this source.';});
 $('songLink').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();renderLinkStatus(true);}});
 $('duration').addEventListener('change',()=>{syncCustomTime();clearOrphanedStoryboard();scheduleSave()});
 $('customTime').addEventListener('input',()=>{clearOrphanedStoryboard();scheduleSave()});
 window.addEventListener('resize',()=>{if(page===3)renderScenes()});
 $('songAudio').addEventListener('change',()=>{
   const f=$('songAudio').files?.[0]||null;
   if(f && (!/\.(mp3|wav)$/i.test(f.name)||f.size>25*1024*1024)){alert('Select an MP3 or WAV under 25 MB.');$('songAudio').value='';lastSongFile=null;return;}
   lastSongFile=f;musicResult=null;renderAnalysis();
   $('songAudio').dataset.previousName=f?.name||'';
   updateUploadLabels();refreshAnalysisIntro();scheduleSave();
   mediaWrite('audio',f).catch(()=>notify('audioLabel',`Selected: ${f?.name||'none'}. Browser could not retain this file after refresh; keep this page open until analysis.`,true));
 });
 $('artistPhoto').addEventListener('change',()=>{
   const f=$('artistPhoto').files?.[0]||null;
   if(f&&(!/\.(png|jpe?g|webp)$/i.test(f.name)||!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>12*1024*1024)){
     alert('Choose a JPG, PNG or WebP under 12 MB.');$('artistPhoto').value='';lastPhotoFile=null;updatePhotoPreview(null);return;
   }
   lastPhotoFile=f;
   $('artistPhoto').dataset.previousName=f?.name||'';
   updatePhotoPreview(f);updateUploadLabels();scheduleSave();
   mediaWrite('photo',f).catch(()=>notify('photoLabel',`Selected: ${f?.name||'none'}. Browser could not retain this photo after refresh.`,true));
 });
 $('nextBtn').addEventListener('click',()=>{if(page===0 && !Number.isFinite(selectedDuration())){alert('Enter a valid custom duration between 0:15 and 6:00.');return;}showPage(page===4?0:page+1)});$('backBtn').addEventListener('click',()=>showPage(page-1));
 $('analyzeBtn').addEventListener('click',analyze);$('directorBtn').addEventListener('click',makeStoryboard);
 $('scenePrev').addEventListener('click',()=>{scenePage=Math.max(0,scenePage-1);renderScenes();scheduleSave()});
 $('sceneNext').addEventListener('click',()=>{scenePage=Math.min(Math.ceil(scenes.length/(window.matchMedia('(max-width:620px)').matches?1:2))-1,scenePage+1);renderScenes();scheduleSave()});
 $('editSong').addEventListener('click',()=>showPage(0));$('editDirector').addEventListener('click',()=>showPage(2));$('editStoryboard').addEventListener('click',()=>showPage(3));$('newProject').addEventListener('click',newProject);
 const backToTop=$('backToTop');
 function updateBackToTop(){backToTop.hidden=window.scrollY<180;}
 backToTop.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}));
 window.addEventListener('scroll',updateBackToTop,{passive:true});
 window.addEventListener('resize',updateBackToTop);
 updateBackToTop();
 // Show the one-time new-customer welcome after account registration redirected here.
 window.CutLoopzWelcome?.consume();
 window.addEventListener('pagehide',()=>{saveLocal();if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);});initialize();
})();
