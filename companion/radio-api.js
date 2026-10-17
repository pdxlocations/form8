// ESP32 keeps its durable store on the radio; BLE dispatches the same HTTP API.
export class RadioCompanionApi {
 constructor(rpc){this.rpc=rpc;this.connected=false;this.status=null;}
 async connect(hello){if(hello.protocol!=='form8-api-v1'||hello.storage!=='radio')throw new Error('Unsupported radio API');this.connected=true;this.status=await this.request('status');return this.status;}
 async request(path,body){
  if(!this.connected)throw new Error('Radio disconnected. Reconnect Bluetooth or use the Wi-Fi hotspot.');
  const url=new URL(path,'http://form8/api/');if(url.origin!=='http://form8'||!url.pathname.startsWith('/api/'))throw new Error('Invalid radio API path');
  const response=await this.rpc('http',{path:url.pathname+url.search,method:body===undefined?'GET':'POST',...(body===undefined?{}:{body})});
  if(!response||!Number.isInteger(response.status))throw new Error('Invalid radio API response');
  if(response.status>=400)throw new Error(response.data?.error||'Radio request failed');
  if(url.pathname==='/api/status')this.status=response.data;
  return response.data;
 }
}
