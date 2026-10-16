import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../web/theme.js',import.meta.url),'utf8');
function client({saved=null,dark=false,blocked=false}={}){
  const events={}, select={value:'',addEventListener:(name,fn)=>events.select=fn};
  const root={dataset:{}}, system={matches:dark,addEventListener:(name,fn)=>events.system=fn};
  let mounted=false,stored=saved,meta;
  vm.runInNewContext(source,{
    window:{matchMedia:()=>system,addEventListener:(name,fn)=>events[name]=fn},
    document:{documentElement:root,querySelector:()=>({setAttribute:(name,value)=>meta=value}),getElementById:()=>mounted?select:null,addEventListener:(name,fn)=>events[name]=fn},
    localStorage:{getItem:()=>{if(blocked)throw Error();return stored;},setItem:(key,value)=>{if(blocked)throw Error();stored=value;}}
  });
  return {root,system,select,events,get stored(){return stored;},get meta(){return meta;},mount(){mounted=true;events.DOMContentLoaded();},choose(value){select.value=value;events.select({target:select});}};
}
test('system appearance applies before DOM ready and follows device changes',()=>{
  const c=client({dark:true});assert.equal(c.root.dataset.theme,'dark');c.mount();assert.equal(c.select.value,'system');
  c.system.matches=false;c.events.system();assert.equal(c.root.dataset.theme,'light');
});
test('explicit appearance persists across reloads and ignores system changes',()=>{
  const c=client({dark:true});c.mount();c.choose('light');assert.equal(c.stored,'light');c.events.system();assert.equal(c.root.dataset.theme,'light');
  const reload=client({saved:c.stored,dark:true});assert.equal(reload.root.dataset.theme,'light');
  c.choose('dark');assert.equal(c.meta,'#18241f');c.choose('system');assert.equal(c.root.dataset.theme,'dark');
});
test('cross-tab changes and clearing preferences update the selector',()=>{
  const c=client();c.mount();c.events.storage({key:'form8-theme',newValue:'dark'});assert.equal(c.select.value,'dark');
  c.events.storage({key:'other',newValue:'light'});assert.equal(c.select.value,'dark');
  c.events.storage({key:null,newValue:null});assert.equal(c.select.value,'system');assert.equal(c.root.dataset.theme,'light');
});
test('invalid or unavailable storage safely falls back; changes still work for session',()=>{
  assert.equal(client({saved:'invalid',dark:true}).root.dataset.theme,'dark');
  const c=client({blocked:true});c.mount();c.choose('dark');assert.equal(c.root.dataset.theme,'dark');
});
