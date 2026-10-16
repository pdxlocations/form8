import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {crc32,validateForm,validateChatText,chatEmojis,chatTimeline} from '../web/model.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||8848);
const stateFile=process.env.FORM8_DEMO_STATE||`${root}/tmp/demo.local.json`;
const fresh={config:{callsign:'DEMO-1',primary:919.5,backup:0,bandwidth:500,sf:9,cr:8,power:14,useBackup:false,txEnabled:false,paused:false,positionEnabled:true,positionInterval:600},incident:'0000000000000000',incidentName:'',incidents:[],forms:{}};
await mkdir(`${root}/tmp`,{recursive:true});
let state;try{state=JSON.parse(await readFile(stateFile,'utf8'));}catch{state=fresh;}
state.chats??={};state.chatSequence??=0;
state.config.positionEnabled??=true;state.config.positionInterval??=600;
let saving=Promise.resolve();
function save(){const snapshot=JSON.stringify(state);saving=saving.catch(()=>{}).then(async()=>{await writeFile(`${stateFile}.tmp`,snapshot);await rename(`${stateFile}.tmp`,stateFile);});return saving;}
function reply(res,code,data){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));}
const files=new Set(['index.html','app.js','theme.js','position-client.js','map.js','map-model.js','map-store.js','model.js','unread.js','style.css','sw.js','manifest.webmanifest','icon.svg']);
const mimes={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json'};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/')){
      const name=url.pathname.slice(1)||'index.html';if(!files.has(name)){reply(res,404,{error:'Not found'});return;}
      res.writeHead(200,{'Content-Type':mimes[name.split('.').pop()]});res.end(await readFile(`${root}/web/${name}`));return;
    }
    let d={};if(req.method==='POST'){let raw='';for await(const part of req){raw+=part;if(raw.length>8192)throw Error('Request too large');}d=JSON.parse(raw);}
    let output={saved:true},code=200;
    switch(`${req.method} ${url.pathname}`){
      case 'GET /api/status':output={...state.config,gpsAvailable:false,gpsFresh:false,location:state.location?{...state.location,ageMs:Date.now()-state.location.capturedAt,fresh:Date.now()-state.location.capturedAt<=120000}:{},simulated:true,board:'SIMULATOR · no RF',node:'0000000000000001',incident:state.incident,incidentName:state.incidentName,frequency:state.config.useBackup?state.config.backup:state.config.primary,queue:0,dropped:0,clockSource:'phone/laptop',fsReady:true,radioReady:true,radioError:0,storageUsed:JSON.stringify(state).length,storageTotal:4128768,storageWarning:false,freeHeap:200000,band:'uhf',peers:state.peers||[]};break;
      case 'POST /api/config':if(d.positionInterval!==undefined&&(!Number.isInteger(d.positionInterval)||d.positionInterval<60||d.positionInterval>86400))throw Error('Position interval must be 60–86400 whole seconds');if(d.positionEnabled!==undefined&&typeof d.positionEnabled!=='boolean')throw Error('Invalid position sharing setting');state.config={...state.config,...d};output.radioReady=true;break;
      case 'POST /api/position':{
        if(!Number.isFinite(d.lat)||!Number.isFinite(d.lon)||Math.abs(d.lat)>90||Math.abs(d.lon)>180||!Number.isInteger(d.ageMs)||d.ageMs<0||d.ageMs>120000)throw Error('Invalid or stale position');
        if(d.accuracy!==undefined&&(!Number.isFinite(d.accuracy)||d.accuracy<0||d.accuracy>65534))throw Error('Invalid accuracy');
        state.location={lat:d.lat,lon:d.lon,accuracy:d.accuracy??-1,source:'phone',capturedAt:Date.now()-d.ageMs};break;
      }
      case 'POST /api/time':break;
      case 'GET /api/incidents':output={incidents:state.incidents};break;
      case 'GET /api/chat':output={incident:state.incident,messages:chatTimeline(Object.values(state.chats).filter(event=>event.meta.incident===state.incident))};break;
      case 'POST /api/chat':{
        if(state.incident==='0000000000000000'||d.incident!==state.incident)throw Error('Join the matching incident first');
        const id=d.clientToken;if(!/^[a-f0-9]{32}$/.test(id)||/^0+$/.test(id))throw Error('Invalid chat token');
        if(state.forms[id])throw Error('Token belongs to a form');
        if(state.chats[id]){
          if(state.chats[id].meta.incident!==state.incident)throw Error('Token belongs to another incident');
          output={id,existing:true};break;
        }
        const body={type:d.type,sender:state.config.callsign,sentAt:Math.floor(Date.now()/1000)};
        if(d.type==='chat-message'){
          body.text=validateChatText(d.text);
          if(d.parent){if(!/^[a-f0-9]{32}$/.test(d.parent)||/^0+$/.test(d.parent))throw Error('Invalid reply ID');body.parent=d.parent;}
        }else if(d.type==='chat-reaction'){
          const target=state.chats[d.target];if(!target||target.meta.incident!==state.incident||target.body.type!=='chat-message')throw Error('Reaction target unavailable');
          if(!chatEmojis.includes(d.emoji)||typeof d.active!=='boolean')throw Error('Invalid reaction');
          Object.assign(body,{target:d.target,emoji:d.emoji,active:d.active,sequence:++state.chatSequence});
        }else throw Error('Invalid chat type');
        const order=Math.max(0,...Object.values(state.chats).map(event=>event.meta.order))+1;
        state.chats[id]={body,meta:{id,incident:state.incident,origin:'0000000000000001',order,attempts:0,retrying:false,receipts:[]}};
        const history=Object.values(state.chats).sort((a,b)=>a.meta.order-b.meta.order);
        for(const event of history.slice(0,Math.max(0,history.length-96)))delete state.chats[event.meta.id];
        output={id,saved:true};code=201;break;
      }
      case 'POST /api/incident':{
        state.incident=d.id||randomBytes(8).toString('hex');state.incidentName=d.name;
        if(!state.incidents.some(i=>i.id===state.incident))state.incidents.push({id:state.incident,name:d.name});output={id:state.incident};break;
      }
      case 'GET /api/forms':{
        const forms=Object.values(state.forms).map(f=>f.meta).filter(m=>url.searchParams.get('all')==='1'||m.incident===state.incident).sort((a,b)=>a.id.localeCompare(b.id));
        const index=forms.findIndex(m=>m.id===url.searchParams.get('selected'));
        const offset=index>=0?Math.floor(index/20)*20:Number(url.searchParams.get('offset')||0);
        output={forms:forms.slice(offset,offset+20),total:forms.length,offset,previous:index>0?forms[index-1].id:null,next:index>=0&&index+1<forms.length?forms[index+1].id:null};break;
      }
      case 'GET /api/form':output=state.forms[url.searchParams.get('id')];if(!output){reply(res,404,{error:'Form not found'});return;}break;
      case 'POST /api/forms':{
        if(state.incident==='0000000000000000')throw Error('Join an incident first');
        if(d.boundIncident && d.boundIncident!==state.incident)throw Error('Draft belongs to another incident');
        const id=d.clientToken;if(!/^[a-f0-9]{32}$/.test(id))throw Error('Invalid submission token');
        if(state.chats[id])throw Error('Token belongs to chat');
        if(!state.forms[id]){
          delete d.clientToken;validateForm(d);d.sender=state.config.callsign;d.incident=state.incident;d.incidentName=state.incidentName;d.clockSource='phone/laptop';d.sentAt=Math.floor(Date.now()/1000);
          const body=JSON.stringify(d);state.forms[id]={body,meta:{id,incident:state.incident,origin:'0000000000000001',hash:crc32(body),priority:d.priority,state:'stored',recipient:d.recipient,subject:d.subject,sender:d.sender,expected:[],receipts:[{id:'0000000000000001',human:false}]}};
        }output={id,saved:true,queued:false};code=201;break;
      }
      case 'POST /api/ack':{
        const record=state.forms[d.id];if(!record?.body)throw Error('Stored form required');record.meta.receipts[0].human=true;break;
      }
      case 'POST /api/read':{
        const record=state.forms[d.id];if(!record)throw Error('Unknown form');record.meta.unread=false;break;
      }
      case 'POST /api/offload':{
        const record=state.forms[d.id];if(!record)throw Error('Unknown form');
        if(d.mode==='archive'&&(!d.verified||d.hash!==record.meta.hash))throw Error('Verified archive required');
        if(!['archive','discard'].includes(d.mode))throw Error('Invalid mode');record.meta.state=d.mode==='archive'?'archived':'discarded';delete record.body;break;
      }
      default:reply(res,404,{error:'Unknown API route'});return;
    }
    if(req.method==='POST')await save();reply(res,code,output);
  }catch(error){reply(res,400,{error:error.message});}
}).listen(port,'127.0.0.1',()=>console.log(`Form8 SIMULATOR (no RF): http://127.0.0.1:${port}`));
