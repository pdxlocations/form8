// Foreground work stays visible until its own request finishes. Background
// polling never enters here, and completion on another tab cannot hide it.
export function createLoadingIndicator(element){
  let scope='compose',sequence=0;
  const pending=new Map();
  function render(){
    const visible=[...pending.values()].filter(item=>item.scope==='global'||item.scope===scope).at(-1);
    element.hidden=!visible;element.textContent=visible?.message||'';
  }
  function begin(message,target='global'){
    const id=++sequence;pending.set(id,{message,scope:target});render();
    return ()=>{pending.delete(id);render();};
  }
  return {begin,select(next){scope=next;render();},async run(message,work,target){
    const finish=begin(message,target);
    try{return await work();}finally{finish();}
  }};
}
