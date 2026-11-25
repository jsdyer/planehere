import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateLocation,distanceBearing,compass,validateConfig,visibleAircraft,ageText,csv} from '../web/model.mjs';
const time=Date.parse('2026-11-25T12:00:00Z');
const aircraft=[{hex:'aaaaaa',lat:0,lon:0.1,callsign:'ABC123',registration:'C-ABC',aircraft_type:'A320',position_at:new Date(time-2000).toISOString(),on_ground:false},
{hex:'bbbbbb',lat:0.1,lon:0,position_at:new Date(time-3000).toISOString(),on_ground:true},
{hex:'cccccc',lat:0,lon:0,position_at:new Date(time-3600000).toISOString(),on_ground:false},
{hex:'dddddd',lat:0,lon:2,position_at:new Date(time).toISOString(),on_ground:false}];
const snapshot={fetched_at:new Date(time).toISOString(),data:{aircraft}};
test('locations reject empty, infinite and out of range coordinates',()=>{for(const pair of [['',0],[0,''],[91,0],[0,-181],[NaN,0]])assert.throws(()=>validateLocation(...pair));assert.deepEqual(validateLocation('-90','180'),{lat:-90,lon:180});});
test('great circle bearing and distance cross date line correctly',()=>{const a=distanceBearing({lat:0,lon:0},{lat:0,lon:1});assert.ok(Math.abs(a.km-111.195)<.01);assert.equal(a.bearing,90);const b=distanceBearing({lat:0,lon:179.9},{lat:0,lon:-179.9});assert.ok(b.km<23);assert.equal(b.bearing,90);assert.equal(compass(360),'N');});
test('filter hides stale positions and ground traffic, exact radius independent of source envelope',()=>{const list=visibleAircraft(snapshot,{lat:0,lon:0},{radiusNm:25,now:time});assert.deepEqual(list.map(a=>a.hex),['aaaaaa']);assert.equal(visibleAircraft(snapshot,{lat:0,lon:0},{radiusNm:25,now:time,ground:true}).length,2);assert.equal(visibleAircraft(snapshot,{lat:0,lon:0},{radiusNm:10,now:time,query:'a320'}).length,1);assert.equal(visibleAircraft(snapshot,{lat:0,lon:0},{radiusNm:25,now:time+1000000}).length,0);});
test('configuration supports a place beyond the starter list',()=>{const config=JSON.parse(fs.readFileSync(new URL('../web/config.json',import.meta.url)));config.presets.push({id:'test',name:'An additional place',lat:12.3,lon:45.6});config.defaultPlace='test';assert.equal(validateConfig(config).presets.at(-1).name,'An additional place');config.presets.push({...config.presets[0]});assert.throws(()=>validateConfig(config));});
test('CSV retains observation date and attribution and neutralizes spreadsheet formula values',()=>{const rows=visibleAircraft(snapshot,{lat:0,lon:0},{now:time});rows[0].callsign='=HYPERLINK("bad")';const output=csv(snapshot,rows);assert.ok(output.includes('"\'=HYPERLINK(""bad"")"'));assert.ok(output.includes('2026-11-25T11:59:58.000Z'));assert.ok(output.includes('ODbL-1.0'));assert.equal(ageText(90),'1m ago');});
