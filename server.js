import express from 'express';
import multer from 'multer';
import { fal } from '@fal-ai/client';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.FAL_MODEL || 'bytedance/seedance-2.5/text-to-video';
const OUT = path.resolve('outputs');
await fs.mkdir(OUT, { recursive: true });
if (process.env.FAL_KEY) fal.config({ credentials: process.env.FAL_KEY });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
app.use(express.static('public'));
app.use('/outputs', express.static(OUT));

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args); let stderr = '';
    p.stderr.on('data', d => stderr += d.toString());
    p.on('error', reject); p.on('close', code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2500) || `${cmd} exited ${code}`)));
  });
}
async function download(url, dest) {
  const r = await fetch(url); if (!r.ok) throw new Error(`Could not download generated clip (${r.status})`);
  await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
}
function promptFor(base, i, n, format, title) {
  const beats = ['Establish the visual world and mood','Introduce the lead performer and central story','Build the narrative with expressive movement','Create a memorable visual moment','Raise the energy with dynamic camera movement','Deliver the emotional turning point','Show a striking performance or story payoff','Resolve the visual story with a memorable final image'];
  return `Music video for the song ${title}. Full creative direction: ${base}. This is shot ${i+1} of ${n}; shot purpose: ${beats[Math.min(beats.length-1, Math.floor(i*8/n))]}. Maintain coherent art direction, believable motion, polished cinematic lighting, and continuity with the overall concept. No captions, watermarks, logos, or random scene changes. Aspect ratio ${format === 'vertical' ? '9:16 vertical, subject composed safely for mobile viewing' : '16:9 landscape widescreen'}. Generate a visually compelling standalone segment that can be edited into a continuous music video.`;
}
app.post('/api/create', upload.single('audio'), async (req, res) => {
  const id = randomUUID(); const work = path.join(os.tmpdir(), `mv-${id}`); await fs.mkdir(work, { recursive: true });
  try {
    if (!process.env.FAL_KEY) return res.status(400).json({ error: 'Video generation is not connected yet. Add your FAL_KEY to the .env file, then restart the app.' });
    if (!req.file) return res.status(400).json({ error: 'Upload your Suno audio first.' });
    const concept = String(req.body.prompt || '').trim();
    if (!concept) return res.status(400).json({ error: 'Enter a video prompt first.' });
    const format = req.body.format === 'landscape' ? 'landscape' : 'vertical';
    const title = String(req.body.title || 'Untitled Song').slice(0, 120);
    const audioPath = path.join(work, 'original-audio'); await fs.writeFile(audioPath, req.file.buffer);
    const probe = await new Promise((resolve, reject) => {
      const p = spawn('ffprobe', ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audioPath]); let out=''; p.stdout.on('data',d=>out+=d); p.on('error',reject); p.on('close',c=>c===0?resolve(Number(out.trim())):reject(new Error('ffprobe is required; install FFmpeg.')));
    });
    if (!Number.isFinite(probe) || probe < 1) throw new Error('Could not read the uploaded audio duration. Try an MP3 or WAV file.');
    // Keep each generated segment within common text-to-video duration limits.
    const clipSeconds = 10; const count = Math.ceil(probe / clipSeconds);
    if (count > 120) throw new Error('This track is too long for one generation job.');
    res.setHeader('Content-Type','application/json');
    // Generate clips sequentially to avoid surprising API concurrency and cost spikes.
    const clips = [];
    for (let i=0; i<count; i++) {
      const duration = String(Math.min(15, Math.max(4, Math.ceil(Math.min(clipSeconds, probe - i*clipSeconds)))));
      const result = await fal.subscribe(MODEL, { input: { prompt: promptFor(concept, i, count, format, title), duration, aspect_ratio: format === 'vertical' ? '9:16' : '16:9', resolution: '720p', generate_audio: false }, logs: false });
      const url = result?.data?.video?.url || result?.video?.url;
      if (!url) throw new Error(`Video service returned no clip for scene ${i+1}.`);
      const clip = path.join(work, `clip-${String(i).padStart(4,'0')}.mp4`); await download(url, clip); clips.push(clip);
    }
    // Normalize generated clips and concatenate before replacing their audio with the user's full song.
    const normalized=[];
    for(let i=0;i<clips.length;i++){
      const p=path.join(work,`norm-${String(i).padStart(4,'0')}.mp4`); const vf=format==='vertical'?'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=24,setsar=1':'scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setsar=1';
      await run('ffmpeg',['-y','-i',clips[i],'-vf',vf,'-an','-c:v','libx264','-preset','veryfast','-pix_fmt','yuv420p','-r','24',p]); normalized.push(p);
    }
    const list=path.join(work,'concat.txt'); await fs.writeFile(list,normalized.map(p=>`file '${p.replaceAll("'", "'\\''")}'`).join('\n'));
    const silent=path.join(work,'joined.mp4'); await run('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',silent]);
    const outputName=`${id}.mp4`; const finalPath=path.join(OUT,outputName);
    await run('ffmpeg',['-y','-i',silent,'-i',audioPath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(probe),'-movflags','+faststart',finalPath]);
    res.json({ ok:true, url:`/outputs/${outputName}`, duration:probe, format, scenes:count });
  } catch (e) {
    console.error(e); if (!res.headersSent) res.status(500).json({ error: e.message || 'Video generation failed.' });
  } finally { await fs.rm(work,{recursive:true,force:true}).catch(()=>{}); }
});
app.listen(PORT, () => console.log(`Music Video Studio running at http://localhost:${PORT}`));
