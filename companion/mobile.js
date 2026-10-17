import {Capacitor,CapacitorHttp,registerPlugin} from '@capacitor/core';
import {Geolocation} from '@capacitor/geolocation';
import {token} from '../web/model.js';
import {RadioRpc} from './radio-rpc.js';
import {NrfCompanionApi} from './nrf-api.js';
const android=Capacitor.getPlatform()==='android',link=registerPlugin('Form8Link');
let mode=localStorage.getItem('form8-transport')||'wifi',client=localStorage.getItem('form8-companion-id');
if(!client){client=token();localStorage.setItem('form8-companion-id',client);}
const rpc=new RadioRpc(link,client),api=new NrfCompanionApi((op,data)=>rpc.request(op,data));
let connected=false,connectionLabel='Choose Bluetooth or USB serial, then connect to a Form8 radio.';
function showConnection(message){connectionLabel=message;const e=document.getElementById('native-link-status');if(e)e.textContent=message;}
const restored=api.restore(localStorage.getItem('form8-last-nrf'));
const listeners=android?Promise.all([
 link.addListener('data',e=>rpc.receive(e.base64)),
 link.addListener('connection',e=>{connected=e.connected;api.connected=e.connected;if(!e.connected){rpc.reset(e.reason||'Radio disconnected');showConnection(e.reason||'Radio disconnected');}})
]):Promise.resolve();
globalThis.Form8Native={
 isNative:()=>Capacitor.isNativePlatform(),
 request:async options=>{
  if(mode==='wifi')return CapacitorHttp.request(options);
  try{await restored;return {status:200,data:await api.request(new URL(options.url).pathname.replace('/api/','')+new URL(options.url).search,options.data)};}catch(error){return {status:503,data:{error:error.message}};}
 },
 getLocation:async options=>{await Geolocation.requestPermissions({permissions:['location']});return Geolocation.getCurrentPosition(options);},
 ...(android?{saveFile:async(blob,name)=>{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(blob);});return link.saveFile({base64:data,name,mime:blob.type||'application/octet-stream'});}}:{})
};
function element(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;return e;}
async function mount(){if(Capacitor.getPlatform()!=='android')return;const settings=document.getElementById('settings');if(!settings)return;
 const card=element('section');card.className='card';const title=element('h3','Radio connection'),description=element('p','ESP32: Wi-Fi hotspot. nRF52840: Bluetooth or USB serial. Forms and chat from nRF radios are stored on this Android device.'),select=element('select'),label=element('label','Connection type');select.setAttribute('aria-label','Connection type');for(const [value,name] of [['wifi','Wi-Fi (ESP32)'],['ble','Bluetooth (nRF52)'],['usb','USB serial (nRF52)']]){const o=element('option',name);o.value=value;select.append(o);}select.value=mode;label.append(select);
 const controls=element('div');controls.className='actions';const scan=element('button','Find radios'),devices=element('select'),connect=element('button','Connect'),disconnect=element('button','Disconnect');for(const b of [scan,connect,disconnect])b.type='button';devices.setAttribute('aria-label','Available radios');const state=element('p',connectionLabel);state.id='native-link-status';state.setAttribute('role','status');controls.append(scan,devices,connect,disconnect);card.append(title,description,label,controls,state);settings.prepend(card);
 const refresh=()=>{controls.hidden=mode==='wifi';connect.disabled=!devices.options.length;};refresh();
 async function task(fn){for(const b of [scan,connect,disconnect,select])b.disabled=true;try{await fn();}catch(e){showConnection(e.message);}finally{for(const b of [scan,connect,disconnect,select])b.disabled=false;refresh();}}
 select.onchange=()=>task(async()=>{mode=select.value;localStorage.setItem('form8-transport',mode);rpc.reset();await link.disconnect();devices.replaceChildren();showConnection(mode==='wifi'?'Connect this phone to the Form8 Wi-Fi hotspot.':'Find your radio, select it, then tap Connect.');});
 scan.onclick=()=>task(async()=>{await listeners;showConnection(mode==='ble'?'Scanning for Form8 Bluetooth radios…':'Looking for USB radios…');const result=await (mode==='ble'?link.scanBle():link.listUsb());devices.replaceChildren();for(const d of result.devices){const o=element('option',`${d.name} · ${d.id}`);o.value=d.id;devices.append(o);}showConnection(result.devices.length?'Select a radio and tap Connect.':mode==='ble'?'No Form8 radios found. Check firmware and Bluetooth; on older Android also enable Location.':'No USB radio found. Use a data cable and USB OTG adapter.');});
 connect.onclick=()=>task(async()=>{await listeners;rpc.reset();showConnection('Connecting and checking companion storage…');await(mode==='ble'?link.connectBle({id:devices.value}):link.connectUsb({id:devices.value}));try{const s=await api.connect();localStorage.setItem('form8-last-nrf',s.node);showConnection(`Connected to ${s.board} · ${s.node}. Keep Form8 open to receive and store messages.`);}catch(e){await link.disconnect();throw e;}});
 disconnect.onclick=()=>task(async()=>{await link.disconnect();showConnection('Disconnected. Drafts, archives, maps, and previously loaded nRF traffic remain on this phone.');});
 // Keep the host lease alive and save/ACK incoming traffic even while another tab is selected.
 let polling=false;setInterval(async()=>{if(mode==='wifi'||!connected||!api.status||polling)return;polling=true;try{await api.request('status');}catch(e){showConnection(e.message);}finally{polling=false;}},2500);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode!=='wifi'&&connected)showConnection('Keep Form8 in the foreground for reliable receiving. Android may suspend background apps.');});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
