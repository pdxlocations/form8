// Newline framed UTF-8 JSON over USB CDC or Nordic UART notifications.
export class RadioRpc {
 constructor(plugin,client,{timeout=30000}={}){this.plugin=plugin;this.client=client;this.timeout=timeout;this.sequence=0;this.generation=0;this.pending=new Map();this.decoder=new TextDecoder('utf-8',{fatal:true});this.buffer='';this.tail=Promise.resolve();}
 reset(reason='Connection changed'){
  ++this.generation;
  for(const p of this.pending.values()){clearTimeout(p.timer);const error=new Error(reason);p.cancel(error);p.reject(error);}
  this.pending.clear();this.buffer='';this.decoder=new TextDecoder('utf-8',{fatal:true});this.tail=Promise.resolve();
 }
 receive(base64){try{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));this.buffer+=this.decoder.decode(bytes,{stream:true});if(this.buffer.length>100000)throw new Error('Radio frame too large');let end;while((end=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,end);this.buffer=this.buffer.slice(end+1);if(!line.trim())continue;let d;try{d=JSON.parse(line);}catch{continue;}const p=this.pending.get(d.request);if(!p)continue;clearTimeout(p.timer);if(d.error)p.reject(new Error(d.error));else p.resolve(d.data);}}catch(e){this.reset(e.message);}}
 request(op,data={}){
  const generation=this.generation;
  const context=`Radio ${op}${op==='http'?' '+(data.method||'')+' '+(data.path||''):''}`;
  const work=async()=>{
   if(generation!==this.generation)throw new Error('Connection changed; queued radio request cancelled.');
   const request=++this.sequence;
   let entry,cancel;
   const cancelled=new Promise((resolve,reject)=>{cancel=reject;});
   const response=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{const error=new Error('Timed out. Check the connection.');reject(error);cancel(error);},this.timeout);
    entry={resolve,reject,timer,cancel};this.pending.set(request,entry);
   });
   try{
    // Notifications may arrive before Android reports completion of the last
    // GATT write. Do not start another request until BOTH operations finish.
    const send=Promise.resolve().then(()=>{
     if(generation!==this.generation)throw new Error('Connection changed');
     return this.plugin.send({data:JSON.stringify({request,client:this.client,op,data})+'\n'});
    }).catch(error=>{entry.reject(error);throw error;});
    const [written,replied]=await Promise.race([Promise.allSettled([send,response]),cancelled]);
    if(written.status==='rejected')throw written.reason;
    if(replied.status==='rejected')throw replied.reason;
    const result=replied.value;
    if(generation!==this.generation)throw new Error('Connection changed');
    return result;
   }catch(error){throw new Error(`${context}: ${error.message}`);}
   finally{clearTimeout(entry.timer);if(this.pending.get(request)===entry)this.pending.delete(request);}
  };
  const result=this.tail.then(work);this.tail=result.catch(()=>{});return result;
 }
}
