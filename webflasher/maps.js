import {createMapPanel} from './map-assets/map.js';
import {deviceLocation,locationPayload} from './map-assets/position-client.js';
const $=id=>document.getElementById(id);
const feedback=message=>{const element=$('feedback');element.textContent=message;element.classList.add('error');element.hidden=false;};
const panel=createMapPanel({onError:feedback});
panel.show();
$('locate').onclick=async()=>{
  const button=$('locate');button.disabled=true;$('location-status').textContent='Getting your location…';
  try{
    const fix=locationPayload(await deviceLocation());
    $('map-lat').value=fix.lat;$('map-lon').value=fix.lon;
    // Center without contacting a radio or adding station data to the map file.
    $('map-place').requestSubmit();
    $('location-status').textContent=`Location found: ${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}${fix.accuracy!==undefined?` · ±${Math.ceil(fix.accuracy)} m`:''}.`;
    $('feedback').hidden=true;
  }catch(error){
    const message=error.code===1?'Location permission denied. Enter coordinates instead, or allow location access and try again.':error.message||'Could not get your location. Enter coordinates instead.';
    $('location-status').textContent=message;
  }finally{button.disabled=false;}
};
