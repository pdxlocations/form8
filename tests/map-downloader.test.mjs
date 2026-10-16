import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateMapPackage as websitePackage} from '../webflasher/map-assets/map-store.js';
import {validateMapPackage as radioPackage} from '../web/map-store.js';
const root=new URL('../',import.meta.url);
test('uploadable map assets stay identical to the radio app and its export format',()=>{
  for(const name of ['map.js','map-model.js','map-store.js','position-client.js','theme.js','style.css'])
    assert.equal(readFileSync(new URL(`webflasher/map-assets/${name}`,root),'utf8'),readFileSync(new URL(`web/${name}`,root),'utf8'),`Run npm run webflasher:prepare after changing web/${name}`);
  const pack={format:'form8-map-v1',provider:'usgs-topo',tiles:[{id:'12/652/1457',type:'image/png',data:'YWJj'}]};
  assert.equal(websitePackage(pack),radioPackage(pack));
});
test('standalone page includes every map control without requiring radio API or firmware installer',()=>{
  const html=readFileSync(new URL('webflasher/maps.html',root),'utf8');
  for(const id of ['map','node-map','map-place','map-lat','map-lon','map-center','map-pan','map-zoom-in','map-zoom-out','map-nodes','map-view-status','map-online','map-detail','map-download','map-cancel','map-export','map-import','map-delete','map-download-status','map-storage','appearance','locate','feedback'])assert.ok(html.includes(`id="${id}"`),id);
  assert.match(html,/Export the map file and import it there/);
  assert.ok(!html.includes('src="app.js"'));
  assert.ok(!html.includes('esp-web-install-button'));
  assert.match(readFileSync(new URL('webflasher/index.html',root),'utf8'),/href="maps.html"/);
  const script=readFileSync(new URL('webflasher/maps.js',root),'utf8');
  assert.ok(!script.includes('/api/'));
});
