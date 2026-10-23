import {simulator} from './network.js';
window.simulator=simulator;
const grid=document.querySelector('.nodes');
for(const [i,node] of simulator.nodes.entries()){
 const section=document.createElement('section');
 const heading=document.createElement('h2');heading.textContent=`${node.config.callsign} · ${node.role}`;
 const frame=document.createElement('iframe');frame.title=`Node ${i+1} full Form8 interface`;frame.src=`ui/index.html?node=${i}`;
 const place=document.createElement('p');place.className='station-location';place.textContent=`${node.place} · ${node.location.lat.toFixed(4)}, ${node.location.lon.toFixed(4)}`;
 section.append(heading,place,frame);grid.append(section);
}
document.querySelector('#restart').addEventListener('click',()=>{if(confirm('Restart all three radios? Network messages and pending transmissions will be cleared. Local drafts and archives are kept.'))location.reload();});
document.addEventListener('radio-log',event=>{const list=document.querySelector('#activity'),item=document.createElement('li');item.textContent=`${new Date().toLocaleTimeString()} · ${event.detail}`;list.prepend(item);while(list.children.length>60)list.lastChild.remove();});
