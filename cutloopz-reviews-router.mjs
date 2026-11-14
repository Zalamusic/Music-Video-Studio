/** Private CutLoopz customer feedback. No publicly readable reviews or testimonials.
 * - A signed-in CutLoopz artist may submit one review every 10 minutes.
 * - Only the explicitly configured signed-in owner can read/delete reviews.
 * - Saved as small, private JSON records under OUTPUT_DIR; no audio, photos or video bytes.
 */
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const MAX_REVIEW_LENGTH = 2500;
const REVIEW_COOLDOWN_MS = 10 * 60 * 1000;

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true; // Non-browser clients can omit Origin but must be authenticated.
  try {
    const url = new URL(origin);
    return ['https:','http:'].includes(url.protocol) && url.host === req.get('host');
  } catch { return false; }
}
export function createCutLoopzReviewsRouter({express, outputDirectory, authenticatedUser, isOwner}) {
  if (!express || !outputDirectory || !authenticatedUser || !isOwner) throw Error('CutLoopz reviews router configuration incomplete');
  const router=express.Router();
  const dir=path.join(outputDirectory,'cutloopz-private-reviews');
  const submitTimes=new Map();
  async function entries(){
    let files;
    try { files=(await fs.readdir(dir)).filter(name=>/^[0-9a-f-]{36}\.json$/i.test(name)); }
    catch (err) { if (err.code==='ENOENT') return []; throw err; }
    const reviews=[];
    for(const file of files){
      try { const record=JSON.parse(await fs.readFile(path.join(dir,file),'utf8')); if(record && record.id) reviews.push(record); }
      catch(err){ if(err.code!=='ENOENT') console.warn('CutLoopz: unreadable review skipped'); }
    }
    return reviews.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  router.post('/', async (req,res)=>{
    res.set('Cache-Control','no-store');
    if(!sameOrigin(req)) return res.status(403).json({ok:false,error:'This request must come from the CutLoopz site.'});
    let user;
    try { user=await authenticatedUser(req); } catch { return res.status(503).json({ok:false,error:'Sign-in service is unavailable.'}); }
    if(!user?.id) return res.status(401).json({ok:false,error:'Please sign in before leaving a review.'});
    const rating=req.body?.rating;
    const message=req.body?.message;
    if(!Number.isInteger(rating)||rating<1||rating>5 || typeof message!=='string' || message.trim().length<10 || message.trim().length>MAX_REVIEW_LENGTH){
      return res.status(400).json({ok:false,error:'Choose 1–5 stars and write a review between 10 and 2,500 characters.'});
    }
    const now=Date.now();
    if(now-(submitTimes.get(user.id)||0)<REVIEW_COOLDOWN_MS){return res.status(429).json({ok:false,error:'Thank you! Please allow a little time before submitting another review.'});}
    const record={id:randomUUID(),userId:user.id,artistName:String(user.name||'Artist').trim().slice(0,100),rating,message:message.trim(),createdAt:new Date(now).toISOString()};
    try {
      await fs.mkdir(dir,{recursive:true,mode:0o700});
      await fs.writeFile(path.join(dir,`${record.id}.json`),JSON.stringify(record),{encoding:'utf8',flag:'wx',mode:0o600});
      submitTimes.set(user.id,now);
      res.status(201).json({ok:true,message:'Thank you for sharing your experience. Your private review has been received.'});
    }catch(err){console.error('CutLoopz review could not be saved:',err.message);res.status(503).json({ok:false,error:'Your review could not be saved right now. Please try again.'});}
  });
  router.get('/admin',async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{if(!await isOwner(req))return res.status(403).json({ok:false,error:'Private owner access required.'});}
    catch{return res.status(503).json({ok:false,error:'Owner sign-in unavailable.'});}
    try{
      const reviews=await entries();
      const total=reviews.length;
      const averageRating=total?Math.round(reviews.reduce((sum,r)=>sum+r.rating,0)*10/total)/10:null;
      res.json({ok:true,summary:{count:total,averageRating},reviews:reviews.slice(0,200)});
    }catch(err){console.error('CutLoopz review list failed:',err.message);res.status(503).json({ok:false,error:'Could not load feedback.'});}
  });
  router.delete('/admin/:id',async(req,res)=>{
    res.set('Cache-Control','no-store');
    if(!sameOrigin(req))return res.status(403).json({ok:false,error:'Invalid request origin.'});
    try{if(!await isOwner(req))return res.status(403).json({ok:false,error:'Private owner access required.'});}
    catch{return res.status(503).json({ok:false,error:'Owner sign-in unavailable.'});}
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))return res.status(400).json({ok:false,error:'Invalid review ID.'});
    try{await fs.unlink(path.join(dir,req.params.id+'.json'));res.json({ok:true});}
    catch(err){if(err.code==='ENOENT')return res.status(404).json({ok:false,error:'Review not found.'});res.status(503).json({ok:false,error:'Unable to delete review.'});}
  });
  return router;
}
