
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {assemblyManifest} from './cutloopz-performance-job.js';
function run(command,args){return new Promise((resolve,reject)=>{const p=spawn(command,args,{shell:false,stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',b=>err+=String(b));p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error(`${command} failed: ${err.slice(-500)}`)));});}
export async function assemblePerformanceJob(job,{originalSongPath,outputPath,workDir,runCommand=run}={}){
 const manifest=assemblyManifest(job);
 if(!path.isAbsolute(originalSongPath||'')||!path.isAbsolute(outputPath||'')||!path.isAbsolute(workDir||''))throw Error('Absolute paths required');
 await fs.mkdir(workDir,{recursive:true});
 const clips=manifest.segments;
 for(const c of clips){if(!path.isAbsolute(c.videoPath))throw Error('Absolute clip paths required');await fs.access(c.videoPath);}
 await fs.access(originalSongPath);
 // Normalize each clip to the requested five-second window; concat without audio to avoid
 // gaps or doubled sound, then lay the original recording across the complete result.
 const normalized=[];
 for(const c of clips){
  const p=path.join(workDir,`normalized-${String(c.number).padStart(3,'0')}.mp4`);
  await runCommand('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',c.videoPath,'-an','-vf','fps=24,scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration=5','-t','5','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',p]);
  normalized.push(p);
 }
 const list=path.join(workDir,'concat.txt');
 await fs.writeFile(list,normalized.map(p=>`file '${p.replaceAll("'","'\\''")}'`).join('\n')+'\n');
 const silent=path.join(workDir,'silent.mp4');
 await runCommand('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
 await runCommand('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',silent,'-i',originalSongPath,'-map','0:v:0','-map','1:a:0','-t',String(manifest.durationSeconds),'-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',outputPath]);
 const actualSeconds=await new Promise((resolve,reject)=>{const p=spawn('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',outputPath],{shell:false});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('close',code=>code===0?resolve(Number(out.trim())):reject(Error('Cannot verify assembled video duration')))});
 if(!Number.isFinite(actualSeconds)||Math.abs(actualSeconds-manifest.durationSeconds)>0.25)throw Error(`Assembled video duration mismatch: ${actualSeconds} vs ${manifest.durationSeconds}`);
 return {outputPath,expectedDurationSeconds:manifest.durationSeconds,actualDurationSeconds:actualSeconds,technicalVerification:'duration-verified',lipSyncVerified:false,identityVerified:false,deliveryAuthorized:false};
}
