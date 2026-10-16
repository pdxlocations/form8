import {MAX_MAP_BYTES,MAX_TILES,validTileKey} from './map-model.js';
let database;
function open(){return database??=new Promise((resolve,reject)=>{
  const request=indexedDB.open('form8-maps',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('tiles',{keyPath:'id'});
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();database=null;};resolve(request.result);};
  request.onerror=()=>{database=null;reject(request.error);};request.onblocked=()=>reject(Error('Close other Form8 tabs to open map storage.'));
});}
export async function tileStore(action,value){
  const database=await open();
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction('tiles',['get','getAll'].includes(action)?'readonly':'readwrite');
    const store=transaction.objectStore('tiles');
    const request=action==='putMany'?(value.forEach(tile=>store.put(tile)),{}):store[action](value);
    transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error||Error('Map storage is full. Remove saved maps and try again.'));
  });
}
export function validateMapPackage(pack){
  if(pack?.format!=='form8-map-v1'||pack.provider!=='usgs-topo'||!Array.isArray(pack.tiles)||!pack.tiles.length||pack.tiles.length>MAX_TILES)throw Error('Unrecognized map file or more than 400 tiles.');
  let bytes=0;const ids=new Set();
  for(const tile of pack.tiles){
    if(!validTileKey(tile.id)||ids.has(tile.id)||!['image/png','image/jpeg'].includes(tile.type)||typeof tile.data!=='string'||!tile.data.length||tile.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(tile.data))throw Error('Invalid map tile.');
    ids.add(tile.id);bytes+=tile.data.length*3/4;if(bytes>MAX_MAP_BYTES)throw Error('Map file exceeds 32 MB of image data.');
  }
  return pack;
}
