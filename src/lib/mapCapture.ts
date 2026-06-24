// Patch WebGL context creation to enable preserveDrawingBuffer
// Must be called before MapLibre initializes
let patched = false;
export function enableMapCapture() {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, type: string, attrs?: any) {
    if ((type === 'webgl' || type === 'webgl2') && this.classList.contains('maplibregl-canvas')) {
      attrs = { ...attrs, preserveDrawingBuffer: true };
    }
    return origGetContext.call(this, type, attrs);
  } as typeof origGetContext;
}

export function captureMap(): string {
  const canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
  if (!canvas) return '';
  try {
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.length > 1000 ? dataUrl : '';
  } catch {
    return '';
  }
}
