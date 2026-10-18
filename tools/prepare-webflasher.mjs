// Keep the uploadable map downloader compatible with the radio's map files.
import {mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const assets=['actions.js','map.js','map-model.js','map-store.js','position-client.js','theme.js','style.css'];
await mkdir(new URL('webflasher/map-assets/',root),{recursive:true});
for(const name of assets)await copyFile(new URL(`web/${name}`,root),new URL(`webflasher/map-assets/${name}`,root));
console.log('Standalone map downloader assets prepared in webflasher/map-assets.');

await copyFile(new URL('config/nrf52-targets.json',root),new URL('webflasher/nrf52-targets.json',root));
