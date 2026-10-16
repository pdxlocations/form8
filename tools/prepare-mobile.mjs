import {build} from 'esbuild';
import {mkdir,cp,readFile,writeFile} from 'node:fs/promises';
await mkdir('dist/mobile',{recursive:true});
await cp('web','dist/mobile',{recursive:true});
await build({entryPoints:['companion/mobile.js'],bundle:true,format:'iife',outfile:'dist/mobile/native.js'});
const html=await readFile('dist/mobile/index.html','utf8');
await writeFile('dist/mobile/index.html',html.replace('<script type="module" src="app.js">','<script src="native.js"></script><script type="module" src="app.js">'));
console.log('Mobile web assets and native HTTP/location bridge prepared.');
