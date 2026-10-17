import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function setup(){
  const moved=[];
  const list={children:[{dataset:{message:'older'},getBoundingClientRect:()=>({top:160})}]};
  const context=vm.createContext({$:selector=>selector==='#chat-list'?list:{getBoundingClientRect:()=>({top:80})},window:{scrollBy:(...v)=>moved.push(['by',...v]),scrollTo:(...v)=>moved.push(['to',...v])}});
  vm.runInContext(source.slice(source.indexOf('function restoreChatScroll('),source.indexOf("$('#chat-oldest')")),context);
  return {restore:saved=>context.restoreChatScroll(saved),moved};
}
test('newest-first chat stays at the top when messages arrive',()=>{
  const h=setup();h.restore({atStart:true,scrollY:20,anchors:[{id:'older',rect:{top:90}}]});
  assert.deepEqual(h.moved,[['to',0,20]]);
});
test('reading an older chat preserves its position when messages arrive above it',()=>{
  const h=setup();h.restore({atStart:false,scrollY:400,anchors:[{id:'older',rect:{top:90}}]});
  assert.deepEqual(h.moved,[['by',0,70]]);
});
test('chat refresh preserves the composer position while typing',()=>{
  const h=setup();h.restore({writing:true,composerTop:80});
  assert.deepEqual(h.moved,[['by',0,0]]);
});
