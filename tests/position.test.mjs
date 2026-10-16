import test from 'node:test';
import assert from 'node:assert/strict';
import {PositionClient,locationPayload} from '../web/position-client.js';
import {project,unproject,visibleTiles,downloadTiles,validTileKey,tileUrl,mapNodes} from '../web/map-model.js';
import {validateMapPackage} from '../web/map-store.js';
const fix=(now=1800000000000)=>({coords:{latitude:45.52,longitude:-122.68,accuracy:8},timestamp:now});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('phone fixes preserve accuracy and reject invalid/stale coordinates',()=>{
  assert.deepEqual(locationPayload(fix(),1800000000000),{lat:45.52,lon:-122.68,accuracy:8,ageMs:0});
  assert.throws(()=>locationPayload(fix(1)),/fresh/);
  assert.throws(()=>locationPayload({coords:{latitude:NaN,longitude:0},timestamp:Date.now()}),/fresh/);
});
test('automatic phone positioning yields to onboard GPS and samples once per minute',async()=>{
  let now=1800000000000,reads=0;const posts=[];
  const c=new PositionClient({now:()=>now,visible:()=>true,getLocation:async()=>{reads++;return fix(now);},post:async payload=>posts.push(payload)});
  c.update({node:'a',gpsFresh:true});await flush();assert.equal(reads,0);
  c.update({node:'a',gpsFresh:false});await flush();assert.equal(reads,1);assert.equal(posts.length,1);
  c.update({node:'a'});await flush();assert.equal(reads,1);
  now+=60000;c.update({node:'a'});await flush();assert.equal(reads,2);
  c.update({node:'b',bootSession:1});await flush();assert.equal(reads,3);
});
test('permission denial waits for explicit retry and hidden pages do not acquire GPS',async()=>{
  let visible=false,reads=0,denied=true;
  const c=new PositionClient({now:()=>1800000000000,visible:()=>visible,getLocation:async()=>{reads++;if(denied)throw {code:1};return fix();},post:async()=>{}});
  c.update({node:'a'});await flush();assert.equal(reads,0);
  visible=true;c.update({node:'a'});await flush();assert.equal(reads,1);assert.equal(c.denied,true);
  c.update({node:'a'});await flush();assert.equal(reads,1);
  denied=false;await c.retry();assert.equal(reads,2);assert.equal(c.denied,false);
});
test('a phone fix acquired for one radio is not posted after switching radios or disconnecting',async()=>{
  let resolve;const posts=[];
  const c=new PositionClient({now:()=>1800000000000,visible:()=>true,getLocation:()=>new Promise(r=>resolve=r),post:async p=>posts.push(p)});
  c.update({node:'a'});c.update({node:'b'});resolve(fix());await flush();assert.equal(posts.length,0);
  c.next=0;c.update({node:'b'});c.update(null);resolve(fix());await flush();assert.equal(posts.length,0);
});
test('projection round trips and tile wrapping handle poles and the date line',()=>{
  for(const [lat,lon] of [[45.52,-122.68],[0,0],[-45,179.99],[80,-179.99]]){
    const p=project(lat,lon,12),r=unproject(p.x,p.y,12);assert.ok(Math.abs(lat-r.lat)<1e-7);assert.ok(Math.abs(lon-r.lon)<1e-7);
  }
  for(const t of visibleTiles({lat:90,lon:180},3,390,300))assert.equal(validTileKey(t.key),true);
  assert.equal(tileUrl('12/652/1457'),'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/12/1457/652');
});
test('offline downloads cover the visible area at selected detail and cap tile count',()=>{
  const center={lat:45.52,lon:-122.68},keys=downloadTiles(center,12,390,300,14);
  assert.ok(keys.length>10&&keys.length<=400);assert.equal(keys.length,new Set(keys).size);assert.ok(keys.every(validTileKey));
  for(const tile of visibleTiles(center,12,390,300))assert.ok(keys.includes(tile.key));
  assert.throws(()=>downloadTiles(center,4,1100,800,16),/too large/);
});
test('map includes own location and only current incident peers with recent valid reports',()=>{
  const s={node:'a',callsign:'A',incident:'42',location:{lat:0,lon:0},peers:[{id:'b',incident:'42',location:{lat:45,lon:1,ageMs:600000}},{id:'c',incident:'99',location:{lat:45,lon:1,ageMs:1}},{id:'d',incident:'42',location:{lat:45,lon:1,ageMs:1800001}},{id:'e',incident:'42',location:{lat:NaN,lon:1,ageMs:1}}]};
  assert.deepEqual(mapNodes(s).map(n=>n.id),['a','b']);assert.deepEqual(mapNodes(null),[]);
});
test('offline imports reject bad providers, tile coordinates, duplicate tiles and oversized data',()=>{
  const pack={format:'form8-map-v1',provider:'usgs-topo',tiles:[{id:'12/652/1457',type:'image/png',data:'YWJj'}]};
  assert.equal(validateMapPackage(pack),pack);
  assert.throws(()=>validateMapPackage({...pack,provider:'osm'}));
  assert.throws(()=>validateMapPackage({...pack,tiles:[{...pack.tiles[0],id:'1/99/0'}]}));
  assert.throws(()=>validateMapPackage({...pack,tiles:[...pack.tiles,...pack.tiles]}));
  assert.throws(()=>validateMapPackage({...pack,tiles:[{...pack.tiles[0],data:'A'.repeat(48*1024*1024)}]}));
});
