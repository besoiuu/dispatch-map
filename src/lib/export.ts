import type { Route } from '@/types/route';

export function routeToCSV(route: Route): string {
  const lines = ['Postal Code'];
  for (const plz of route.plzCodes) {
    lines.push(plz);
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
