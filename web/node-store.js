// Each physical radio owns a separate client workspace. Never delete the old
// database on a switch: returning to that node reopens the same saved data.
const stores=['drafts','archives','settings'];
const databases=new Map();
export function openClientDatabase(node='') {
  const name=node?`form8-client-${node}`:'form8-client';
  if(!databases.has(name))databases.set(name,new Promise((resolve,reject)=>{
    const request=indexedDB.open(name,2);
    request.onupgradeneeded=()=>{for(const store of stores)if(!request.result.objectStoreNames.contains(store))request.result.createObjectStore(store,{keyPath:'id'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();databases.delete(name);};resolve(request.result);};
    request.onerror=()=>{databases.delete(name);reject(request.error);};
    request.onblocked=()=>reject(Error('Close other Form8 tabs, then reopen this page to update local draft storage.'));
  }));
  return databases.get(name);
}
export async function claimLegacyClientData(node,importLegacy=false) {
  if(!importLegacy)return openClientDatabase(node);
  // Old releases shared drafts/archives. Assign that intact legacy store once,
  // only after an explicit import; their original node was never recorded.
  const legacy=await openClientDatabase();
  const snapshot=await new Promise((resolve,reject)=>{
    const tx=legacy.transaction(stores,'readwrite'),settings=tx.objectStore('settings');
    const owner=settings.get('node-data-owner'),data={};
    for(const store of stores){const read=tx.objectStore(store).getAll();read.onsuccess=()=>{data[store]=read.result;};}
    owner.onsuccess=()=>{if(!owner.result)settings.put({id:'node-data-owner',value:node});};
    tx.oncomplete=()=>resolve(!owner.result||owner.result.value===node?data:null);
    tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not preserve existing client data.'));
  });
  const database=await openClientDatabase(node);
  if(snapshot)await new Promise((resolve,reject)=>{
    const tx=database.transaction(stores,'readwrite'),settings=tx.objectStore('settings'),done=settings.get('legacy-imported');
    done.onsuccess=()=>{
      if(done.result)return;
      for(const store of stores)for(const record of snapshot[store]){
        if(['node-data-owner','legacy-imported'].includes(record.id))continue;
        const target=tx.objectStore(store),existing=target.get(record.id);
        existing.onsuccess=()=>{if(!existing.result)target.put(record);};
      }
      settings.put({id:'legacy-imported',value:true});
    };
    tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not preserve existing client data.'));
  });
  return database;
}

export async function legacyClientDataSummary(node) {
  const legacy=await openClientDatabase();
  const data=await new Promise((resolve,reject)=>{
    const tx=legacy.transaction(stores),drafts=tx.objectStore('drafts').getAll(),archives=tx.objectStore('archives').getAll(),owner=tx.objectStore('settings').get('node-data-owner');
    tx.oncomplete=()=>resolve({drafts:drafts.result.length,archives:archives.result.length,owner:owner.result?.value});
    tx.onerror=tx.onabort=()=>reject(tx.error||Error('Could not read previous client data.'));
  });
  if(data.owner && data.owner!==node)return null;
  if(data.owner){
    const target=await openClientDatabase(node);
    const imported=await new Promise((resolve,reject)=>{const r=target.transaction('settings').objectStore('settings').get('legacy-imported');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    if(imported)return null;
  }
  return data.drafts||data.archives?data:null;
}
