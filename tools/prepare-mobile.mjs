import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,cp,readFile,writeFile,readdir} from 'node:fs/promises';
await mkdir('dist/mobile',{recursive:true});
await cp('web','dist/mobile',{recursive:true});
const fingerprint=createHash('sha256');
async function fingerprintTree(directory){
 for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=`${directory}/${entry.name}`;
  if(entry.isDirectory())await fingerprintTree(path);
  else if(/\.(?:js|cjs|html|css|java)$/.test(entry.name))fingerprint.update(path).update(await readFile(path));
 }
}
for(const directory of ['companion','web','android/app/src/main/java'])await fingerprintTree(directory);
const appBuild=fingerprint.digest('hex').slice(0,10);
await writeFile('dist/mobile/build-info.json',JSON.stringify({appBuild})+'\n');
await build({define:{__FORM8_APP_BUILD__:JSON.stringify(appBuild)},entryPoints:['companion/mobile.js'],bundle:true,format:'iife',outfile:'dist/mobile/native.js'});
const html=await readFile('dist/mobile/index.html','utf8');
await writeFile('dist/mobile/index.html',html.replace('<script type="module" src="app.js">','<script src="native.js"></script><script type="module" src="app.js">'));
console.log(`Mobile assets prepared. Android app build: ${appBuild}`);
