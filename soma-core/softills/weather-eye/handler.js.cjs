#!/usr/bin/env node
const path=require('path');
function main(){let i;const a=process.argv[2];if(a&&a!=='--'){try{i=JSON.parse(require('fs').readFileSync(path.resolve(a),'utf-8'))}catch(e){return out('ERROR','Read: '+e.message)}}else{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>{try{i=JSON.parse(Buffer.concat(c).toString());h(i)}catch(e){out('ERROR','Parse: '+e.message)}});return}h(i)}
async function h(input){
  const api=require('./api/connector');
  const lat=input.lat||input.latitude||39.9;
  const lon=input.lon||input.longitude||116.4;
  try{
    const d=await api.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
    const c=d.current||{};const dy=d.daily||{};
    const wm={0:'☀️',1:'🌤',2:'⛅',3:'☁️',45:'🌫',51:'🌦',61:'🌧',71:'🌨',95:'⛈'};
    const weather=wm[c.weather_code]||'🌡';
    return out('PASS',`${weather} ${c.temperature_2m}°C feels ${c.apparent_temperature}°C, ${dy.temperature_2m_max?.[0]}°C/${dy.temperature_2m_min?.[0]}°C`,{
      temp:c.temperature_2m,feelsLike:c.apparent_temperature,humidity:c.relative_humidity_2m,precipitation:c.precipitation,windSpeed:c.wind_speed_10m,weatherCode:c.weather_code,weatherIcon:weather,high:dy.temperature_2m_max?.[0],low:dy.temperature_2m_min?.[0],lat,lon,
    });
  }catch(e){return out('ERROR',e.message.slice(0,200))}
}
function out(r,s,d){console.log(JSON.stringify({softill:'weather-eye',result:r,summary:s,data:d||{},evidence:[]},null,2));process.exit(r==='PASS'?0:1);}
if(require.main===module)main();
