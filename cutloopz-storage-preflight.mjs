import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function verifyProductionStorage({outputDir=process.env.OUTPUT_DIR||'/app/outputs',productionDir=path.join(outputDir,'cutloopz-production')}={}){
 if(!path.isAbsolute(outputDir)||!path.isAbsolute(productionDir))throw Error('Storage paths must be absolute');
 await fs.mkdir(productionDir,{recursive:true});
 const probe=path.join(productionDir,`.cutloopz-write-test-${randomUUID()}`);
 try{await fs.writeFile(probe,'ok',{flag:'wx'});if(await fs.readFile(probe,'utf8')!=='ok')throw Error('Storage verification mismatch');}
 finally{await fs.rm(probe,{force:true});}
 return {ok:true,outputDir,productionDir,warning:'Write access verified; persistence across restarts must be verified on deployed disk'};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
 verifyProductionStorage().then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
