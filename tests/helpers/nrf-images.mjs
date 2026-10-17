import {createHash} from 'node:crypto';
export function uf2At(start){
 const bytes=new Uint8Array(512),v=new DataView(bytes.buffer);bytes.fill(255,32,288);
 [0x0a324655,0x9e5d5157,0x2000,start,256,0,1,0xada52840].forEach((n,i)=>v.setUint32(i*4,n,true));
 v.setUint32(32,0x20040000,true);v.setUint32(36,start|1,true);v.setUint32(508,0x0ab16f30,true);return bytes;
}
export function hexAt(start){
 const record=(address,kind,payload)=>{const bytes=[payload.length,address>>8,address&255,kind,...payload];bytes.push((-bytes.reduce((a,b)=>a+b,0))&255);return ':'+bytes.map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();};
 const payload=new Uint8Array(8),v=new DataView(payload.buffer);v.setUint32(0,0x20040000,true);v.setUint32(4,start|1,true);
 return new TextEncoder().encode([record(0,4,[start>>24,(start>>16)&255]),record(start&65535,0,[...payload]),record(0,1,[])].join('\n')+'\n');
}
export function imageFor(file,bytes){return {file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
