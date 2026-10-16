import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {draftLabel, numberUntitledDrafts} from '../web/model.js';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
function setup(confirmed=true){
  const drafts=new Map(['current','other'].map(id=>[id,{id,form:{clientToken:id,subject:id},savedAt:1}]));
  const list={children:[],replaceChildren(){this.children=[];},append(item){this.children.push(item);}};
  const form={elements:{clientToken:{value:'current'}}},cleared=[];
  const context=vm.createContext({draftLabel,form,$:()=>list,draftTimer:123,confirm:()=>confirmed,clearTimeout:timer=>cleared.push(timer),
    db:async(store,action,id)=>action==='getAll'?[...drafts.values()]:drafts.delete(id),
    fill:()=>{form.elements.clientToken.value='fresh';},feedback(){},saveDraft(){throw Error('Deleted draft must not be saved again');},
    text:()=>({children:[],append(...items){this.children.push(...items);}}),
    button:(label,onclick)=>({label,onclick,setAttribute(name,value){this[name]=value;}})});
  vm.runInContext(source.slice(source.indexOf('async function draftList()'),source.indexOf('function fill(')),context);
  return {drafts,list,form,cleared,context};
}
test('each saved draft has a named Delete control; deleting the open draft cancels autosave and clears the form',async()=>{
  const h=setup();await vm.runInContext('draftList()',h.context);
  const remove=h.list.children[0].children[1];assert.equal(remove.label,'Delete');assert.equal(remove['aria-label'],'Delete draft: current');
  await remove.onclick();assert.equal(h.drafts.has('current'),false);assert.equal(h.drafts.has('other'),true);
  assert.equal(h.form.elements.clientToken.value,'fresh');assert.deepEqual(h.cleared,[123]);assert.equal(h.drafts.has('fresh'),false);
  assert.equal(h.list.children.length,1);
});
test('deleting another draft preserves the open form and its autosave',async()=>{
  const h=setup();await vm.runInContext("deleteDraft('other','other')",h.context);
  assert.equal(h.drafts.has('other'),false);assert.equal(h.drafts.has('current'),true);
  assert.equal(h.form.elements.clientToken.value,'current');assert.deepEqual(h.cleared,[]);
});
test('canceling draft deletion preserves drafts and the form',async()=>{
  const h=setup(false);await vm.runInContext("deleteDraft('current','current')",h.context);
  assert.equal(h.drafts.size,2);assert.equal(h.form.elements.clientToken.value,'current');assert.deepEqual(h.cleared,[]);
});

test('untitled drafts keep unique numbers through autosave/reordering and reset only after none remain',()=>{
  const draft=(id,subject='',savedAt=1)=>({id,form:{subject},savedAt});
  let state=numberUntitledDrafts([draft('a')]);
  assert.equal(draftLabel(state.drafts[0]),'Untitled draft-1');assert.equal(state.drafts[0].form.subject,'');
  state=numberUntitledDrafts([...state.drafts,draft('b')],state.counter);
  assert.deepEqual(state.drafts.map(draftLabel),['Untitled draft-1','Untitled draft-2']);
  state=numberUntitledDrafts([{...state.drafts[1],savedAt:100},state.drafts[0]],state.counter);
  assert.deepEqual(state.drafts.map(draftLabel),['Untitled draft-2','Untitled draft-1']);
  // Deleting the highest number does not reuse it while another untitled remains.
  state=numberUntitledDrafts([state.drafts[1]],state.counter);
  state=numberUntitledDrafts([...state.drafts,draft('c')],state.counter);
  assert.deepEqual(state.drafts.map(draftLabel),['Untitled draft-1','Untitled draft-3']);
  state=numberUntitledDrafts([draft('named','Radio check')],state.counter);
  assert.equal(state.counter,0);assert.equal(draftLabel(state.drafts[0]),'Radio check');
  state=numberUntitledDrafts([...state.drafts,draft('new')],state.counter);
  assert.equal(draftLabel(state.drafts[1]),'Untitled draft-1');
});

test('legacy and whitespace-only drafts get stable labels without changing subjects',()=>{
  const drafts=[{id:'b',form:{subject:'   '},savedAt:2},{id:'a',form:{subject:''},savedAt:1}];
  const numbered=numberUntitledDrafts(drafts);
  assert.deepEqual(numbered.drafts.map(draftLabel),['Untitled draft-2','Untitled draft-1']);
  assert.deepEqual(numberUntitledDrafts(numbered.drafts,numbered.counter),numbered);
  assert.equal(numbered.drafts[0].form.subject,'   ');
  const titled=numberUntitledDrafts(numbered.drafts.map(d=>({...d,form:{subject:'Named'}})),numbered.counter);
  assert.equal(titled.counter,0);assert.ok(titled.drafts.every(d=>!('untitledNumber' in d)));
});
