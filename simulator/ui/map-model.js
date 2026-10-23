export const TILE_SIZE=256,MAX_TILES=400,MAX_MAP_BYTES=32*1024*1024;
export const TILE_BASE='https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile';
export function project(lat,lon,z){
  const n=2**z,s=Math.sin(Math.max(-85.05112878,Math.min(85.05112878,lat))*Math.PI/180);
  return {x:(lon+180)/360*n,y:(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n};
}
export function unproject(x,y,z){const n=2**z;return {lat:Math.atan(Math.sinh(Math.PI*(1-2*y/n)))*180/Math.PI,lon:((x/n*360)%360+360)%360-180};}
export function tileKey(z,x,y){return `${z}/${((x%2**z)+2**z)%2**z}/${y}`;}
export function tileUrl(key){const [z,x,y]=key.split('/');return `${TILE_BASE}/${z}/${y}/${x}`;}
export function validTileKey(key){const a=key.split('/').map(Number);return /^\d+\/\d+\/\d+$/.test(key)&&a.length===3&&a.every(Number.isInteger)&&a[0]>=0&&a[0]<=16&&a[1]>=0&&a[2]>=0&&a[1]<2**a[0]&&a[2]<2**a[0];}
export function visibleTiles(center,z,width,height){
  const p=project(center.lat,center.lon,z),left=p.x-width/512,top=p.y-height/512,tiles=[];
  for(let y=Math.max(0,Math.floor(top));y<=Math.min(2**z-1,Math.floor(top+height/256));y++)
    for(let x=Math.floor(left);x<=Math.floor(left+width/256);x++)tiles.push({key:tileKey(z,x,y),x:(x-left)*256,y:(y-top)*256});
  return tiles;
}
export function downloadTiles(center,z,width,height,detail=Math.min(16,z+2)){
  const keys=new Set();
  for(let level=Math.min(8,z);level<=detail;level++){
    const scale=2**(level-z);
    for(const tile of visibleTiles(center,level,width*scale,height*scale)){
      keys.add(tile.key);if(keys.size>MAX_TILES)throw Error('Area too large. Zoom in or choose less offline detail (maximum 400 tiles).');
    }
  }
  return [...keys];
}
export function mapNodes(status){
  const valid=l=>l&&Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&Math.abs(l.lat)<=90&&Math.abs(l.lon)<=180;
  if(!status)return [];
  const nodes=[];
  if(valid(status.location))nodes.push({id:status.node,call:status.callsign||'This node',own:true,online:true,...status.location});
  for(const peer of status.peers||[])if(peer.incident===status.incident&&valid(peer.location)&&peer.location.ageMs<=1800000)nodes.push({id:peer.id,call:peer.callsign||peer.id,online:peer.online,...peer.location});
  return nodes;
}
