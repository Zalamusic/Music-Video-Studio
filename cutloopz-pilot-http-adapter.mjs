import {promises as fs} from 'node:fs';
import path from 'node:path';

/** Connects the durable coordinator to the existing admin Performance Pilot.
 * Requires an explicitly supplied server origin and admin key; no default paid requests.
 * This adapter never retries a POST, because a timeout could represent a billed request.
 */
export function createPilotHttpAdapter({origin,adminKey,fetchImpl=fetch,basePath='/api/performance-pilot'}={}){
 if(!/^https?:\/\//.test(origin||'') || !adminKey)throw Error('Pilot origin and admin key are required');
 const root=new URL(basePath.replace(/\/$/,'')+'/',origin.endsWith('/')?origin:origin+'/');
 const url=route=>new URL(route.replace(/^\//,''),root);
 const headers={'X-Video-Admin-Key':adminKey};
 async function parse(response){let body;try{body=await response.json()}catch{throw Error(`Pilot returned non-JSON HTTP ${response.status}`)}if(!response.ok || body.ok===false)throw Error(body.error||`Pilot HTTP ${response.status}`);return body}
 return {
  async submit({songPath,photoPath,startSeconds,allowPaidTest,guidance='',lyricExcerpt=''}){
   if(allowPaidTest!=='yes')throw Error('Paid generation must be explicitly authorized');
   const form=new FormData();
   form.set('song',new Blob([await fs.readFile(songPath)]),'song.mp3');
   const photoBytes=await fs.readFile(photoPath);
   const mime=photoBytes[0]===0xff&&photoBytes[1]===0xd8?'image/jpeg':photoBytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':photoBytes.toString('ascii',0,4)==='RIFF'&&photoBytes.toString('ascii',8,12)==='WEBP'?'image/webp':null;
   if(!mime)throw Error('Reference photo must be a valid JPEG, PNG, or WebP image');
   const ext=mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':'png';
   form.set('photo',new Blob([photoBytes],{type:mime}),`artist.${ext}`);
   form.set('startSeconds',String(startSeconds));form.set('allowPaidTest','yes');
   form.set('guidance',String(guidance));form.set('lyricExcerpt',String(lyricExcerpt));
   const result=await parse(await fetchImpl(url('test'),{method:'POST',headers,body:form}));
   if(!result.id || !['queued','processing'].includes(result.status))throw Error('Pilot did not confirm queued generation');
   return result;
  },
  async status(id){if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('Invalid pilot ID');return parse(await fetchImpl(url(`test/${id}`),{headers}));},
  async download(id,destination){
   if(!/^[0-9a-f-]{36}$/i.test(id)||!path.isAbsolute(destination||''))throw Error('Invalid download arguments');
   const response=await fetchImpl(url(`test/${id}/video`),{headers});
   if(!response.ok)throw Error(`Pilot video download failed: HTTP ${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());
   if(bytes.length<1000 || bytes.length>120*1024*1024)throw Error('Pilot video size outside allowed range');
   await fs.mkdir(path.dirname(destination),{recursive:true});
   const temp=destination+'.partial';await fs.writeFile(temp,bytes);await fs.rename(temp,destination);
   return destination;
  }
 };
}
