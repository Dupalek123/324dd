import { useEffect, useRef } from 'react';
import { Przycisk } from './komponenty';

/** Podpis palcem lub rysikiem na ekranie. Zwraca obraz PNG (data URL) albo null po wyczyszczeniu. */
export function Podpis({ etykieta, value, onChange }: { etykieta: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rysuje = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = value; }
  }, [value]);
  const punkt = (e: React.PointerEvent) => { const c = ref.current!, r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height]; };
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><span className="text-sm font-medium text-przygasz">{etykieta}</span>{value && <Przycisk maly wariant="cichy" onClick={() => onChange(null)}>Wyczyść</Przycisk>}</div>
      <canvas ref={ref} width={600} height={200} aria-label={etykieta} className="h-32 w-full touch-none rounded-xl border border-dashed border-linia bg-white"
        onPointerDown={(e) => { rysuje.current = true; e.currentTarget.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext('2d')!; const [x, y] = punkt(e); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b1815'; ctx.beginPath(); ctx.moveTo(x, y); }}
        onPointerMove={(e) => { if (!rysuje.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = punkt(e); ctx.lineTo(x, y); ctx.stroke(); }}
        onPointerUp={() => { if (!rysuje.current) return; rysuje.current = false; onChange(ref.current!.toDataURL('image/png')); }} />
    </div>
  );
}
