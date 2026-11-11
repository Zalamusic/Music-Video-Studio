/**
 * CutLoopz no-charge creative tools. No GPU, payment, or provider calls.
 * Public access is rate limited. Privileged production routes are unchanged.
 */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {analyzeMusic} from './music-intelligence-engine.js';
import {createStoryIntelligencePlan} from './cutloopz-story-intelligence.js';

const windowMs = 60 * 60 * 1000;
const attempts = new Map();
let activeAudio = 0;
const str = (v, n) => typeof v === 'string' ? v.trim().slice(0,n) : '';

export function looksLikeAudio(file) {
 if(!file || !Buffer.isBuffer(file.buffer) || file.buffer.length < 12)return false;
 const b=file.buffer;
 const wav=b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WAVE';
 const mp3=b.toString('ascii',0,3)==='ID3' || (b[0]===0xff && (b[1]&0xe0)===0xe0);
 return (wav && /\.wav$/i.test(file.originalname)) || (mp3 && /\.mp3$/i.test(file.originalname));
}
export function rateGate(req, category, max, now=Date.now()) {
 const key=`${String(req.ip || 'unknown')}:${category}`;
 if (attempts.size>3000) for(const [k,v] of attempts) if(now-v.started>windowMs) attempts.delete(k);
 const prev=attempts.get(key);
 if(!prev || now-prev.started>windowMs){attempts.set(key,{started:now,count:1});return false;}
 prev.count+=1;
 return prev.count>max;
}
export function safeMusicPlan(plan){
 if(!plan || typeof plan!=='object') return null;
 const scenes=Array.isArray(plan.scenes)?plan.scenes.slice(0,72):[];
 return {
  bpmEstimate:Number.isFinite(Number(plan.bpmEstimate))?Math.max(0,Math.min(300,Number(plan.bpmEstimate))):null,
  scenes: scenes.map(s=>({
   startSeconds:Number(s.startSeconds),endSeconds:Number(s.endSeconds),
   intensity:str(s.intensity,16),energyChange:str(s.energyChange,24)
  })).filter(s=>Number.isFinite(s.startSeconds)&&Number.isFinite(s.endSeconds)&&s.startSeconds>=0&&s.endSeconds>s.startSeconds&&s.endSeconds<=360)
 };
}
export function validateStory(body){
 if(!body || typeof body!=='object' || Array.isArray(body))throw Error('Invalid creative request.');
 if(typeof body.lyrics!=='string' || body.lyrics.length>12000)throw Error('Lyrics must be under 12,000 characters.');
 if(typeof body.prompt!=='string' || body.prompt.length>4000)throw Error('Creative direction must be under 4,000 characters.');
 const seconds=Number(body.songSeconds), sceneSeconds=Number(body.sceneSeconds||15);
 if(!Number.isFinite(seconds)||seconds<15||seconds>360)throw Error('Video duration must be between 15 seconds and 6 minutes.');
 if(!Number.isInteger(sceneSeconds)||sceneSeconds<3||sceneSeconds>30)throw Error('Scene length must be between 3 and 30 seconds.');
 return {title:str(body.title,120)||'Untitled Song',lyrics:body.lyrics,songSeconds:seconds,
  prompt:body.prompt,format:body.format==='landscape'?'landscape':'vertical',sceneSeconds,
  visualStyle:str(body.visualStyle,120)||'cinematic realism',musicPlan:safeMusicPlan(body.musicPlan)};
}
export function createCreativePreviewRouter({express,multer}={}){
 if(!express||!multer)throw Error('Express and multer required');
 const router=express.Router();
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024,files:1,fields:0}});
 router.use((_req,res,next)=>{res.set('Cache-Control','no-store');next()});
 router.post('/music-analysis', (req,res,next)=>{
   if(rateGate(req,'audio',4))return res.status(429).json({ok:false,error:'Free song analysis limit reached. Try again later.'});
   if(activeAudio>=2)return res.status(503).json({ok:false,error:'Song analysis is busy. Try again shortly.'});
   upload.single('audio')(req,res,error=>{
    if(error)return res.status(400).json({ok:false,error:'Use an MP3 or WAV file under 25 MB.'});
    next();
   });
  }, async(req,res)=>{
   if(!looksLikeAudio(req.file))return res.status(400).json({ok:false,error:'Select a valid MP3 or WAV audio file.'});
   activeAudio++;
   const base=path.join(tmpdir(),'cutloopz-free-analysis-'+randomUUID());
   try{
    await fs.mkdir(base,{recursive:true,mode:0o700});
    const file=path.join(base,'song'+(req.file.originalname.toLowerCase().endsWith('.wav')?'.wav':'.mp3'));
    await fs.writeFile(file,req.file.buffer,{mode:0o600});
    const plan=await analyzeMusic(file,{maxAnalysisSeconds:360,maxSceneSeconds:15,minSceneSeconds:6});
    res.json({ok:true,plan:safeMusicPlan(plan),summary:{durationSeconds:plan.durationSeconds,bpmEstimate:plan.bpmEstimate,
      bpmConfidence:plan.bpmConfidence,analysis:plan.analysis,detectedAccents:plan.detectedAccents},
      note:'Beat and energy measurements are estimates, not vocal recognition or genre classification.'});
   }catch(error){res.status(422).json({ok:false,error:'Unable to analyze this audio file. Try another MP3 or WAV.'})}
   finally{activeAudio--;await fs.rm(base,{recursive:true,force:true}).catch(()=>{})}
  });
 router.post('/storyboard',(req,res)=>{
  if(rateGate(req,'story',24))return res.status(429).json({ok:false,error:'Free Director limit reached. Try again later.'});
  try{
    const input=validateStory(req.body);
    const plan=createStoryIntelligencePlan(input);
    res.json({ok:true,plan,note:'Free creative planning only; no video generated or payment processed.'});
  }catch(error){res.status(400).json({ok:false,error:error.message})}
 });
 return router;
}
