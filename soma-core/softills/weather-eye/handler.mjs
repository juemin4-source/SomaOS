#!/usr/bin/env node
/**
 * weather-eye — handler.mjs
 * 通过 Open-Meteo API 查询天气
 */
import { get } from '../_shared/connector.mjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function main() {
  let input;
  const a = process.argv[2];
  if (a && a !== '--') {
    try { input = JSON.parse(readFileSync(resolve(a), 'utf-8')); }
    catch (e) { return out('ERROR', 'Read: ' + e.message); }
  } else {
    const c = [];
    process.stdin.on('data', d => c.push(d));
    process.stdin.on('end', () => {
      try { input = JSON.parse(Buffer.concat(c).toString()); handle(input); }
      catch (e) { out('ERROR', 'Parse: ' + e.message); }
    });
    return;
  }
  handle(input);
}

async function handle(input) {
  const lat = input.lat || input.latitude || 39.9;
  const lon = input.lon || input.longitude || 116.4;
  try {
    const d = await get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
    const c = d.current || {};
    const dy = d.daily || {};
    const wm = { 0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️', 45: '🌫', 51: '🌦', 61: '🌧', 71: '🌨', 95: '⛈' };
    const weather = wm[c.weather_code] || '🌡';
    return out('PASS',
      `${weather} ${c.temperature_2m}°C feels ${c.apparent_temperature}°C, ${dy.temperature_2m_max?.[0]}°C/${dy.temperature_2m_min?.[0]}°C`,
      {
        temp: c.temperature_2m, feelsLike: c.apparent_temperature, humidity: c.relative_humidity_2m,
        precipitation: c.precipitation, windSpeed: c.wind_speed_10m, weatherCode: c.weather_code,
        weatherIcon: weather, high: dy.temperature_2m_max?.[0], low: dy.temperature_2m_min?.[0], lat, lon,
      });
  } catch (e) { return out('ERROR', e.message.slice(0, 200)); }
}

function out(r, s, d) {
  console.log(JSON.stringify({ softill: 'weather-eye', result: r, summary: s, data: d || {}, evidence: [] }, null, 2));
  process.exit(r === 'PASS' ? 0 : 1);
}

const isCLI = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCLI) main();
