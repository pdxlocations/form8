// Share locks across rebuilt buttons as well as repeated events on one control.
const pending=new Map();

function lockControl(control,state){
  if(!control || state.controls.has(control))return;
  state.controls.set(control,{inert:control.inert,busy:control.getAttribute('aria-busy'),styled:control.classList.contains('action-busy')});
  control.inert=true;control.setAttribute('aria-busy','true');control.classList.add('action-busy');
}
export function trackActionControl(control,key){
  const state=pending.get(key);if(state)lockControl(control,state);
}
export function guardAction(fn,{key,onError=error=>{throw error;}}={}){
  const localKey=Symbol('action');
  return async event=>{
    if(event?.type==='submit')event.preventDefault();
    const actionKey=(typeof key==='function'?key(event):key)||localKey;
    if(pending.has(actionKey))return;
    const state={controls:new Map()},started=Date.now();let asynchronous=false;pending.set(actionKey,state);
    const target=event?.currentTarget;
    if(target?.tagName==='FORM'){
      for(const control of target.querySelectorAll('button[type="submit"],button:not([type]),input[type="submit"]'))lockControl(control,state);
    }else if(target)lockControl(target,state);
    try{const result=fn(event);asynchronous=!!result&&typeof result.then==='function';return await result;}
    catch(error){return onError(error);}
    finally{
      // Also catch a quick double-click when a local/API operation finishes fast.
      if(asynchronous){const remaining=400-(Date.now()-started);if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));}
      pending.delete(actionKey);
      for(const [control,previous] of state.controls){
        control.inert=previous.inert;
        if(previous.busy===null)control.removeAttribute('aria-busy');else control.setAttribute('aria-busy',previous.busy);
        control.classList.toggle('action-busy',previous.styled);
      }
    }
  };
}
