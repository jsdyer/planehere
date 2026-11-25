const rad = n => n*Math.PI/180;
export function validateLocation(lat,lon) {
  if (String(lat).trim()==='' || String(lon).trim()==='') throw new Error('Enter both latitude and longitude.');
  const point={lat:Number(lat),lon:Number(lon)};
  if (!Number.isFinite(point.lat)||!Number.isFinite(point.lon)||Math.abs(point.lat)>90||Math.abs(point.lon)>180) throw new Error('Latitude must be −90 to 90; longitude must be −180 to 180.');
  return point;
}
export function distanceBearing(a,b) {
  const p1=rad(a.lat),p2=rad(b.lat),dp=p2-p1,dl=rad(b.lon-a.lon);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  const km=6371.0088*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
  const bearing=(Math.atan2(Math.sin(dl)*Math.cos(p2),Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl))*180/Math.PI+360)%360;
  return {km,nm:km/1.852,bearing};
}
export function compass(degrees) { return ['N','NE','E','SE','S','SW','W','NW'][Math.round(degrees/45)%8]; }
export function validateConfig(config) {
  if(!config || !Array.isArray(config.presets) || !config.presets.length)throw new Error('No places are configured.');
  const gateway=new URL(config.gateway);
  if(gateway.protocol!=='https:' || gateway.username || gateway.password || gateway.search || gateway.hash)throw new Error('Invalid service address.');
  const ids=new Set();
  for(const p of config.presets){validateLocation(p.lat,p.lon);if(!p.id||!p.name||ids.has(p.id))throw new Error('Invalid place configuration.');ids.add(p.id);}
  if(!ids.has(config.defaultPlace) || ![10,25,50].includes(config.defaultRadiusNm))throw new Error('Invalid starting place.');
  if(!Number.isFinite(config.positionMaxAgeSeconds)||config.positionMaxAgeSeconds<30||config.positionMaxAgeSeconds>3600)throw new Error('Invalid observation age limit.');
  return config;
}
export function visibleAircraft(snapshot,point,{radiusNm=25,ground=false,query='',now=Date.now(),maxAge=900}={}) {
  if(!snapshot?.data || !Array.isArray(snapshot.data.aircraft))throw new Error('The service returned an unexpected result.');
  const match=query.trim().toLowerCase();
  return snapshot.data.aircraft.map(a=>({...a,...distanceBearing(point,a),age:Math.max(0,(now-Date.parse(a.position_at))/1000)}))
    .filter(a=>Number.isFinite(a.age)&&a.age<=maxAge&&a.nm<=radiusNm&&(ground||!a.on_ground)&&(!match||[a.callsign,a.registration,a.aircraft_type,a.hex].some(v=>String(v||'').toLowerCase().includes(match))))
    .sort((a,b)=>a.km-b.km||a.hex.localeCompare(b.hex));
}
export function ageText(seconds) {
  if (!Number.isFinite(seconds))return 'Unknown';
  if(seconds<60)return `${Math.max(0,Math.floor(seconds))}s ago`;
  if(seconds<3600)return `${Math.floor(seconds/60)}m ago`;
  return `${Math.floor(seconds/3600)}h ago`;
}
export function csv(snapshot,aircraft) {
  const escape=v=>{let value=String(v??'');if(typeof v==='string'&&/^[=+@\-\t\r]/.test(value))value="'"+value;return '"'+value.replaceAll('"','""')+'"';};
  const headers=['callsign','registration','aircraft_type','hex','latitude','longitude','altitude_ft','speed_knots','distance_km','bearing_deg','position_at','source','licence'];
  const rows=aircraft.map(a=>[a.callsign,a.registration,a.aircraft_type,a.hex,a.lat,a.lon,a.altitude_ft,a.speed_knots,a.km.toFixed(2),a.bearing.toFixed(1),a.position_at,'adsb.lol','ODbL-1.0']);
  return [headers,...rows].map(r=>r.map(escape).join(',')).join('\r\n');
}
