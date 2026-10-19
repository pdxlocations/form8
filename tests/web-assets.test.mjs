import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

test('all local modules required by the embedded webpage are bundled and reachable',()=>{
 const root=new URL('../',import.meta.url),embed=readFileSync(new URL('tools/embed_web.py',root),'utf8');
 const names=new Set([...embed.match(/names = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map(match=>match[1]));
 const required=new Set(['app.js']);
 for(const name of required){
  assert(names.has(name),`${name} must be bundled in firmware`);
  const file=new URL('web/'+name,root);assert(existsSync(file),`${name} must exist`);
  for(const match of readFileSync(file,'utf8').matchAll(/from\s+['"]\.\/([^'"]+)['"]/g))required.add(match[1]);
 }
 const main=readFileSync(new URL('src/main.cpp',root),'utf8');
 const handler=main.slice(main.indexOf('server.onNotFound('),main.indexOf('});server.begin();'));
 assert.match(handler,/for\(const auto& asset:WEB_ASSETS\)/);
 assert.doesNotMatch(handler,/uri=="\/app\.js"/,'A second hardcoded asset allowlist can omit newly bundled modules');
});
