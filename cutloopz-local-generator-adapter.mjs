/** Local-only generator transport. No cloud fallback, billing, or automatic retries.
 * Contract: POST /jobs multipart -> {ok:true,id:UUID,status:'queued'|'processing'}
 * GET /jobs/:id -> {ok:true,status:'queued'|'processing'|'ready'|'failed'}
 * GET /jobs/:id/video -> MP4 bytes. This is a transport, NOT a generator/model.
 */
import {promises as fs} from 'node:fs';
import path from 'node:path';
const MAX_SONG_BYTES=32*1024*1024;
const MAX_PHOTO_BYTES=12*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function createLocalGeneratorAdapter({endpoint,fetchImpl=fetch}={}){
 let root;try{root=new URL(endpoint)}catch{throw Error('Invalid local generator URL')}
 if(root.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(root.hostname)||root.username||root.password||root.search||root.hash||root.pathname!=='/')throw Error('Generator must be a plain HTTP loopback root URL');
 const url=route=>new URL(route,root);
 const request=async(route,opts={})=>{
  const r=await fetchImpl(url(route),{...opts,signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!r.ok)throw Error(`Local generator HTTP ${r.status}`);
  const b=await r.json();if(b?.ok!==true)throw Error('Invalid local generator response');return b;
 };
 return {
  async health(){const b=await request('health');return {ok:true,modelLoaded:b.modelLoaded===true,modelId:typeof b.modelId==='string'?b.modelId:null}},
  async submit({songPath,photoPath,startSeconds,format='landscape',allowPaidTest}={}){
   if(!['vertical','landscape'].includes(format))throw Error('Invalid video orientation');
   if(allowPaidTest!=='yes')throw Error('Explicit generation authorization required');
   if(!Number.isFinite(startSeconds)||startSeconds<0||startSeconds>355||startSeconds%5)throw Error('Invalid clip start');
   const songInfo=await fs.stat(songPath),photoInfo=await fs.stat(photoPath);
   if(!songInfo.isFile()||songInfo.size<12||songInfo.size>MAX_SONG_BYTES)throw Error('Generator song size outside limits');
   if(!photoInfo.isFile()||photoInfo.size<12||photoInfo.size>MAX_PHOTO_BYTES)throw Error('Generator photo size outside limits');
   const song=await fs.readFile(songPath),photo=await fs.readFile(photoPath);
   if(song.length>MAX_SONG_BYTES||photo.length>MAX_PHOTO_BYTES)throw Error('Generator upload exceeds size limit');
   const wav=song.toString('ascii',0,4)==='RIFF'&&song.toString('ascii',8,12)==='WAVE';
   const mp3=song.toString('ascii',0,3)==='ID3'||(song[0]===0xff&&(song[1]&0xe0)===0xe0);
   if(!wav&&!mp3)throw Error('Generator song must be MP3 or WAV');
   const jpeg=photo[0]===0xff&&photo[1]===0xd8;
   const png=photo.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
   const webp=photo.toString('ascii',0,4)==='RIFF'&&photo.toString('ascii',8,12)==='WEBP';
   if(!jpeg&&!png&&!webp)throw Error('Generator photo must be JPEG, PNG, or WebP');
   const form=new FormData();
   form.set('song',new Blob([song],{type:wav?'audio/wav':'audio/mpeg'}),wav?'song.wav':'song.mp3');
   form.set('photo',new Blob([photo],{type:png?'image/png':webp?'image/webp':'image/jpeg'}),png?'photo.png':webp?'photo.webp':'photo.jpg');
   form.set('startSeconds',String(startSeconds));form.set('durationSeconds','5');form.set('format',format);
   const b=await request('jobs',{method:'POST',body:form});if(!uuid.test(b.id||'')||!['queued','processing'].includes(b.status))throw Error('Invalid generator job receipt');return b;
  },
  async status(id){if(!uuid.test(id||''))throw Error('Invalid job ID');const b=await request(`jobs/${id}`);if(!['queued','processing','ready','failed'].includes(b.status))throw Error('Invalid generator status');return b},
  async download(id,destination){if(!uuid.test(id||'')||!path.isAbsolute(destination||''))throw Error('Invalid download arguments');const r=await fetchImpl(url(`jobs/${id}/video`),{signal:AbortSignal.timeout(120000),redirect:'error'});if(!r.ok)throw Error(`Local video HTTP ${r.status}`);const len=Number(r.headers?.get?.('content-length'));if(Number.isFinite(len)&&len>120*1024*1024)throw Error('Video exceeds size limit');const maxBytes=120*1024*1024;
   await fs.mkdir(path.dirname(destination),{recursive:true});
   const temp=destination+'.partial';
   let total=0;let header=Buffer.alloc(0);
   let handle;
   try{
    handle=await fs.open(temp,'wx');
    const accept=async chunk=>{
     const bytes=Buffer.from(chunk);total+=bytes.length;
     if(total>maxBytes)throw Error('Video exceeds size limit');
     if(header.length<16)header=Buffer.concat([header,bytes.subarray(0,16-header.length)]);
     await handle.writeFile(bytes);
    };
    if(r.body?.getReader){
     const reader=r.body.getReader();
     try{while(true){const {done,value}=await reader.read();if(done)break;await accept(value)}}
     catch(e){await reader.cancel().catch(()=>{});throw e}
     finally{reader.releaseLock()}
    }else{await accept(await r.arrayBuffer())}
    if(total<1000||total>maxBytes)throw Error('Video size outside limits');
    if(header.length<8||header.toString('ascii',4,8)!=='ftyp'||header.readUInt32BE(0)<8||header.readUInt32BE(0)>total)throw Error('Generator returned invalid MP4 data');
    await handle.close();handle=null;
    await fs.rename(temp,destination);
   }catch(e){if(handle)await handle.close().catch(()=>{});await fs.rm(temp,{force:true}).catch(()=>{});throw e}
   return destination}
 };
}
