'use strict';
(() => {
 const $=id=>document.getElementById(id);
 const evaluatorMode=new URLSearchParams(location.search).get('mode')==='evaluator';
 const fieldNames=['songLink','title','duration','lyrics','visualStyle','format','sceneSeconds','direction','characterNotes'];
 const pageTitles=['Your Song & Artist','Song Analyzer','Listening Director','Your Storyboard','Review Your Vision'];
 const pageDescriptions=['Bring your music into the Studio.','Learn its rhythm and energy.','Shape the story and visual performance.','Fine-tune each numbered scene.','Check every creative choice before production.'];
 const storagePrefix=evaluatorMode?'cutloopz:free-evaluator:v1:':'cutloopz:artist-studio:v1:';
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
   if(evaluatorMode && selectedSource==='link'){
     const linked=window.CutLoopzSongLink?.inspect($('songLink').value);
     label.textContent=linked?.ok?'Song link selected for creative direction. No audio analysis was performed.':'Choose a song link on Page 1, then continue to the Director.';
     return;
   }
   if(activeSongFile()){label.textContent=`Ready to analyze: ${activeSongFile().name}. The audio was selected on Page 1; no second upload needed.`;return;}
   const name=$('songAudio').dataset.previousName;
   const link=window.CutLoopzSongLink?.inspect($('songLink').value);
   if(link?.ok){label.textContent=`${link.name} link is saved. Beat analysis requires an authorized MP3/WAV on Page 1. You can continue to the Listening Director with your lyrics now.`;return;}
   label.textContent=name?`Your draft remembers “${name}”, but the actual audio file is unavailable in this browser. Go Back to Page 1 and choose the MP3 or WAV again.`:'No music selected yet. Choose a song on Page 1, or skip analysis and go directly to the Listening Director.';
 }

 const durationOptions=Array.from({length:70},(_,i)=>15+i*5);
 function selectedDuration(){
  if($('duration').value!=='custom')return Number($('duration').value);
  const raw=$('customTime').value.trim(),match=/^(\d{1,2}):([0-5]\d)$/.exec(raw);
  const seconds=match?(Number(match[1])*60+Number(match[2])):NaN;
  return Number.isFinite(seconds)&&seconds>=15&&seconds<=360?seconds:NaN;
 }
 function syncCustomTime(){ $('customTimeField').hidden=$('duration').value!=='custom'; }
 let storageKey=storagePrefix+'guest', account=null, saveTimer=null, serverTimer=null;
 let page=0, scenePage=0, scenes=[], musicResult=null, lastSongFile=null, lastPhotoFile=null, restoring=false, photoPreviewUrl=null;
 let analysisSourceKey='', storyboardSourceKey='', pendingRestore=null, sourceVersion=0;
 let selectedSource=evaluatorMode?'link':'upload'; // The free evaluator remembers its selected input independently.
 const activeSongFile=()=>evaluatorMode&&selectedSource!=='upload'?null:lastSongFile;
 let productionJobId=null,productionPollTimer=null,engineReady=false;
 const productionBase='/api/cutloopz-production';
 const productionStorageKey=()=>storageKey+':lastLocalJob';
 function recoverGeneration(){
  let saved='';try{saved=localStorage.getItem(productionStorageKey())||''}catch{}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved))return;
  productionJobId=saved;$('generationResults').hidden=false;$('resumeGeneration').hidden=false;
  $('generationJobId').textContent='Production ID: '+productionJobId;
  $('generationStatus').textContent='Saved production found. Restoring progress…';
  pollGeneration();
 }

 const parseServer=async response=>{let result;try{result=await response.json()}catch{throw Error('Server returned an invalid response')}
   if(!response.ok||!result.ok)throw Error(result.error||`Request failed (${response.status})`);return result;};
 async function checkEngine(){
   $('engineStatus').textContent='Checking your local GPU connection…';
   try{const status=await parseServer(await fetch(productionBase+'/local/status',{credentials:'same-origin',cache:'no-store'}));
     engineReady=Boolean(status.readyToSubmit);$('engineStatus').textContent=engineReady
       ?`Local engine ready: ${status.modelId||'model loaded'}.`
       :status.message||'GPU model is not ready yet.';
   }catch(error){engineReady=false;$('engineStatus').textContent=error.message==='Sign in with the CutLoopz owner account to use private generation.'
     ?'Owner sign-in required for private video generation.':'Cannot check engine: '+error.message;}
   return engineReady;
 }
 async function pollGeneration(){
   if(!productionJobId)return;
   try{
    const [status,automation]=await Promise.all([
     parseServer(await fetch(productionBase+'/local/jobs/'+productionJobId,{credentials:'same-origin',cache:'no-store'})),
     parseServer(await fetch(productionBase+'/local/jobs/'+productionJobId+'/automation',{credentials:'same-origin',cache:'no-store'}))]);
    const job=status.job,ready=job.clips?.filter(c=>c.status==='ready').length||0,total=job.clips?.length||0;
    const percent=total?Math.round(100*ready/total):0;
    $('generationProgress').value=percent;
    $('generationProgressText').textContent=`${ready} of ${total} clips ready · ${automation.automation?.phase||job.status}`;
    if(automation.automation?.state==='not-running' && job.status!=='ready'){
     $('generationStatus').textContent='Production is paused, possibly after a server restart. Select Resume Video Tracking to continue safely.';
     $('generateVideo').disabled=false;return;
    }
    if(automation.automation?.state==='complete'){
     if(productionPollTimer){clearTimeout(productionPollTimer);productionPollTimer=null;}
     const url=productionBase+'/local/jobs/'+productionJobId+'/video';
     $('generatedVideo').src=url;$('generatedVideo').hidden=false;
     $('downloadGeneratedVideo').href=url;$('downloadGeneratedVideo').hidden=false;
     $('reviewInCinema').href='/cinema.html?job='+encodeURIComponent(productionJobId);$('reviewInCinema').hidden=false;
     $('generationProgress').value=100;$('generationStatus').textContent='Video assembled! Play or download your CutLoopz video.';
     $('generateVideo').disabled=false;return;
    }
    if(['stopped'].includes(automation.automation?.state)||['failed','needs-review'].includes(job.status)){
     $('generationStatus').textContent='Production needs attention: '+(automation.automation?.error||job.status)+'. No automatic paid retry occurred.';
     $('generateVideo').disabled=false;return;
    }
    $('generationStatus').textContent='Your video is being created on the connected CutLoopz engine.';
    productionPollTimer=setTimeout(pollGeneration,4000);
   }catch(error){$('generationStatus').textContent='Status temporarily unavailable: '+error.message+'. Use Check GPU Connection and retry tracking.';
      $('generateVideo').disabled=false;}
 }
 async function resumeProduction(){
   if(!productionJobId)return;
   if(productionPollTimer){clearTimeout(productionPollTimer);productionPollTimer=null;}
   $('generationStatus').textContent='Checking saved production…';
   try{
     const status=await parseServer(await fetch(productionBase+'/local/jobs/'+productionJobId,{credentials:'same-origin',cache:'no-store'}));
     if(!['ready','failed','needs-review'].includes(status.job.status)){
       await parseServer(await fetch(productionBase+'/local/jobs/'+productionJobId+'/auto-run',{method:'POST',credentials:'same-origin'}));
     }
     await pollGeneration();
   }catch(error){notify('generationStatus','Unable to resume: '+error.message+'. No clips were automatically retried.',true);}
 }
 async function generateVideo(){
   const btn=$('generateVideo');
   if(!$('audioRights').checked){notify('generationStatus','Confirm your right to use the audio and artist image first.',true);return;}
   if(!lastSongFile||!lastPhotoFile){notify('generationStatus','Upload both the actual MP3/WAV and artist photo on Page 1 before generating.',true);return;}
   const duration=selectedDuration();
   if(!Number.isInteger(duration)||duration<15||duration>360||duration%5){notify('generationStatus','Choose a duration in 5-second increments, from 15 seconds to 6 minutes.',true);return;}
   if(!await checkEngine()){notify('generationStatus','GPU engine not ready; check the connection above. No video was submitted.',true);return;}
   const form=new FormData();form.append('song',lastSongFile);form.append('photo',lastPhotoFile);form.append('durationSeconds',String(duration));
   form.append('format',$('format').value);form.append('creativeDirection',[$('visualStyle').value,$('direction').value,$('characterNotes').value].filter(Boolean).join('. ').slice(0,2000));
   form.append('scenePrompts',JSON.stringify(scenes.map(s=>({startSeconds:s.startSeconds,prompt:s.prompt})).slice(0,40)));
   btn.disabled=true;$('generationResults').hidden=true;$('generationStatus').textContent='Submitting your video to the local CutLoopz engine…';
   try{const result=await parseServer(await fetch(productionBase+'/local/jobs',{method:'POST',credentials:'same-origin',body:form}));
    productionJobId=result.jobId;try{localStorage.setItem(productionStorageKey(),productionJobId)}catch{}
    $('generationResults').hidden=false;$('resumeGeneration').hidden=false;$('generationJobId').textContent='Production ID: '+productionJobId;
    if(productionPollTimer)clearTimeout(productionPollTimer);
    await pollGeneration();
   }catch(error){notify('generationStatus',error.message,true);btn.disabled=false;}
 }

 const notify=(id,text,bad=false)=>{const node=$(id);if(node){node.textContent=text;node.style.color=bad?'#ffafaa':'';}};
 const safeText=value=>String(value==null?'':value);
 // Source signatures are provenance checks, not security hashes. Never attach an old
 // analysis or storyboard to a different song, including after draft restoration.
 // Compact double fingerprint avoids storing duplicate copies of lyrics in drafts.
 // It is not used for authentication, signatures, or security decisions.
 function fingerprint(parts){
   const text=JSON.stringify(parts);let a=2166136261,b=2246822519;
   for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b+c,0x9e3779b1);}
   return `${text.length}:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
 }
 const fileIdentity=file=>file?[file.name,file.size,file.lastModified]:null;
 const musicKey=()=>fingerprint([$('title').value.trim(),selectedSource,selectedSource==='link'?$('songLink').value.trim():'',fileIdentity(activeSongFile())]);
 const storyKey=()=>fingerprint([musicKey(),$('lyrics').value,$('direction').value,$('characterNotes').value,
   selectedDuration(),Number($('sceneSeconds').value),$('visualStyle').value,$('format').value,fileIdentity(lastPhotoFile),analysisSourceKey]);
 function invalidateSongOutputs({music=false}={}){
   sourceVersion++;
   const hadStory=scenes.length>0;
   scenes=[];scenePage=0;storyboardSourceKey='';
   updateProjectActions();
   $('storyEmotion').textContent='';
   if(music){musicResult=null;analysisSourceKey='';renderAnalysis();}
   if(hadStory){notify('directorStatus','Song or direction changed. Previous storyboard cleared; generate a new one for this song.');
     if(page===3)renderScenes();}
   scheduleSave();
 }

 const serializable=()=>({source:selectedSource,songLink:(evaluatorMode||selectedSource==='link')?$('songLink').value.trim().slice(0,2048):'',title:$('title').value,lyrics:$('lyrics').value,songSeconds:selectedDuration(),sceneSeconds:Number($('sceneSeconds').value),style:$('visualStyle').value,format:$('format').value,direction:$('direction').value,
  characterNotes:$('characterNotes').value,songName:lastSongFile?.name||(evaluatorMode?$('evaluationAudio').dataset.previousName:$('songAudio').dataset.previousName)||'',photoName:lastPhotoFile?.name||$('artistPhoto').dataset.previousName||'',page,scenePage,scenes,musicResult,analysisSourceKey,storyboardSourceKey});
 function saveLocal(){
   try{localStorage.setItem(storageKey,JSON.stringify({at:Date.now(),draft:serializable()}));return true;}
   catch{notify('saveStatus','Storage is full. Draft not saved.',true);return false;}
 }
 async function saveServer(){
   if(!account||evaluatorMode)return false;
   try{
    const response=await fetch('/api/customer-auth/studio/draft',{method:'PUT',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({draft:serializable()})});
    if(!response.ok)throw Error('Cloud draft unavailable');
    notify('saveStatus','Saved to account and device');return true;
   }catch{notify('saveStatus','Saved on this device · account sync unavailable');return false;}
 }
 function scheduleSave(){
   if(restoring)return;
   clearTimeout(saveTimer);clearTimeout(serverTimer);
   notify('saveStatus','Saving changes…');
   saveTimer=setTimeout(()=>{
     const ok=saveLocal();
     if(ok)notify('saveStatus',account&&!evaluatorMode?'Saved on device · syncing…':'Saved on this device');
   },220);
   if(account&&!evaluatorMode)serverTimer=setTimeout(saveServer,1600);
 }
 // Explicit project controls supplement autosave. Backups contain only a
 // portable creative draft: audio/photo and account credentials NEVER leave
 // this browser through a backup download.
 const projectBackup=window.CutLoopzProjectBackup;
 function updateProjectActions(){
   $('downloadStoryboard').disabled=scenes.length===0;
   $('downloadStoryboard').title=scenes.length?'Download all storyboard scenes':'Create your storyboard on Page 3 first';
 }
 function downloadText(filename,data,type){
   const blob=new Blob([data],{type});
   const address=URL.createObjectURL(blob);
   const link=document.createElement('a');link.href=address;link.download=filename;
   document.body.appendChild(link);link.click();link.remove();
   // Android Chrome may complete a download after the click handler returns.
   setTimeout(()=>URL.revokeObjectURL(address),15000);
 }
 async function saveNow(){
   clearTimeout(saveTimer);clearTimeout(serverTimer);
   if(!saveLocal())return;
   notify('saveStatus','Saved on this device');
   notify('projectTransferStatus','Your creative work was saved on this device.');
   if(account&&!evaluatorMode){
     const synced=await saveServer();
     notify('projectTransferStatus',synced?'Saved to your CutLoopz account and this device.':'Saved on this device; account sync was unavailable. Download a backup for extra protection.',!synced);
   }
 }
 function downloadStoryboard(){
   if(!scenes.length){notify('projectTransferStatus','Create a storyboard on Page 3 before downloading it.',true);return;}
   try{
     const name=projectBackup.safeName($('title').value);
     downloadText(`${name}-cutloopz-storyboard.txt`,projectBackup.storyboardText(serializable()),'text/plain;charset=utf-8');
     notify('projectTransferStatus',`Storyboard downloaded (${scenes.length} scenes).`);
   }catch(error){notify('projectTransferStatus','Could not download storyboard: '+error.message,true);}
 }
 function downloadProjectBackup(){
   try{
     const draft=serializable();
     // Avoid convincing artists that a completely blank backup preserved a project.
     if(![draft.title,draft.lyrics,draft.direction,draft.characterNotes,draft.songLink].some(value=>String(value||'').trim()) && !scenes.length){
       notify('projectTransferStatus','Nothing to back up yet. Add your song title, lyrics or Director notes before downloading.',true);
       return;
     }
     // Persist current work before exporting, even if they moved here quickly.
     saveLocal();
     const name=projectBackup.safeName(draft.title);
     const json=JSON.stringify(projectBackup.createBackup(draft),null,2)+'\n';
     downloadText(`${name}-cutloopz-backup.json`,json,'application/json;charset=utf-8');
     notify('projectTransferStatus','Project backup (.json) downloaded. Seeing text when opening the file is normal; use Restore Backup to load it in CutLoopz. For a readable copy, choose Download Storyboard.');
   }catch(error){notify('projectTransferStatus','Could not download backup: '+error.message,true);}
 }
 async function restoreProjectBackup(){
   const picker=$('projectBackupFile'),file=picker.files?.[0]||null;
   picker.value='';
   if(!file)return;
   if(file.size>projectBackup.MAX_IMPORT_BYTES){notify('projectTransferStatus','Backup is too large (max 1 MB).',true);return;}
   let draft;
   try{draft=projectBackup.parseBackup(await file.text());}
   catch(error){notify('projectTransferStatus',error.message,true);return;}
   if(!window.confirm('Restore this CutLoopz project? This replaces the current draft and clears locally stored song/photo selections. Download a backup first if you want to keep them.'))return;
   clearTimeout(saveTimer);clearTimeout(serverTimer);
   lastSongFile=null;lastPhotoFile=null;
   $('songAudio').value='';$('evaluationAudio').value='';$('artistPhoto').value='';updatePhotoPreview(null);
   const mediaClear=await Promise.allSettled([mediaWrite('audio',null),mediaWrite('photo',null)]);
   hydrate(draft);
   // Imported, portable creative work remains viewable even without its
   // original media files. Changing source inputs invalidates old scenes as usual.
   scenes=pendingRestore?.scenes||[];
   scenePage=Math.max(0,Math.min(Math.ceil(scenes.length/2)-1,Number(draft.scenePage)||0));
   pendingRestore=null;
   musicResult=null;analysisSourceKey='';storyboardSourceKey=scenes.length?storyKey():'';
   $('storyEmotion').textContent='Imported creative storyboard';
   renderAnalysis();updateProjectActions();
   showPage(scenes.length?3:0,{reposition:false});
   const locallySaved=saveLocal();
   if(account&&!evaluatorMode&&locallySaved)await saveServer();
   let message=`Project restored${scenes.length?` with ${scenes.length} editable scenes`:''}. Reattach your MP3/WAV and artist photo before generation.`;
   if(mediaClear.some(r=>r.status==='rejected'))message+=' Browser file cleanup failed; clear this site’s storage if you need to remove old media.';
   notify('projectTransferStatus',message,!locallySaved);
 }
 function hydrate(draft){
   if(!draft || typeof draft!=='object')return;
   restoring=true;
   selectedSource=evaluatorMode?(draft.source==='upload'?'upload':'link'):(draft.source==='link'||(!draft.source && draft.songLink && !draft.songName)?'link':'upload');
   $('songLink').value=(evaluatorMode||selectedSource==='link')?safeText(draft.songLink).slice(0,2048):'';
   syncSourceDisplay();
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
   $('songAudio').dataset.previousName=selectedSource==='upload'?safeText(draft.songName).slice(0,180):'';
   $('evaluationAudio').dataset.previousName=evaluatorMode?safeText(draft.songName).slice(0,180):'';
   $('artistPhoto').dataset.previousName=safeText(draft.photoName).slice(0,180);
   if(selectedSource==='upload'&&draft.songName)$('audioLabel').textContent=`Previously selected: ${draft.songName}. Reselect this file to analyze it again.`;
   if(evaluatorMode&&draft.songName)notify('evaluationAudioStatus',`Previously selected: ${draft.songName}. Checking if this device retained the audio…`);
   if(draft.photoName)$('photoLabel').textContent=`Previously selected: ${draft.photoName}. Reselect this photo before production.`;
   // Defer old output restoration until the original song file has actually
   // been restored and the recorded input signatures still match. Legacy
   // drafts with no signatures are not allowed to carry creative output.
   pendingRestore={musicResult:draft.musicResult,analysisSourceKey:safeText(draft.analysisSourceKey),
     storyboardSourceKey:safeText(draft.storyboardSourceKey),scenePage:Number(draft.scenePage)||0,
     scenes:Array.isArray(draft.scenes)?draft.scenes.slice(0,40).map(s=>({number:Number(s.number)||1,startSeconds:Number(s.startSeconds)||0,endSeconds:Number(s.endSeconds)||0,emotion:safeText(s.emotion).slice(0,55),location:safeText(s.location).slice(0,500),action:safeText(s.action).slice(0,800),prompt:safeText(s.prompt).slice(0,4000)})):[]};
   musicResult=null;analysisSourceKey='';scenes=[];storyboardSourceKey='';$('storyEmotion').textContent='';
   scenePage=Math.max(0,Math.min(Math.ceil(scenes.length/2)-1,Number(draft.scenePage)||0));
   page=Math.max(0,Math.min(4,Number(draft.page)||0));
   updateUploadLabels();refreshAnalysisIntro();renderAnalysis();showPage(page,{reposition:false});restoring=false;
 }
 async function initialize(){
   let localDraft=null,localUpdatedAt=0,serverUpdatedAt=0;
   try{
    const res=await fetch('/api/customer-auth/me',{credentials:'same-origin',cache:'no-store'});
    if(res.ok){const d=await res.json();account=d.user||d.customer||null;}
   }catch{}
   storageKey=storagePrefix+(account?.id?'account:'+account.id:'guest');
   $('signInStatus').textContent=evaluatorMode?'Free creative planning · No video':(account?`Signed in: ${account.name||account.email||'Artist'}`:'Guest Studio · Free tools');
   try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');localDraft=saved?.draft||null;localUpdatedAt=Number(saved?.at)||0;}catch{}
   let serverDraft=null;
   if(account&&!evaluatorMode){try{const r=await fetch('/api/customer-auth/studio/draft',{credentials:'same-origin',cache:'no-store'});if(r.ok){const response=await r.json();serverDraft=response.draft;serverUpdatedAt=Date.parse(response.updatedAt)||0;}}catch{}}
   // Use the most recent draft when account sync and local edits differ.
   hydrate(localDraft && (localUpdatedAt>=serverUpdatedAt || !serverDraft)?localDraft:serverDraft);
   const restoredName=evaluatorMode?$('evaluationAudio').dataset.previousName:$('songAudio').dataset.previousName;
   const restoredPhotoName=$('artistPhoto').dataset.previousName;
   try{
     const [audio,photo]=await Promise.all([mediaRead('audio'),mediaRead('photo')]);
     if((selectedSource==='upload'||evaluatorMode)&&audio&&audio.name===restoredName&&audio.size<=25*1024*1024&&/\.(mp3|wav)$/i.test(audio.name))lastSongFile=audio;
     if(selectedSource==='link'&&!evaluatorMode&&audio)mediaWrite('audio',null).catch(()=>{});
     if(photo&&photo.name===restoredPhotoName&&photo.size<=12*1024*1024&&['image/jpeg','image/png','image/webp'].includes(photo.type)){
       lastPhotoFile=photo;updatePhotoPreview(photo);
     }
   }catch{ /* A retained file is optional; the artist can select it again. */ }
   if(pendingRestore){
     const restored=pendingRestore;pendingRestore=null;
     if(lastSongFile && restored.analysisSourceKey && restored.analysisSourceKey===musicKey()
       && restored.musicResult && typeof restored.musicResult==='object'){
       musicResult=restored.musicResult;analysisSourceKey=restored.analysisSourceKey;
     }
     if(restored.storyboardSourceKey && restored.storyboardSourceKey===storyKey()){
       scenes=restored.scenes;
     }
     storyboardSourceKey=scenes.length?restored.storyboardSourceKey:'';
     scenePage=Math.max(0,Math.min(Math.ceil(scenes.length/2)-1,restored.scenePage));
   }
   renderAnalysis();updateProjectActions();if(page===3)renderScenes();
   const sourceParam=new URLSearchParams(location.search).get('source');
   if(evaluatorMode){
     const selected=new URLSearchParams(location.search).get('source');
     if(selected==='upload'||selected==='audio'||selected==='mp3')selectedSource='upload';
     else if(selected==='link'||['suno','udio','youtube','spotify','soundcloud','tiktok'].includes(selected))selectedSource='link';
   }
   else if(sourceParam==='link'||['suno','udio','youtube','spotify','soundcloud','tiktok'].includes(sourceParam)){
     if(!lastSongFile&&!$('songAudio').dataset.previousName)selectedSource='link';
   }else {selectedSource='upload';}
   syncSourceDisplay();updateUploadLabels();refreshAnalysisIntro();scheduleSave();
   if(evaluatorMode)showPage(page,{reposition:false});
   if(evaluatorMode)notify('evaluationAudioStatus',activeSongFile()?`Ready for beat analysis: ${activeSongFile().name}`:restoredName?`Please reselect ${restoredName} to analyze beats.`:'Choose an MP3 or WAV to analyze actual song audio.');
   if(selectedSource==='link'&&sourceParam)$('songLink').focus({preventScroll:true});
   // Deep links override the saved page, but do not reset any project fields.
   const urlPage=new URLSearchParams(location.search).get('step');
   const destination={song:0,analyze:1,director:2,storyboard:3,review:4}[urlPage];
   if(Number.isInteger(destination))showPage(destination,{reposition:false});
   notify('saveStatus',evaluatorMode?'Evaluation saved on this device':account?'Account draft ready':'Draft saved on this device');
   $('saveNow').disabled=false;$('downloadProjectBackup').disabled=false;$('restoreProjectBackup').disabled=false;$('restoreProjectQuick').disabled=false;
   if(!evaluatorMode)recoverGeneration();
 }
 // A saved song URL is not an analyzed audio file. Link-only projects bypass
 // the audio-only page; users can still supply lyrics and a photo on Page 1.
 function validSongLink(){return selectedSource==='link'&&window.CutLoopzSongLink?.inspect($('songLink').value)?.ok===true;}
 function linkOnlyProject(){return selectedSource==='link'&&validSongLink();}
 function pageAfter(action){
   if(evaluatorMode && page===0 && action==='next')return 2;
   if(evaluatorMode && page===2 && action==='back')return 0;
   return window.CutLoopzSongLink.navigation(page,action,{
     hasAudio: Boolean(activeSongFile()),linkAccepted:validSongLink()
   });
 }
 function updateStepNavigation(){
   $('nextBtn').textContent=page===4?'Back to Start':page===0 && (evaluatorMode||linkOnlyProject())?'Next: Listening Director →':'Next →';
   $('backBtn').textContent=page===2 && linkOnlyProject()?'← Song & Artist':'← Back';
   const note=$('directorSourceNotice');
   const link=selectedSource==='link'?window.CutLoopzSongLink?.inspect($('songLink').value):null;
   if(page===2 && link?.ok && !activeSongFile()){
     note.textContent=`${link.name} link saved. The audio has not been analyzed and lyrics have not been imported automatically. Use your lyrics and creative direction, or go Back to Page 1 to add them.`;
     note.hidden=false;
   }else{note.hidden=true;note.textContent='';}
 }
 // Keep mobile navigation anchored to the newly opened page, not the former
 // footer or artist-photo scroll position. Hydration must not jump the page.
 function showPage(index,{reposition=true}={}){
   page=Math.max(0,Math.min(4,index));
   document.querySelectorAll('.wizard-step').forEach(section=>{section.hidden=Number(section.dataset.step)!==page});
   $('stepTitle').textContent=pageTitles[page];$('stepSubtitle').textContent=pageDescriptions[page];
   // The free link evaluator skips the audio-only step: four visible stages.
   const visibleNumber=evaluatorMode?({0:1,2:2,3:3,4:4}[page]||1):page+1;
   const visibleTotal=evaluatorMode?4:5;
   $('stepTag').textContent=`PAGE ${String(visibleNumber).padStart(2,'0')} / ${String(visibleTotal).padStart(2,'0')}`;
   $('stepCounter').textContent=`Page ${visibleNumber} of ${visibleTotal}`;
   $('stepProgress').setAttribute('aria-valuemax',String(visibleTotal));
   $('stepProgress').setAttribute('aria-valuenow',String(visibleNumber));
   $('progressFill').style.width=`${100*visibleNumber/visibleTotal}%`;
   $('backBtn').disabled=page===0;updateStepNavigation();
   if(page===0)window.CutLoopzLyricsBoard?.refresh();
   if(page===1)refreshAnalysisIntro();
   updateActionAttention();
   if(page===3)renderScenes();if(page===4){renderReview();if(!evaluatorMode)checkEngine();}
   scheduleSave();
   if(reposition){
     const visibleHeading=page===0?$('songHeading'):document.querySelector(`.wizard-step[data-step="${page}"] h3`);
     // Explicit instant alignment prevents the previous step's scroll offset
     // lingering after Back/Next and avoids triggering the on-screen keyboard.
     visibleHeading?.scrollIntoView({block:'start',behavior:'instant'});
   }
 }
 function clearOrphanedStoryboard(){
   if(!scenes.length)return;
   const count=Math.ceil(selectedDuration()/Number($('sceneSeconds').value));
   if(count!==scenes.length)invalidateSongOutputs();
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
     updateStepNavigation();
     return false;
   }
   status.style.color='';
   status.textContent=`${parsed.name} link saved for creative evaluation. This link does not supply audio or generate a video.`;
   open.href=parsed.url;open.hidden=false;
   if(announce){scheduleSave();refreshAnalysisIntro();}
   updateStepNavigation();
   return true;
 }
 function syncSourceDisplay(){
   $('audioSourcePanel').hidden=selectedSource!=='upload';
   $('songLinkPanel').hidden=selectedSource!=='link';
   if(evaluatorMode){
     $('evaluationSourceTabs').hidden=false;
     $('freeBeatPanel').hidden=selectedSource!=='upload';
     for(const [mode,id] of [['link','evaluationLinkTab'],['upload','evaluationUploadTab']]){
       const tab=$(id),active=selectedSource===mode;
       tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
     }
   }
   for(const [mode,id] of [['upload','sourceUploadBtn'],['link','sourceLinkBtn']]){
     const button=$(id),active=selectedSource===mode;
     button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));
   }
 }
 function changeSongSource(mode){
   if(evaluatorMode){
     if(mode===selectedSource)return;
     selectedSource=mode;
     // Preserve the text of each input, but never combine them for evaluation.
     // Changing methods invalidates an analysis/storyboard from the other source.
     const url=new URL(window.location.href);url.searchParams.set('source',mode);
     window.history.replaceState(null,'',url.pathname+url.search+url.hash);
     invalidateSongOutputs({music:true});syncSourceDisplay();refreshAnalysisIntro();updateStepNavigation();scheduleSave();
     return;
   }
   if(mode===selectedSource)return;
   const currentHasSong=selectedSource==='upload'
     ?Boolean(lastSongFile||$('songAudio').dataset.previousName)
     :Boolean($('songLink').value.trim());
   if(currentHasSong&&!window.confirm('Change song source? This clears the current music selection, analysis and storyboard. Your lyrics, photo and director notes will remain.'))return;
   selectedSource=mode;
   if(mode==='link'){
     lastSongFile=null;$('songAudio').value='';$('songAudio').dataset.previousName='';
     $('audioLabel').textContent='Choose an MP3 or WAV (max 25 MB).';
     mediaWrite('audio',null).catch(()=>notify('saveStatus','The old audio file may still be in browser storage; you can clear it with New Project.',true));
   }else{
     $('songLink').value='';$('songLinkStatus').textContent='Paste a public song link for free creative planning (not for video generation).';
     $('openSongLink').hidden=true;$('openSongLink').removeAttribute('href');
   }
   invalidateSongOutputs({music:true});syncSourceDisplay();refreshAnalysisIntro();updateStepNavigation();scheduleSave();
   (mode==='link'?$('songLink'):$('songAudio')).focus({preventScroll:true});
 }
 function updateActionAttention(){
   $('analyzeBtn').classList.toggle('action-needs-attention',!musicResult&&$('analyzeBtn').dataset.engaged!=='true');
   $('directorBtn').classList.toggle('action-needs-attention',!scenes.length&&$('directorBtn').dataset.engaged!=='true');
 }
 function markActionEngaged(id){$(id).dataset.engaged='true';$(id).classList.remove('action-needs-attention');}
 function renderAnalysis(){
   if(!musicResult){$('analysisResult').hidden=true;$('evaluationBeatResult').hidden=true;return;}
   $('analysisResult').hidden=false;
   const summary=musicResult.summary||{};
   $('bpmValue').textContent=Number.isFinite(Number(summary.bpmEstimate))&&Number(summary.bpmEstimate)>0?`${Math.round(summary.bpmEstimate)} BPM`:'Uncertain';
   $('audioDurationValue').textContent=Number.isFinite(Number(summary.durationSeconds))?`${Math.round(summary.durationSeconds)} sec`:'—';
   $('energyValue').textContent=String(musicResult.plan?.scenes?.length||0);
   $('analysisCaveat').textContent=musicResult.note||'Tempo and energy are estimates; analysis does not transcribe vocals.';
   if(evaluatorMode){
     $('evaluationBeatResult').hidden=false;
     $('evaluationBpm').textContent=$('bpmValue').textContent;
     $('evaluationDuration').textContent=$('audioDurationValue').textContent;
     $('evaluationEnergy').textContent=$('energyValue').textContent;
     $('evaluationAnalysisNote').textContent=$('analysisCaveat').textContent;
   }
 }
 async function analyze(){
   const statusId=evaluatorMode?'evaluationAudioStatus':'analyzeStatus';
   if(!activeSongFile()){notify(statusId,evaluatorMode?'Select the MP3 / WAV tab and choose an audio file for beat analysis.':'The actual MP3/WAV file is missing. Tap Back, select it on Page 1, then return here. Or skip analysis and use the Director.',true);return;}
   if(lastSongFile.size>25*1024*1024){notify(statusId,'The song must be smaller than 25 MB.',true);return;}
   const form=new FormData();form.append('audio',activeSongFile());
   const btn=$(evaluatorMode?'evaluationAnalyzeBtn':'analyzeBtn');btn.disabled=true;notify(statusId,'Analyzing rhythm and intensity…');
   const expectedKey=musicKey(),version=sourceVersion;
   try{
    const response=await fetch('/api/creative-preview/music-analysis',{method:'POST',body:form});const payload=await response.json();
    if(!response.ok||!payload.ok)throw Error(payload.error||'Unable to analyze audio');
    if(version!==sourceVersion || expectedKey!==musicKey()){
      notify(statusId,'Song changed during analysis. Old result discarded; analyze the current file again.',true);return;
    }
    musicResult=payload;analysisSourceKey=expectedKey;scenes=[];storyboardSourceKey='';scenePage=0;
    renderAnalysis();updateActionAttention();scheduleSave();notify(statusId,'Song analysis complete for this selected file. Continue to the Director.');
   }catch(error){notify(statusId,error.message,true)}finally{btn.disabled=false;}
 }
 async function makeStoryboard(){
   const btn=$('directorBtn');btn.disabled=true;notify('directorStatus','Creating your numbered storyboard…');
   try{
    if(musicResult && analysisSourceKey!==musicKey()){
      musicResult=null;analysisSourceKey='';renderAnalysis();
    }
    const expectedKey=storyKey(),version=sourceVersion;
    const input={title:$('title').value||'Untitled Song',lyrics:$('lyrics').value,prompt:[ $('direction').value,$('characterNotes').value&&`Artist identity: ${$('characterNotes').value}`].filter(Boolean).join('\n').slice(0,4000),songSeconds:selectedDuration(),sceneSeconds:Number($('sceneSeconds').value),visualStyle:$('visualStyle').value,format:$('format').value,musicPlan:musicResult?.plan||null};
    const res=await fetch('/api/creative-preview/storyboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const data=await res.json();if(!res.ok||!data.ok)throw Error(data.error||'Cannot create storyboard');
    if(version!==sourceVersion || expectedKey!==storyKey()){
      notify('directorStatus','Inputs changed while creating the storyboard. Old result discarded.',true);return;
    }
    if(scenes.length&&!window.confirm('Replace the existing storyboard, including any manual edits?')){notify('directorStatus','Existing storyboard preserved.');return;}
    scenes=(data.plan.scenes||[]).map(s=>({number:s.number,startSeconds:s.startSeconds,endSeconds:s.endSeconds,emotion:s.emotion,location:s.location,action:s.action,prompt:s.prompt}));
    scenePage=0;storyboardSourceKey=expectedKey;updateActionAttention();updateProjectActions();
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
   const batchSize=2;
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
  const linked=selectedSource==='link'?window.CutLoopzSongLink?.inspect($('songLink').value):null;
  addReview('Music source',evaluatorMode?(selectedSource==='link'?(linked?.ok?`${linked.name} link reference`:'No link selected'):(activeSongFile()?'MP3/WAV for beat analysis':'No audio selected')):lastSongFile?'Uploaded MP3/WAV':linked?.ok?`${linked.name} link (audio upload required)`:'Not attached');if(linked?.ok)addReview('Song share link',linked.url);
  addReview('Song',$('title').value||'Untitled');addReview('Duration',`${selectedDuration()} seconds`);
  addReview('Style',$('visualStyle').value);addReview('Format',$('format').value==='landscape'?'16:9 Landscape':'9:16 Vertical');
  addReview('Director direction',$('direction').value.slice(0,350));addReview('Scenes',`${scenes.length} editable scenes`);
  addReview('Audio analysis',musicResult?'Completed':'Not run');addReview('Artist reference',lastPhotoFile?.name||$('artistPhoto').dataset.previousName||'Not selected');
 }
 function newProject(){
   if(!window.confirm('Start a new project? Your current saved draft will be cleared.'))return;
   const oldKey=storageKey;localStorage.removeItem(oldKey);
   Promise.all([mediaWrite('audio',null),mediaWrite('photo',null)]).catch(()=>notify('saveStatus','Project reset; stored files could not be cleared. Clear site data in browser settings.',true));
   if(account&&!evaluatorMode)fetch('/api/customer-auth/studio/draft',{method:'DELETE',credentials:'same-origin'}).catch(()=>{});
   for(const id of fieldNames){const element=$(id);element.value=element.tagName==='SELECT'?element.options[0].value:'';}
   selectedSource=evaluatorMode?'link':'upload';syncSourceDisplay();
   $('songLinkStatus').textContent='Paste a public song link for free creative planning (not for video generation).';$('songLinkStatus').style.color='';$('openSongLink').hidden=true;$('openSongLink').removeAttribute('href');
   $('duration').value='30';$('customTime').value='';syncCustomTime();$('sceneSeconds').value='15';$('format').value='vertical';$('songAudio').value='';$('evaluationAudio').value='';$('artistPhoto').value='';
   $('songAudio').dataset.previousName='';$('evaluationAudio').dataset.previousName='';$('artistPhoto').dataset.previousName='';lastSongFile=null;lastPhotoFile=null;
   notify('evaluationAudioStatus','Choose an MP3 or WAV to analyze actual song audio.');
   $('audioLabel').textContent='Choose an audio file for beat-informed analysis. Maximum 25 MB.';
   $('photoLabel').textContent='JPG, PNG or WebP · Max 12 MB · One reference photo in the standard Studio.';
   updatePhotoPreview(null);
   sourceVersion++;scenes=[];musicResult=null;analysisSourceKey='';storyboardSourceKey='';pendingRestore=null;$('storyEmotion').textContent='';
   scenePage=0;$('analyzeBtn').dataset.engaged='';$('directorBtn').dataset.engaged='';updateActionAttention();updateProjectActions();renderAnalysis();notify('directorStatus','');notify('analyzeStatus','');showPage(0);
 }
 for(const id of fieldNames){
   const input=$(id);
   input.addEventListener('input',()=>{
     if(['title','songLink','lyrics','direction','characterNotes','visualStyle','format','duration','sceneSeconds'].includes(id))
       invalidateSongOutputs({music:['title','songLink'].includes(id)});
     else scheduleSave();
   });
   input.addEventListener('change',()=>scheduleSave());
 }
 // Both sources are mutually exclusive in the free evaluator. Arrow keys work like standard tabs.
 for(const [mode,id] of [['link','evaluationLinkTab'],['upload','evaluationUploadTab']]){
   $(id).addEventListener('click',()=>changeSongSource(mode));
   $(id).addEventListener('keydown',event=>{
     if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
     event.preventDefault();
     const next=event.key==='Home'?'link':event.key==='End'?'upload':mode==='link'?'upload':'link';
     changeSongSource(next);$(next==='link'?'evaluationLinkTab':'evaluationUploadTab').focus();
   });
 }
 $('sourceUploadBtn').addEventListener('click',()=>changeSongSource('upload'));
 $('sourceLinkBtn').addEventListener('click',()=>changeSongSource('link'));
 $('useSongLink').addEventListener('click',()=>{renderLinkStatus(true)});
 $('songLink').addEventListener('input',()=>{const a=$('openSongLink');a.hidden=true;a.removeAttribute('href');$('songLinkStatus').textContent='Tap Use Link to confirm this source.';updateStepNavigation();});
 $('songLink').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();renderLinkStatus(true);}});
 $('duration').addEventListener('change',()=>{syncCustomTime();invalidateSongOutputs()});
 $('customTime').addEventListener('input',()=>invalidateSongOutputs());
 window.addEventListener('resize',()=>{if(page===3)renderScenes()});
 $('songAudio').addEventListener('change',()=>{
   if(selectedSource!=='upload')return;
   $('songLink').value='';
   const f=$('songAudio').files?.[0]||null;
   if(f && (!/\.(mp3|wav)$/i.test(f.name)||f.size>25*1024*1024)){alert('Select an MP3 or WAV under 25 MB.');$('songAudio').value='';lastSongFile=null;invalidateSongOutputs({music:true});return;}
   lastSongFile=f;invalidateSongOutputs({music:true});updateActionAttention();
   $('songAudio').dataset.previousName=f?.name||'';
   updateUploadLabels();refreshAnalysisIntro();updateStepNavigation();scheduleSave();
   mediaWrite('audio',f).catch(()=>notify('audioLabel',`Selected: ${f?.name||'none'}. Browser could not retain this file after refresh; keep this page open until analysis.`,true));
 });
 $('evaluationAudio').addEventListener('change',()=>{
   if(!evaluatorMode||selectedSource!=='upload')return;
   const f=$('evaluationAudio').files?.[0]||null;
   if(f && (!/\.(mp3|wav)$/i.test(f.name)||f.size>25*1024*1024||!f.size)){
     notify('evaluationAudioStatus','Choose an MP3 or WAV under 25 MB.',true);
     $('evaluationAudio').value='';return;
   }
   lastSongFile=f;
   $('evaluationAudio').dataset.previousName=f?.name||'';
   invalidateSongOutputs({music:true});updateActionAttention();refreshAnalysisIntro();updateStepNavigation();scheduleSave();
   notify('evaluationAudioStatus',f?`Ready for free beat analysis: ${f.name}`:'Song audio cleared. Links and lyrics still work.');
   mediaWrite('audio',f).catch(()=>notify('evaluationAudioStatus',`Ready: ${f?.name||'no file'}; browser may not retain this upload after refresh.`,true));
 });
 $('evaluationAnalyzeBtn').addEventListener('click',()=>analyze());
 $('artistPhoto').addEventListener('change',()=>{
   const f=$('artistPhoto').files?.[0]||null;
   if(f&&(!/\.(png|jpe?g|webp)$/i.test(f.name)||!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>12*1024*1024)){
     alert('Choose a JPG, PNG or WebP under 12 MB.');$('artistPhoto').value='';lastPhotoFile=null;invalidateSongOutputs();updatePhotoPreview(null);return;
   }
   lastPhotoFile=f;invalidateSongOutputs();
   $('artistPhoto').dataset.previousName=f?.name||'';
   updatePhotoPreview(f);updateUploadLabels();scheduleSave();
   mediaWrite('photo',f).catch(()=>notify('photoLabel',`Selected: ${f?.name||'none'}. Browser could not retain this photo after refresh.`,true));
 });
 $('nextBtn').addEventListener('click',()=>{
   if(page===0){
     if(!Number.isFinite(selectedDuration())){alert('Enter a valid custom duration between 0:15 and 6:00.');return;}
     if(evaluatorMode){
       if(selectedSource==='link'&&!renderLinkStatus(true)){$('songLink').focus();return;}
       if(selectedSource==='upload'&&!activeSongFile()){
         notify('evaluationAudioStatus','Choose an MP3 or WAV to evaluate, or switch to Song Link.',true);$('evaluationAudio').focus();return;
       }
     }
     // Only validate the link when it is the selected input.
     if(!evaluatorMode && selectedSource==='link' && $('songLink').value.trim()&&!renderLinkStatus(true)){$('songLink').focus();return;}
   }
   showPage(pageAfter('next'));
 });
 $('backBtn').addEventListener('click',()=>showPage(pageAfter('back')));
 $('analyzeBtn').addEventListener('click',()=>{markActionEngaged('analyzeBtn');return analyze()});
 $('directorBtn').addEventListener('click',()=>{markActionEngaged('directorBtn');return makeStoryboard()});
 $('scenePrev').addEventListener('click',()=>{scenePage=Math.max(0,scenePage-1);renderScenes();scheduleSave()});
 $('sceneNext').addEventListener('click',()=>{scenePage=Math.min(Math.ceil(scenes.length/2)-1,scenePage+1);renderScenes();scheduleSave()});
 $('saveNow').addEventListener('click',saveNow);
 $('downloadStoryboard').addEventListener('click',downloadStoryboard);
 $('downloadProjectBackup').addEventListener('click',downloadProjectBackup);
 $('restoreProjectBackup').addEventListener('click',()=>$('projectBackupFile').click());
 $('restoreProjectQuick').addEventListener('click',()=>$('projectBackupFile').click());
 $('projectBackupFile').addEventListener('change',restoreProjectBackup);
 $('checkEngine').addEventListener('click',checkEngine);$('generateVideo').addEventListener('click',generateVideo);
 $('resumeGeneration').addEventListener('click',resumeProduction);
 $('editSong').addEventListener('click',()=>showPage(0));$('editDirector').addEventListener('click',()=>showPage(2));$('editStoryboard').addEventListener('click',()=>showPage(3));$('newProject').addEventListener('click',newProject);
 if(evaluatorMode){
   document.title='Free Song Evaluation | CutLoopz Media';
   $('navCreateVideo').classList.remove('active');$('navFreeEvaluation').classList.add('active');
   $('studioMainTitle').textContent='Free Song Evaluation';
   $('studioMainIntro').textContent='Choose Song Link or MP3 / WAV to evaluate your music for free. Each method has its own instructions. No video is created.';
   $('songHeading').textContent='01 · Evaluate your song';
   $('durationLabel').textContent='Storyboard concept length';
   $('evaluationWelcome').hidden=false;
   $('reviewIntro').textContent='Review your free creative concept. Save or download your storyboard — no video is being generated.';
   pageTitles[0]='Evaluate Your Song';pageDescriptions[0]='Choose one source, then add lyrics for your Director concept.';
   $('studioPrivacyNote').textContent='Your free evaluation draft saves on this device. Uploaded audio is temporarily processed for beat analysis and deleted from the server afterward; your browser may retain a local copy for this project. No video is generated. Save your storyboard or project backup before clearing this browser.';
   pageDescriptions[4]='Save your free creative planning and storyboard.';
 }
 const lyricsField=$('lyrics');
 lyricsField.addEventListener('paste',()=>requestAnimationFrame(()=>{lyricsField.scrollTop=0;}));
 lyricsField.addEventListener('blur',()=>{lyricsField.scrollTop=0;});
 syncSourceDisplay();updateActionAttention();
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
