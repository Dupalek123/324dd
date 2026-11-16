// Wykres słupkowy (dwie serie obok siebie, wspólna oś). Kolory serii zwalidowane pod kątem daltonizmu w obu motywach.
import { useState } from 'react';
import { fmtLiczba, zl } from '../lib/kwoty';

export interface PunktWykresu { etykieta: string; pelna: string; a: number; b: number }

export function WykresSlupkowy({ dane, nazwaA, nazwaB }: { dane: PunktWykresu[]; nazwaA: string; nazwaB: string }) {
  const [akt, setAkt] = useState<number | null>(null);
  const W = 640, H = 220, L = 46, P = 8, G = 14, D = 26;
  const maks = Math.max(1, ...dane.flatMap((d) => [d.a, d.b]));
  const min = Math.min(0, ...dane.flatMap((d) => [d.a, d.b]));
  const zakres = maks - min || 1;
  const y = (v: number) => G + ((maks - v) / zakres) * (H - G - D);
  const krok = (W - L - P) / Math.max(1, dane.length);
  const szer = Math.min(18, Math.max(4, krok / 2 - 3));
  const skala = [maks, (maks + min) / 2, min].filter((v, i, t) => t.indexOf(v) === i);
  const kr = (v: number) => (Math.abs(v) >= 1000 ? fmtLiczba(v / 1000, Math.abs(v) >= 10000 ? 0 : 1) + ' tys.' : fmtLiczba(v, 0));
  const slupek = (x: number, v: number, kolor: string) => {
    const y0 = y(0), y1 = y(v);
    const g = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    const r = Math.min(4, szer / 2, h);
    // zaokrąglony tylko koniec z daną; podstawa płasko na osi
    const d = v >= 0
      ? `M${x},${g + h}V${g + r}Q${x},${g} ${x + r},${g}H${x + szer - r}Q${x + szer},${g} ${x + szer},${g + r}V${g + h}Z`
      : `M${x},${g}V${g + h - r}Q${x},${g + h} ${x + r},${g + h}H${x + szer - r}Q${x + szer},${g + h} ${x + szer},${g + h - r}V${g}Z`;
    return <path d={d} fill={kolor} />;
  };
  const a = akt !== null ? dane[akt] : null;
  return (
    <figure className="relative m-0">
      <figcaption className="mb-2 flex flex-wrap gap-4 text-xs text-przygasz">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--seria1)' }} />{nazwaA}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--seria2)' }} />{nazwaB}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${nazwaA} i ${nazwaB} w kolejnych miesiącach`} onMouseLeave={() => setAkt(null)}>
        {skala.map((v) => <g key={v}><line x1={L} x2={W - P} y1={y(v)} y2={y(v)} stroke="var(--linia)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--przygasz)">{kr(v)}</text></g>)}
        {min < 0 && <line x1={L} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--przygasz)" strokeWidth="1" />}
        {dane.map((d, i) => {
          const x0 = L + i * krok + krok / 2;
          return (
            <g key={d.pelna} tabIndex={0} onMouseEnter={() => setAkt(i)} onFocus={() => setAkt(i)} onBlur={() => setAkt(null)} onClick={() => setAkt(i)} aria-label={`${d.pelna}: ${nazwaA} ${zl(d.a)}, ${nazwaB} ${zl(d.b)}`} style={{ outline: 'none' }}>
              <rect x={L + i * krok} y={0} width={krok} height={H} fill={akt === i ? 'var(--wglebienie)' : 'transparent'} />
              {slupek(x0 - szer - 1, d.a, 'var(--seria1)')}
              {slupek(x0 + 1, d.b, 'var(--seria2)')}
              <text x={x0} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--przygasz)">{d.etykieta}</text>
            </g>
          );
        })}
      </svg>
      {a && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-lg border border-linia bg-karta px-3 py-2 text-xs shadow">
          <div className="mb-1 font-semibold">{a.pelna}</div>
          <div className="liczby flex justify-between gap-4"><span className="text-przygasz">{nazwaA}</span><span>{zl(a.a)}</span></div>
          <div className="liczby flex justify-between gap-4"><span className="text-przygasz">{nazwaB}</span><span>{zl(a.b)}</span></div>
        </div>
      )}
    </figure>
  );
}
