import test from 'node:test';
import assert from 'node:assert/strict';
import {guardAction,trackActionControl} from '../web/actions.js';

function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function control(tagName='BUTTON'){
 const attributes=new Map(),classes=new Set();
 return {tagName,inert:false,disabled:false,getAttribute:key=>attributes.get(key)??null,setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key),classList:{contains:key=>classes.has(key),add:key=>classes.add(key),toggle(key,value){if(value)classes.add(key);else classes.delete(key);}}};
}
test('a pending action blocks repeated mouse or keyboard activation and unlocks on success',async()=>{
 const button=control(),gate=deferred();let calls=0;
 const action=guardAction(async()=>{calls++;await gate.promise;});
 const first=action({currentTarget:button});await action({currentTarget:button});
 assert.equal(calls,1);assert.equal(button.inert,true);assert.equal(button.getAttribute('aria-busy'),'true');
 gate.resolve();await first;assert.equal(button.inert,false);assert.equal(button.getAttribute('aria-busy'),null);
 await action({currentTarget:button});assert.equal(calls,2);
});
test('shared actions stay locked across alternate controls and rebuilt buttons',async()=>{
 const first=control(),alternate=control(),rebuilt=control(),gate=deferred();let calls=0;
 const a=guardAction(async()=>{calls++;await gate.promise;},{key:'same-message'});
 const b=guardAction(async()=>calls++,{key:'same-message'});
 const running=a({currentTarget:first});trackActionControl(alternate,'same-message');trackActionControl(rebuilt,'same-message');
 await b({currentTarget:rebuilt});assert.equal(calls,1);assert(alternate.inert&&rebuilt.inert);
 gate.resolve();await running;assert(!first.inert&&!alternate.inert&&!rebuilt.inert);
 await b({currentTarget:rebuilt});assert.equal(calls,2);
});
test('duplicate form submission prevents default navigation and leaves field values enabled',async()=>{
 const form=control('FORM'),submit=control(),field=control('INPUT'),gate=deferred();let prevented=0,calls=0;
 form.querySelectorAll=()=>[submit];
 const action=guardAction(async()=>{calls++;assert.equal(field.disabled,false);assert.equal(submit.disabled,false);await gate.promise;});
 const event={type:'submit',currentTarget:form,preventDefault(){prevented++;}};
 const running=action(event);await action(event);assert.equal(prevented,2);assert.equal(calls,1);assert(submit.inert);assert(!field.inert);
 gate.resolve();await running;assert(!submit.inert);
});
test('a failed action releases its lock and preserves disabled state chosen by the operation',async()=>{
 const button=control();let attempts=0,error;
 const action=guardAction(async()=>{attempts++;button.disabled=true;throw Error('Request failed');},{onError:value=>{error=value;}});
 await action({currentTarget:button});assert.match(error.message,/Request failed/);assert(!button.inert);assert(button.disabled);
 button.disabled=false;await action({currentTarget:button});assert.equal(attempts,2);
});
test('unrelated actions remain usable while a request is pending',async()=>{
 const gate=deferred();let other=0;
 const running=guardAction(()=>gate.promise,{key:'slow-action'})();
 await guardAction(()=>other++,{key:'other-action'})();assert.equal(other,1);
 gate.resolve();await running;
});
test('fast asynchronous actions still reject an accidental double-click',async()=>{
 let calls=0;const action=guardAction(async()=>{calls++;});
 const first=action();await Promise.resolve();await Promise.resolve();await action();assert.equal(calls,1);
 await first;await action();assert.equal(calls,2);
});
