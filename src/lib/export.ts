import type { Route, RouteStop } from '@/types/route';
import { formatDistance, formatDuration } from './routing';
import { captureMap } from './mapCapture';
import { useThemeStore } from '@/store/themeStore';

export function routeToCSV(route: Route, stops: RouteStop[]): string {
  const lines = ['Stop,Postal Code,Name,Country,Latitude,Longitude,Distance,Duration'];
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const plzParts = s.plz?.includes(':') ? s.plz.split(':') : ['', s.plz ?? ''];
    const country = plzParts[0].toUpperCase();
    const code = plzParts.length > 1 ? plzParts[1] : plzParts[0];
    const name = (s.label || '').replace(/,/g, ' ');
    const lat = s.coordinate?.[1]?.toFixed(5) ?? '';
    const lng = s.coordinate?.[0]?.toFixed(5) ?? '';
    const leg = route.geometry?.legs?.[i];
    const dist = leg && i < stops.length - 1 ? formatDistance(leg.distance) : '';
    const dur = leg && i < stops.length - 1 ? formatDuration(leg.duration) : '';
    lines.push(`${letters[i] ?? i + 1},${code},${name},${country},${lat},${lng},${dist},${dur}`);
  }
  if (route.geometry) {
    lines.push(`,,TOTAL,,,${formatDistance(route.geometry.distance)},${formatDuration(route.geometry.duration)}`);
  }
  return lines.join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyRouteAsText(route: Route): Promise<void> {
  const text = `${route.name}: ${route.plzCodes.join(', ')}`;
  await navigator.clipboard.writeText(text);
}

export function printRoute(route: Route, stops: RouteStop[]): void {
  // Force light mode for map capture
  const wasDark = useThemeStore.getState().dark;
  if (wasDark) {
    useThemeStore.getState().toggle();
    document.documentElement.classList.remove('dark');
  }

  // Zoom map to fit route stops
  if (stops.length >= 2) {
    const lngs = stops.map(s => s.coordinate[0]);
    const lats = stops.map(s => s.coordinate[1]);
    const pad = 0.5;
    const bbox = [Math.min(...lngs) - pad, Math.min(...lats) - pad, Math.max(...lngs) + pad, Math.max(...lats) + pad];
    window.dispatchEvent(new CustomEvent('map:flyto', { detail: { bbox } }));
  }

  // Wait for light map tiles to load, then capture and restore
  setTimeout(() => {
    _printRouteInner(route, stops);
    if (wasDark) {
      useThemeStore.getState().toggle();
      document.documentElement.classList.add('dark');
    }
  }, 2500);
}

function _printRouteInner(route: Route, stops: RouteStop[]): void {
  const mapImage = captureMap();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const stopsHtml = stops.map((s, i) => {
    const leg = route.geometry?.legs?.[i];
    const plzParts = s.plz?.includes(':') ? s.plz.split(':') : ['', s.plz ?? ''];
    const cc = plzParts[0].toUpperCase();
    const code = plzParts.length > 1 ? plzParts[1] : plzParts[0];
    const label = s.label || code || 'Waypoint';
    const dist = leg && i < stops.length - 1 ? formatDistance(leg.distance) : '';
    const dur = leg && i < stops.length - 1 ? formatDuration(leg.duration) : '';
    const isFirst = i === 0;
    const isLast = i === stops.length - 1;
    const dotColor = isFirst ? '#22c55e' : isLast ? '#ef4444' : route.color;
    return `<tr>
      <td class="stop-letter" style="color:${dotColor}">${letters[i] ?? i + 1}</td>
      <td class="stop-code">${cc ? `<span class="cc">${cc}</span>` : ''}${code}</td>
      <td class="stop-name">${label}</td>
      <td class="stop-dist">${dist}</td>
      <td class="stop-dur">${dur}</td>
    </tr>`;
  }).join('');

  const totalDist = route.geometry ? formatDistance(route.geometry.distance) : '';
  const totalDur = route.geometry ? formatDuration(route.geometry.duration) : '';

  const html = `<!DOCTYPE html>
<html><head><title>${route.name} - Dispatch Map</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a2e; background: #f8f9fb; }
  .page { max-width: 800px; margin: 0 auto; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: center; padding: 20px 28px; border-bottom: 2px solid ${route.color}20; }
  .header-left h1 { font-size: 20px; font-weight: 700; color: #0f172a; }
  .header-left .meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }
  .header-right { text-align: right; font-size: 11px; color: #94a3b8; }
  .header-right .brand { font-weight: 600; color: #3b82f6; }
  .map-container { padding: 20px 28px; }
  .map-container img { width: 100%; border-radius: 12px; border: 1px solid #e2e8f0; filter: saturate(0) brightness(1.2) contrast(0.85); }
  .summary { display: flex; gap: 24px; padding: 16px 28px; background: ${route.color}08; border-top: 1px solid ${route.color}15; border-bottom: 1px solid ${route.color}15; }
  .summary-item { display: flex; flex-direction: column; }
  .summary-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; }
  .summary-value { font-size: 18px; font-weight: 700; color: ${route.color}; font-variant-numeric: tabular-nums; }
  .summary-value.muted { color: #64748b; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 0; }
  th { padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; font-weight: 600; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  tr:hover { background: #f8fafc; }
  .stop-letter { font-weight: 700; font-size: 14px; width: 32px; text-align: center; }
  .stop-code { font-family: 'Fira Code', 'SF Mono', monospace; font-size: 12px; color: #475569; white-space: nowrap; }
  .stop-name { font-weight: 500; }
  .stop-dist, .stop-dur { font-variant-numeric: tabular-nums; color: #64748b; font-size: 12px; text-align: right; white-space: nowrap; }
  .cc { display: inline-block; background: #f1f5f9; color: #64748b; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-right: 4px; }
  .footer { padding: 16px 28px; text-align: center; font-size: 10px; color: #cbd5e1; border-top: 1px solid #f1f5f9; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 32px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
  .print-btn:hover { background: #2563eb; }
  @media print {
    body { background: #fff; margin: 0; }
    .page { box-shadow: none; }
    .print-btn { display: none; }
    tr:hover { background: transparent; }
  }
  @page {
    margin: 8mm;
    size: A4;
  }
</style></head><body>
<div class="page">
  <div class="header">
    <div class="header-left">
      <h1>${route.name}</h1>
      <div class="meta">${stops.length} stops · ${date} at ${time}</div>
    </div>
    <div class="header-right">
      <div class="brand">Dispatch Map</div>
      <div>dispatch-map-eta.vercel.app</div>
    </div>
  </div>
  ${mapImage ? `<div class="map-container"><img src="${mapImage}" alt="Route map" /></div>` : ''}
  ${route.geometry ? `<div class="summary">
    <div class="summary-item"><span class="summary-label">Total Distance</span><span class="summary-value">${totalDist}</span></div>
    <div class="summary-item"><span class="summary-label">Est. Duration</span><span class="summary-value">${totalDur}</span></div>
    <div class="summary-item"><span class="summary-label">Stops</span><span class="summary-value muted">${stops.length}</span></div>
  </div>` : ''}
  <table>
    <thead><tr><th></th><th>Code</th><th>Location</th><th style="text-align:right">Distance</th><th style="text-align:right">Duration</th></tr></thead>
    <tbody>${stopsHtml}</tbody>
  </table>
  <div class="footer">Generated by Dispatch Map · dispatch-map-eta.vercel.app</div>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
