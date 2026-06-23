import type { Route, RouteStop } from '@/types/route';
import { formatDistance, formatDuration } from './routing';

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
  const canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
  const mapImage = canvas?.toDataURL('image/png') ?? '';

  const stopLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const stopsHtml = stops.map((s, i) => {
    const leg = route.geometry?.legs?.[i];
    const legInfo = leg && i < stops.length - 1
      ? `<span style="color:#888;font-size:12px;margin-left:8px">${formatDistance(leg.distance)} · ${formatDuration(leg.duration)}</span>`
      : '';
    return `<tr>
      <td style="padding:6px 12px;font-weight:bold;color:${route.color}">${stopLetters[i] ?? i + 1}</td>
      <td style="padding:6px 12px">${s.label || s.plz || 'Waypoint'}${legInfo}</td>
    </tr>`;
  }).join('');

  const totalInfo = route.geometry
    ? `<p style="margin:12px 0;font-size:16px;font-weight:bold;color:${route.color}">${formatDistance(route.geometry.distance)} · ${formatDuration(route.geometry.duration)}</p>`
    : '';

  const html = `<!DOCTYPE html>
<html><head><title>${route.name} - Dispatch Map</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; color: #222; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #888; font-size: 13px; margin-bottom: 16px; }
  img { max-width: 100%; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; }
  table { border-collapse: collapse; width: 100%; }
  tr:nth-child(even) { background: #f8f8f8; }
  td { border-bottom: 1px solid #eee; }
  @media print { body { margin: 10px; } }
</style></head><body>
<h1>${route.name}</h1>
<p class="meta">${stops.length} stops · Generated ${new Date().toLocaleDateString()}</p>
${mapImage ? `<img src="${mapImage}" alt="Route map" />` : ''}
${totalInfo}
<table>${stopsHtml}</table>
<p style="margin-top:16px;font-size:11px;color:#aaa">Dispatch Map · dispatc‍hmap.app</p>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 300);
}
