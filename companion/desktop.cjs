const {app,BrowserWindow}=require('electron');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
let server;
app.whenReady().then(()=>{
  // A fixed loopback origin preserves browser storage across app restarts. Proxy
  // to the radio avoids mixed-content and cross-origin restrictions in browsers.
  const allowed=new Set(['index.html','app.js','theme.js','position-client.js','map.js','map-model.js','map-store.js','model.js','unread.js','style.css','sw.js','manifest.webmanifest','icon.svg']);
  const mimes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
  server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.host!=='127.0.0.1:8848'){res.writeHead(403);res.end();return;}
      if(req.url.startsWith('/api/')){
        const chunks=[];let size=0;
        for await(const c of req){size+=c.length;if(size>8192)throw Error('Request too large');chunks.push(c);}
        const response=await fetch(`http://192.168.4.1${req.url}`,{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='GET'?undefined:Buffer.concat(chunks),signal:AbortSignal.timeout(15000)});
        res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
      }
      const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
      if(!allowed.has(file)){res.writeHead(404);res.end();return;}
      res.writeHead(200,{'Content-Type':mimes[path.extname(file)]||'text/plain','Cache-Control':'no-cache'});
      res.end(fs.readFileSync(path.join(__dirname,'../web',file)));
    }catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Radio unavailable; local drafts remain available.'}));}
  });
  server.on('error',e=>{console.error('Cannot bind Form8 local server:',e.message);app.quit();});
  server.listen(8848,'127.0.0.1',()=>{
    const win=new BrowserWindow({width:1160,height:900,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('http://127.0.0.1:8848/'))event.preventDefault();});
    win.loadURL('http://127.0.0.1:8848');
  });
});
app.on('window-all-closed',()=>{server?.close();app.quit();});
