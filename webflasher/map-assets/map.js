import {project,unproject,visibleTiles,downloadTiles,tileUrl,mapNodes,MAX_TILES,MAX_MAP_BYTES} from './map-model.js';
import {tileStore,validateMapPackage} from './map-store.js';
import {guardAction,trackActionControl} from './actions.js';

export function createMapPanel({onError}){
  const $=id=>document.getElementById(id),canvas=$('node-map'),context=canvas.getContext('2d');
  let center={lat:39,lon:-98},zoom=4,centered=false,status=null,nodes=[],drag=null,controller=null,busy=false;
  const images=new Map(),pending=new Set(),failed=new Map();
  try{$('map-online').checked=localStorage.getItem('form8-map-online')!=='false';}catch{}
  const note=message=>$('map-download-status').textContent=message;
  const task=fn=>guardAction(async event=>{
    for(const id of ['map-download','map-import','map-export','map-delete'])trackActionControl($(id),'offline-map-storage');
    await fn(event);
  },{key:'offline-map-storage',onError:error=>onError(error.message)});
  try{const saved=JSON.parse(localStorage.getItem('form8-map-view'));if(saved&&Number.isFinite(saved.lat)&&Math.abs(saved.lat)<=85.0512&&Number.isFinite(saved.lon)&&Math.abs(saved.lon)<=180&&Number.isInteger(saved.zoom)&&saved.zoom>=0&&saved.zoom<=16){center={lat:saved.lat,lon:saved.lon};zoom=saved.zoom;centered=true;}}catch{}
  function saveView(){try{localStorage.setItem('form8-map-view',JSON.stringify({...center,zoom}));}catch{}}
  function dimensions(){return {width:Math.max(1,canvas.clientWidth),height:canvas.clientHeight};}
  function move(dx,dy){const p=project(center.lat,center.lon,zoom);center=unproject(p.x+dx/256,Math.max(0,Math.min(2**zoom,p.y+dy/256)),zoom);saveView();draw();}
  function setZoom(value){zoom=Math.max(0,Math.min(16,value));saveView();draw();}
  function imageFromBlob(blob){return new Promise((resolve,reject)=>{
    const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};image.onerror=()=>{URL.revokeObjectURL(url);reject(Error('Invalid map image.'));};image.src=url;
  });}
  async function fetchTile(key,signal){
    const response=await fetch(tileUrl(key),{signal:signal||AbortSignal.timeout(10000),credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error(`Map service unavailable (${response.status}). Try again with internet access.`);
    const blob=await response.blob();
    if(!['image/png','image/jpeg'].includes(blob.type)||blob.size>512*1024||!blob.size)throw Error('Map service returned an invalid or oversized image.');
    return blob;
  }
  async function loadTile(key){
    if(pending.has(key)||failed.get(key)>Date.now())return;
    pending.add(key);
    try{
      const saved=await tileStore('get',key);
      if(!saved && !$('map-online').checked)return;
      const blob=saved?.blob||await fetchTile(key);
      images.set(key,await imageFromBlob(blob));
      while(images.size>128)images.delete(images.keys().next().value);
      draw(false);
    }catch{failed.set(key,Date.now()+60000);}finally{pending.delete(key);}
  }
  function draw(load=true){
    if($('map').hidden)return;
    const {width,height}=dimensions(),ratio=Math.min(devicePixelRatio||1,2);
    canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);context.setTransform(ratio,0,0,ratio,0,0);
    const dark=document.documentElement.dataset.theme==='dark';
    context.fillStyle=dark?'#223029':'#e8ece4';context.fillRect(0,0,width,height);
    let missing=0;
    for(const tile of visibleTiles(center,zoom,width,height)){
      const image=images.get(tile.key);
      if(image)context.drawImage(image,tile.x,tile.y,256,256);
      else{
        missing++;context.strokeStyle=dark?'#52645a':'#b9c3ba';context.strokeRect(tile.x,tile.y,256,256);
        if(load)loadTile(tile.key);
      }
    }
    const origin=project(center.lat,center.lon,zoom),world=2**zoom;
    for(const node of nodes){
      const p=project(node.lat,node.lon,zoom),dx=((p.x-origin.x+world/2)%world+world)%world-world/2;
      const x=width/2+dx*256,y=height/2+(p.y-origin.y)*256;
      if(x<-60||x>width+60||y<0||y>height)continue;
      const stale=node.own?!node.fresh:node.ageMs>Math.max(900000,(status?.positionInterval||600)*1500);
      context.beginPath();context.arc(x,y,node.own?8:7,0,Math.PI*2);context.fillStyle=stale?'#67766c':node.own?'#1264b0':'#ae4714';context.fill();context.strokeStyle='#fff';context.lineWidth=2;context.stroke();
      const label=`${node.call}${node.own?' (you)':''}`;context.font='bold 12px system-ui';const length=context.measureText(label).width;
      const left=Math.max(2,Math.min(width-length-10,x+11));context.fillStyle='#fff';context.fillRect(left,y-12,length+8,20);context.fillStyle='#18241f';context.fillText(label,left+4,y+2);
    }
    $('map-view-status').textContent=`Zoom ${zoom} · ${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}${missing?' · Some tiles unavailable; download this area with internet access.':''}`;
    $('map-zoom-in').disabled=zoom>=16;$('map-zoom-out').disabled=zoom<=0;
  }
  function renderNodes(){
    const list=$('map-nodes');list.replaceChildren();
    for(const node of nodes){
      const item=document.createElement('li'),button=document.createElement('button');button.type='button';button.className='secondary';
      button.textContent=`${node.call}${node.own?' (you)':''} · ${node.lat.toFixed(5)}, ${node.lon.toFixed(5)}`;
      button.onclick=()=>{center={lat:node.lat,lon:node.lon};zoom=Math.max(zoom,12);centered=true;saveView();draw();};
      const detail=document.createElement('span');detail.className='muted';
      detail.textContent=`${node.source==='radio'?'Onboard GPS':'Phone GPS'} · ${Math.floor(node.ageMs/60000)} min old${node.accuracy>=0?` · ±${node.accuracy} m`:''}${node.online?'':' · offline'}${node.own&&!node.fresh?' · last known':''}`;
      item.append(button,detail);list.append(item);
    }
    if(!nodes.length){const item=document.createElement('li');item.textContent='No locations yet. Allow phone location access or wait for an onboard GPS fix. Other nodes appear after a position broadcast in this incident.';list.append(item);}
  }
  function update(next){
    status=next;nodes=mapNodes(next);renderNodes();
    if(!centered && nodes.length){center={lat:nodes[0].lat,lon:nodes[0].lon};zoom=12;centered=true;saveView();}
    draw();
  }
  async function storageInfo(){const tiles=await tileStore('getAll');const bytes=tiles.reduce((sum,t)=>sum+t.blob.size,0);$('map-storage').textContent=`${tiles.length} saved tiles · ${(bytes/1048576).toFixed(1)} / 32 MB on this device`;return {tiles,bytes};}
  function setBusy(value){busy=value;for(const id of ['map-download','map-import','map-export','map-delete'])$(id).disabled=value;$('map-cancel').hidden=!value||!controller;}
  $('map-download').onclick=task(async()=>{
    if(busy)return;const {width,height}=dimensions(),detail=Math.min(16,zoom+Number($('map-detail').value));
    const keys=downloadTiles(center,zoom,width,height,detail),saved=await storageInfo(),existing=new Map(saved.tiles.map(t=>[t.id,t]));
    if(new Set([...existing.keys(),...keys]).size>MAX_TILES)throw Error('Saved map limit is 400 tiles. Remove saved maps or choose a smaller area.');
    let bytes=saved.bytes,done=0;controller=new AbortController();setBusy(true);
    try{
      for(const key of keys){
        if(controller.signal.aborted)throw Error('Download canceled. Completed tiles remain saved.');
        if(!existing.has(key)){
          const blob=await fetchTile(key,AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]));
          await imageFromBlob(blob);
          if(bytes+blob.size>MAX_MAP_BYTES)throw Error('Map storage limit is 32 MB. Remove saved maps or choose a smaller area.');
          await tileStore('put',{id:key,blob});bytes+=blob.size;
        }
        note(`Downloading ${++done} / ${keys.length} tiles…`);
      }
      note(`Saved ${keys.length} tiles for this area through zoom ${detail}. Ready offline.`);
      navigator.storage?.persist?.().catch(()=>{});
    }catch(error){note(controller.signal.aborted?'Download canceled. Completed tiles remain saved.':`Download incomplete: ${error.message} Completed tiles remain saved; retry to continue.`);}
    finally{controller=null;setBusy(false);failed.clear();await storageInfo();draw();}
  });
  $('map-cancel').onclick=()=>controller?.abort();
  $('map-export').onclick=task(async()=>{
    if(busy)return;const {tiles}=await storageInfo();if(!tiles.length)throw Error('Download a map area first.');setBusy(true);
    try{
      const data=[];
      for(const tile of tiles){const bytes=new Uint8Array(await tile.blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));data.push({id:tile.id,type:tile.blob.type,data:btoa(binary)});}
      const blob=new Blob([JSON.stringify({format:'form8-map-v1',provider:'usgs-topo',view:{...center,zoom},tiles:data})],{type:'application/json'});
      if(globalThis.Form8Native?.saveFile)await Form8Native.saveFile(blob,'form8-offline-map.json');
      else {const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='form8-offline-map.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}
      note('Map exported. Import this file in Form8 after connecting to your radio.');
    }finally{setBusy(false);}
  });
  $('map-import').onchange=task(async()=>{
    const file=$('map-import').files[0];if(!file||busy)return;if(file.size>45*1024*1024)throw Error('Map import limit is 45 MB.');setBusy(true);
    try{
      const pack=validateMapPackage(JSON.parse(await file.text())),saved=await storageInfo(),combined=new Map(saved.tiles.map(t=>[t.id,t]));
      for(const tile of pack.tiles){const bytes=Uint8Array.from(atob(tile.data),c=>c.charCodeAt(0)),blob=new Blob([bytes],{type:tile.type});if(blob.size>512*1024)throw Error('Map tile exceeds 512 KB.');await imageFromBlob(blob);combined.set(tile.id,{id:tile.id,blob});}
      if(combined.size>MAX_TILES||[...combined.values()].reduce((sum,t)=>sum+t.blob.size,0)>MAX_MAP_BYTES)throw Error('Combined maps exceed 400 tiles or 32 MB. Remove saved maps first.');
      await tileStore('putMany',[...combined.values()]);
      if(pack.view&&Number.isFinite(pack.view.lat)&&Math.abs(pack.view.lat)<=85&&Number.isFinite(pack.view.lon)&&Math.abs(pack.view.lon)<=180&&Number.isInteger(pack.view.zoom)&&pack.view.zoom>=0&&pack.view.zoom<=16){center={lat:pack.view.lat,lon:pack.view.lon};zoom=pack.view.zoom;centered=true;saveView();}
      images.clear();failed.clear();note(`Imported ${pack.tiles.length} offline tiles.`);await storageInfo();draw();
    }finally{setBusy(false);$('map-import').value='';}
  });
  $('map-delete').onclick=task(async()=>{if(busy||!confirm('Remove all downloaded maps from this device?'))return;await tileStore('clear');images.clear();failed.clear();await storageInfo();note('Saved maps removed.');draw();});
  $('map-online').onchange=()=>{try{localStorage.setItem('form8-map-online',String($('map-online').checked));}catch{}images.clear();failed.clear();draw();};
  $('map-zoom-in').onclick=()=>setZoom(zoom+1);$('map-zoom-out').onclick=()=>setZoom(zoom-1);
  $('map-center').onclick=()=>{const node=nodes.find(n=>n.own);if(!node){onError('Your location is not available yet. Choose Retry GPS or wait for an onboard fix.');return;}center={lat:node.lat,lon:node.lon};zoom=Math.max(zoom,12);centered=true;saveView();draw();};
  $('map-place').onsubmit=event=>{event.preventDefault();center={lat:Number($('map-lat').value),lon:Number($('map-lon').value)};zoom=12;centered=true;saveView();draw();};
  $('map-pan').onchange=()=>{canvas.classList.toggle('panning',$('map-pan').checked);};
  canvas.addEventListener('pointerdown',event=>{if(!$('map-pan').checked)return;drag={x:event.clientX,y:event.clientY};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!drag)return;move(drag.x-event.clientX,drag.y-event.clientY);drag={x:event.clientX,y:event.clientY};});
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>{drag=null;});
  canvas.addEventListener('keydown',event=>{const keys={ArrowUp:[0,-100],ArrowDown:[0,100],ArrowLeft:[-100,0],ArrowRight:[100,0]};if(keys[event.key]){event.preventDefault();move(...keys[event.key]);}if(['+','-'].includes(event.key)){event.preventDefault();setZoom(zoom+(event.key==='+'?1:-1));}});
  new ResizeObserver(()=>draw()).observe(canvas);
  new MutationObserver(()=>draw(false)).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  storageInfo().catch(error=>note(`Map storage unavailable: ${error.message}`));
  return {update,show(){draw();storageInfo().catch(error=>note(error.message));}};
}
