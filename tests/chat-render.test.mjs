import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/app.js',import.meta.url),'utf8');
test('chat replies render the retained parent and fall back when it is unavailable',()=>{
  const element=(tag='',value='')=>({tag,value,children:[],dataset:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelectorAll(){return [];},setAttribute(){}});
  const list=element(),panel={hidden:false},older=element();
  const messages=[{id:'one',origin:'other',sender:'FIELD-1',text:'Water needed',sentAt:1800000000},
    {id:'two',parent:'one',origin:'other',sender:'FIELD-2',text:'On the way',sentAt:1800000060},
    {id:'three',parent:'missing12345678',origin:'other',sender:'FIELD-3',text:'Confirmed',sentAt:1800000120}];
  const context=vm.createContext({chatMessages:messages,chatRendered:'',chatHasOlder:false,status:{node:'self',peers:[]},
    $:selector=>({'#chat':panel,'#chat-list':list,'#chat-load-older':older})[selector],text:element,
    button:label=>element('button',label),chatReactionGroups:()=>[],chatEmojis:[],chatRadioStatus:()=>'',
    captureChatScroll:()=>({}),restoreChatScroll(){}});
  vm.runInContext(source.slice(source.indexOf('function renderChatMessages(){'),source.indexOf('async function loadOlderChatMessages')),context);
  vm.runInContext('renderChatMessages()',context);
  assert.equal(list.children.length,3);
  assert.equal(list.children[0].children.find(child=>child.tag==='blockquote').value,'Reply to earlier message · 12345678');
  assert.equal(list.children[1].children.find(child=>child.tag==='blockquote').value,'FIELD-1: Water needed');
  assert.equal(list.children[2].children.some(child=>child.tag==='blockquote'),false);
});
