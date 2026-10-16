export function validLocation(location){return !!location && Number.isFinite(location.lat)&&Number.isFinite(location.lon)&&Math.abs(location.lat)<=90&&Math.abs(location.lon)<=180;}
export async function deviceLocation(){
  const options={enableHighAccuracy:true,timeout:15000,maximumAge:30000};
  if(globalThis.Form8Native?.isNative())return Form8Native.getLocation(options);
  if(!window.isSecureContext || !navigator.geolocation)throw Error('Phone GPS needs the companion app or a browser with location access. The radio’s HTTP hotspot page cannot use GPS in most browsers.');
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,options));
}
export function locationPayload(position,now=Date.now()){
  const {latitude:lat,longitude:lon,accuracy}=position.coords;
  const ageMs=Math.max(0,Math.round(now-position.timestamp));
  if(!validLocation({lat,lon})||!Number.isFinite(ageMs)||ageMs>120000)throw Error('No fresh GPS fix. Move outside and try again.');
  return {lat,lon,ageMs,...(Number.isFinite(accuracy)&&accuracy>=0&&accuracy<=65534?{accuracy}:{})};
}
export class PositionClient {
  constructor({getLocation=deviceLocation,post,onStatus=()=>{},now=()=>Date.now(),visible=()=>!document.hidden}){
    Object.assign(this,{getLocation,post,onStatus,now,visible});this.target='';this.next=0;this.busy=false;this.denied=false;this.message='';
  }
  update(status){
    const target=status?`${status.node}:${status.bootSession??''}`:'';
    if(target!==this.target){this.target=target;this.next=0;}
    this.status=status;
    const fix=status?.location;
    if(validLocation(fix))this.onStatus(`${fix.source==='radio'?'Onboard GPS':'Phone GPS'} · ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)} · ${Math.floor(fix.ageMs/1000)}s old${fix.fresh?'':' · last known'}`);
    else this.onStatus(this.message || (status?.gpsAvailable?'Waiting for onboard GPS; trying phone location…':'Waiting for phone location…'));
    if(status && !status.gpsFresh && !this.busy && !this.denied && this.visible() && this.now()>=this.next)this.acquire();
  }
  async acquire(force=false){
    if(this.busy)return;
    this.busy=true;const target=this.target;
    try{
      const payload=locationPayload(await this.getLocation(),this.now());
      if(target!==this.target || !this.status)return;
      await this.post(payload);
      this.message='Phone GPS updated.';this.denied=false;this.onStatus(this.message);return payload;
    }catch(error){
      this.denied=error.code===1;
      this.message=this.denied?'Location permission denied. Enable location access, then choose Retry GPS.':error.message||'Waiting for a GPS fix. Move outside and retry.';
      this.onStatus(this.message);
      if(force)throw Error(this.message);
    }finally{this.busy=false;this.next=this.now()+60000;}
  }
  retry(){this.denied=false;this.next=0;return this.acquire(true);}
}
