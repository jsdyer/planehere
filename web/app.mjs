import {validateLocation,validateConfig,visibleAircraft,compass,ageText,csv} from './model.mjs';
const $=id=>document.getElementById(id);
const storageKey='coolcode:planehere:viewpoint';
let config,point,snapshot,visible=[],map,markers,originMarker,rangeCircle,selectedHex,controller;
const status=(text,error=false)=>{$('status').textContent=text;$('status').classList.toggle('error',error);};
const text=(tag,value,cls)=>{const e=document.createElement(tag);e.textContent=value;if(cls)e.className=cls;return e;};
const number=(n,digits=0)=>Number(n).toLocaleString(undefined,{maximumFractionDigits:digits});
function applyPoint(p,name){point=validateLocation(p.lat,p.lon);$('lat').value=point.lat;$('lon').value=point.lon;$('view-title').textContent=name||`${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`;updateMap();}
function updateMap(){
  if(!map||!point)return;
  originMarker.setLatLng([point.lat,point.lon]);rangeCircle.setLatLng([point.lat,point.lon]).setRadius(Number($('radius').value)*1852);
  map.fitBounds(rangeCircle.getBounds(),{padding:[18,18],maxZoom:12});
}
function resetResults(){if(controller){controller.abort();controller=null;$('refresh').disabled=false;$('refresh').textContent='Find aircraft';}snapshot=null;visible=[];markers?.clearLayers();$('count').textContent='— aircraft';$('observed').textContent='No observations loaded for this viewpoint';$('export').disabled=true;empty('Ready for a new view','Choose Find aircraft to load observations for this area.');status('Viewpoint changed. Choose Find aircraft to look here.');}
function empty(title,body){const e=text('div','','empty');e.append(text('h3',title),text('p',body));$('aircraft-list').replaceChildren(e);}
function selectAircraft(hex){selectedHex=hex;for(const card of document.querySelectorAll('.aircraft-card'))card.classList.toggle('selected',card.dataset.hex===hex);const a=visible.find(v=>v.hex===hex);if(a&&map)map.panTo([a.lat,a.lon]);}
function measurement(value,kind){if(value===null||value===undefined)return 'Not reported';const metric=$('units').value==='metric';return kind==='altitude'?`${number(metric?value*.3048:value)} ${metric?'m':'ft'}`:`${number(metric?value*1.852:value)} ${metric?'km/h':'kt'}`;}
function render(){
  if(!snapshot||!point)return;
  try{visible=visibleAircraft(snapshot,point,{radiusNm:Number($('radius').value),ground:$('ground').checked,query:$('filter').value,maxAge:config.positionMaxAgeSeconds});}
  catch(error){status(error.message,true);return;}
  markers?.clearLayers();$('aircraft-list').replaceChildren();$('count').textContent=`${visible.length} aircraft`;$('export').disabled=!visible.length;
  const capture=Date.parse(snapshot.fetched_at),source=Date.parse(snapshot.data.source_at);
  $('observed').textContent=`Source observation ${new Date(source).toLocaleString()} · retrieved ${ageText((Date.now()-capture)/1000)}. Positions below have their own times.`;
  if(!visible.length)empty('No matching aircraft reported','Try a larger radius or include aircraft on the ground. A clear list can also mean limited receiver coverage or observations older than 15 minutes.');
  for(const a of visible){
    const card=text('article','','aircraft-card');card.dataset.hex=a.hex;if(a.hex===selectedHex)card.classList.add('selected');
    const primary=document.createElement('div'),h=document.createElement('h3'),button=text('button',a.callsign||a.registration||a.hex.toUpperCase());button.type='button';button.addEventListener('click',()=>selectAircraft(a.hex));h.append(button);
    primary.append(h,text('p',[a.registration,a.aircraft_type,a.hex.toUpperCase()].filter(Boolean).join(' · '),'identity'),text('p',`${number(a.km,1)} km ${compass(a.bearing)} · bearing ${number(a.bearing)}°`,'position'));
    const dl=document.createElement('dl');
    for(const [label,value] of [['Altitude',a.on_ground?'On ground':measurement(a.altitude_ft,'altitude')],['Ground speed',measurement(a.speed_knots,'speed')],['Track',a.track_deg===null?'Not reported':`${number(a.track_deg)}° ${compass(a.track_deg)}`],['Position age',ageText(a.age)]]){const group=document.createElement('div');group.append(text('dt',label),text('dd',value));dl.append(group);}
    const time=text('time',`Position reported ${new Date(a.position_at).toLocaleString()}`);time.dateTime=a.position_at;card.append(primary,dl,time);$('aircraft-list').append(card);
    if(!map || !globalThis.L)continue;
    const rotation=Number.isFinite(a.track_deg)?a.track_deg:0;
    const icon=L.divIcon({className:'aircraft-pin',html:`<span aria-hidden="true" style="transform:rotate(${rotation}deg)"><svg viewBox="0 0 32 32" width="30" height="30" fill="currentColor"><path d="M16 1 19 11 29 18 29 21 19 18 18 26 22 29 22 31 16 29 10 31 10 29 14 26 13 18 3 21 3 18 13 11Z"/></svg></span>`,iconSize:[32,32],iconAnchor:[16,16]});
    const marker=L.marker([a.lat,a.lon],{icon,title:`${a.callsign||a.hex}: ${number(a.km,1)} km ${compass(a.bearing)}`});
    const popup=document.createElement('div');popup.append(text('strong',a.callsign||a.registration||a.hex),text('p',`${measurement(a.altitude_ft,'altitude')} · ${ageText(a.age)}`));marker.bindPopup(popup);marker.on('click',()=>selectAircraft(a.hex));marker.addTo(markers);
  }
}
async function lookup(event){
  event?.preventDefault();
  try{point=validateLocation($('lat').value,$('lon').value);}catch(error){status(error.message,true);return;}
  if(controller)controller.abort();controller=new AbortController();const thisRequest=controller;
  $('refresh').disabled=true;$('refresh').textContent='Finding aircraft…';status('Checking the shared area observation…');
  applyPoint(point,$('place').value==='custom'?'Your viewpoint':config.presets.find(p=>p.id===$('place').value)?.name);
  try{
    // Exact visitor coordinates never enter the lookup URL.
    const url=new URL('/api/planehere/nearby',config.gateway);url.searchParams.set('lat',(Math.round(point.lat*10)/10).toFixed(1));url.searchParams.set('lon',(Math.round(point.lon*10)/10).toFixed(1));url.searchParams.set('radius',$('radius').value);
    const response=await fetch(url,{signal:thisRequest.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    const type=response.headers.get('content-type')||'';
    if(!type.includes('json'))throw new Error('The aircraft service is not available yet. Please try again later.');
    const result=await response.json();
    if(!response.ok){const retry=Number(response.headers.get('Retry-After'));throw new Error((result.error?.message||'The aircraft service could not complete the lookup.')+(retry>0?` Retry in about ${Math.ceil(retry/60)} minute${retry>60?'s':''}.`:''));}
    if(!Number.isFinite(Date.parse(result.fetched_at))||!Number.isFinite(Date.parse(result.data?.source_at))||!Array.isArray(result.data?.aircraft))throw new Error('The aircraft service returned an unexpected observation.');
    snapshot=result;render();status('Observations loaded. This is a dated snapshot; nearby visitors share it for up to five minutes.');
  }catch(error){if(error.name!=='AbortError')status(error.message+(snapshot?' Previously loaded observations remain below with their original times.':''),true);}
  finally{if(controller===thisRequest){$('refresh').disabled=false;$('refresh').textContent='Find aircraft';controller=null;}}
}
function initMap(){
  if(!globalThis.L){status('The map could not start. Aircraft results remain available as a list.',true);return;}
  map=L.map('map',{scrollWheelZoom:false,worldCopyJump:true}).setView([point.lat,point.lon],10);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  markers=L.layerGroup().addTo(map);
  originMarker=L.circleMarker([point.lat,point.lon],{radius:7,color:'#fff',weight:3,fillColor:'#126d9a',fillOpacity:1}).addTo(map);originMarker.bindTooltip('Your viewpoint');
  rangeCircle=L.circle([point.lat,point.lon],{radius:Number($('radius').value)*1852,color:'#126d9a',weight:1,fillOpacity:.035,dashArray:'5 5'}).addTo(map);updateMap();
}
async function boot(){
  try{
    const response=await fetch('./config.json');if(!response.ok)throw new Error('Place configuration could not be loaded.');config=validateConfig(await response.json());
    $('place').replaceChildren();for(const p of config.presets){const opt=text('option',p.name);opt.value=p.id;$('place').append(opt);}const custom=text('option','Custom coordinates');custom.value='custom';$('place').append(custom);
    $('place').value=config.defaultPlace;$('radius').value=config.defaultRadiusNm;applyPoint(config.presets.find(p=>p.id===config.defaultPlace));
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){applyPoint(saved,'Saved viewpoint');$('place').value='custom';$('forget-place').hidden=false;$('save-status').textContent='Loaded your saved viewpoint from this browser.';}}catch{}
    initMap();$('place').disabled=false;$('refresh').disabled=false;$('save-place').disabled=false;
    $('view-title').textContent=$('place').value==='custom'?'Saved viewpoint':config.presets.find(p=>p.id===$('place').value).name;
    $('lookup').addEventListener('submit',lookup);
    $('place').addEventListener('change',()=>{const p=config.presets.find(p=>p.id===$('place').value);if(p)applyPoint(p,p.name);resetResults();});
    for(const id of ['lat','lon'])$(id).addEventListener('change',()=>{$('place').value='custom';try{applyPoint(validateLocation($('lat').value,$('lon').value),'Your viewpoint');resetResults();}catch(error){status(error.message,true);}});
    $('radius').addEventListener('change',()=>{updateMap();render();});
    for(const id of ['filter','ground','units'])$(id).addEventListener(id==='filter'?'input':'change',render);
    $('locate').addEventListener('click',()=>{if(!navigator.geolocation){status('Location access is unavailable. Enter coordinates instead.',true);return;}$('locate').disabled=true;status('Waiting for location permission…');navigator.geolocation.getCurrentPosition(p=>{applyPoint({lat:p.coords.latitude,lon:p.coords.longitude},'Your location');$('place').value='custom';resetResults();$('locate').disabled=false;status('Location selected. Choose Find aircraft to look nearby.');},()=>{$('locate').disabled=false;status('Location was unavailable or permission was declined. Choose a preset or enter coordinates.',true);},{enableHighAccuracy:false,timeout:10000,maximumAge:60000});});
    $('save-place').addEventListener('click',()=>{try{const p=validateLocation($('lat').value,$('lon').value);localStorage.setItem(storageKey,JSON.stringify(p));$('save-status').textContent='Viewpoint saved only in this browser.';$('forget-place').hidden=false;}catch(error){$('save-status').textContent=error.message||'Browser storage is unavailable.';}});
    $('forget-place').addEventListener('click',()=>{try{localStorage.removeItem(storageKey);$('save-status').textContent='Saved viewpoint removed.';$('forget-place').hidden=true;}catch{$('save-status').textContent='Browser storage is unavailable.';}});
    $('export').addEventListener('click',()=>{if(!snapshot||!visible.length)return;const blob=new Blob([csv(snapshot,visible)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`planehere-${snapshot.fetched_at.slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
    setInterval(()=>{if(snapshot&&!document.activeElement?.closest('.aircraft-list'))render();},30000);
  }catch(error){status(error.message,true);}
}
boot();
