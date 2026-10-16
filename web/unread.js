const KEY='form8-unread-v1',MAX_CONTEXTS=64,MAX_SEEN=96;
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=80;
export class UnreadTracker {
  constructor(storage){
    this.contexts=new Map();
    try{
      this.storage=storage??globalThis.localStorage;
      const saved=JSON.parse(this.storage.getItem(KEY));
      if(saved?.version===1&&Array.isArray(saved.contexts))for(const entry of saved.contexts.slice(-MAX_CONTEXTS))
        if(Array.isArray(entry)&&validId(entry[0])&&Array.isArray(entry[1]))this.contexts.set(entry[0],new Set(entry[1].filter(validId).slice(-MAX_SEEN)));
    }catch{}
  }
  count(key,ids,viewed){
    const unique=[...new Set(ids.filter(validId))],seen=this.contexts.get(key)||new Set();
    if(viewed && unique.some(id=>!seen.has(id))){
      for(const id of unique){seen.delete(id);seen.add(id);}
      this.contexts.delete(key);this.contexts.set(key,new Set([...seen].slice(-MAX_SEEN)));
      while(this.contexts.size>MAX_CONTEXTS)this.contexts.delete(this.contexts.keys().next().value);
      try{this.storage?.setItem(KEY,JSON.stringify({version:1,contexts:[...this.contexts].map(([key,value])=>[key,[...value]])}));}catch{}
    }
    return viewed?0:unique.filter(id=>!seen.has(id)).length;
  }
  chat(status,messages,viewed=false){
    if(!status || !status.incident || status.incident==='0000000000000000')return 0;
    return this.count(`chat:${status.node}:${status.incident}`,messages.filter(message=>message.origin!==status.node).map(message=>message.id),viewed);
  }
  incidents(status,viewed=false){
    if(!status)return 0;
    const ids=(status.peers||[]).filter(peer=>peer.online&&peer.incident&&peer.incident!=='0000000000000000').map(peer=>peer.incident);
    // Joining an incident counts as viewing it, even if its announcement has not arrived.
    if(status.incident&&status.incident!=='0000000000000000')this.count(`incidents:${status.node}`,[status.incident],true);
    return this.count(`incidents:${status.node}`,ids,viewed);
  }
}
export function setNavBadge(tab,count,description){
  const badge=document.getElementById(`${tab}-badge`),label=document.getElementById(`${tab}-unread`);
  if(!badge||!label)return;
  count=Math.max(0,Math.floor(Number(count)||0));
  const content=count>99?'99+':String(count);
  if(badge.textContent!==content)badge.textContent=content;
  badge.hidden=count===0;
  const message=count?`${count} ${description}`:`No ${description}`;
  if(label.textContent!==message)label.textContent=message;
}
