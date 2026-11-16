// Wspólne klocki interfejsu: duże pola dotykowe, spójny wygląd, obsługa klawiatury.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cofnij } from '../db/baza';
import { komunikat, useKomunikaty } from '../db/sesja';
import { bruttoZNetto, doPola, liczba, nettoZBrutto, norm, zl } from '../lib/kwoty';
import { STAWKI_VAT, type Vat } from '../lib/typy';

export const kl = (...k: (string | false | null | undefined)[]) => k.filter(Boolean).join(' ');

// ---------- przyciski ----------
type Wariant = 'glowny' | 'zwykly' | 'cichy' | 'grozny';
const WARIANTY: Record<Wariant, string> = {
  glowny: 'bg-akcent text-na-akcencie hover:bg-akcent-mocny border-transparent',
  zwykly: 'bg-karta text-tekst border-linia hover:bg-wglebienie',
  cichy: 'bg-transparent text-akcent border-transparent hover:bg-akcent-tlo',
  grozny: 'bg-transparent text-zle border-zle/40 hover:bg-zle/10',
};
export function Przycisk({ wariant = 'zwykly', maly, className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { wariant?: Wariant; maly?: boolean }) {
  return (
    <button type="button" {...p}
      className={kl('inline-flex items-center justify-center gap-2 rounded-xl border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none',
        maly ? 'min-h-9 px-3 text-sm' : 'min-h-11 px-4 text-[15px]', WARIANTY[wariant], className)} />
  );
}

// ---------- pola ----------
const POLE = 'w-full min-h-11 rounded-xl border border-linia bg-karta px-3 py-2 text-tekst placeholder:text-przygasz/70 focus:border-akcent focus:outline-none focus:ring-2 focus:ring-akcent/30 disabled:opacity-60';

export function Etykieta({ etykieta, blad, podpowiedz, children, className }: { etykieta: string; blad?: string | null; podpowiedz?: string; children: ReactNode; className?: string }) {
  return (
    <label className={kl('block', className)}>
      <span className="mb-1 block text-sm font-medium text-przygasz">{etykieta}</span>
      {children}
      {blad ? <span role="alert" className="mt-1 block text-sm text-zle">{blad}</span> : podpowiedz ? <span className="mt-1 block text-xs text-przygasz">{podpowiedz}</span> : null}
    </label>
  );
}

interface PoleP extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> { etykieta: string; value: string; onChange: (v: string) => void; blad?: string | null; podpowiedz?: string; klasa?: string }
export function Pole({ etykieta, value, onChange, blad, podpowiedz, klasa, ...p }: PoleP) {
  return <Etykieta etykieta={etykieta} blad={blad} podpowiedz={podpowiedz} className={klasa}><input {...p} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={POLE} aria-invalid={!!blad} /></Etykieta>;
}
export function Obszar({ etykieta, value, onChange, wiersze = 3, podpowiedz, klasa }: { etykieta: string; value: string; onChange: (v: string) => void; wiersze?: number; podpowiedz?: string; klasa?: string }) {
  return <Etykieta etykieta={etykieta} podpowiedz={podpowiedz} className={klasa}><textarea rows={wiersze} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={POLE} /></Etykieta>;
}
export function Wybor<T extends string | number>({ etykieta, value, onChange, opcje, klasa, podpowiedz }: { etykieta: string; value: T; onChange: (v: T) => void; opcje: readonly (T | { w: T; e: string })[]; klasa?: string; podpowiedz?: string }) {
  const o = opcje.map((x) => (typeof x === 'object' ? x : { w: x, e: String(x) }));
  const liczbowe = typeof o[0]?.w === 'number';
  return (
    <Etykieta etykieta={etykieta} className={klasa} podpowiedz={podpowiedz}>
      <select value={String(value ?? '')} onChange={(e) => onChange((liczbowe ? Number(e.target.value) : e.target.value) as T)} className={POLE}>
        {o.map((x) => <option key={String(x.w)} value={String(x.w)}>{x.e}</option>)}
      </select>
    </Etykieta>
  );
}

/** Pole liczbowe z polskim przecinkiem. Puste = null. */
export function PoleLiczba({ etykieta, value, onChange, jedn, blad, podpowiedz, klasa, krok, min, disabled, placeholder }: { etykieta: string; value: number | null | undefined; onChange: (v: number | null) => void; jedn?: string; blad?: string | null; podpowiedz?: string; klasa?: string; krok?: number; min?: number; disabled?: boolean; placeholder?: string }) {
  const [tekst, setTekst] = useState(doPola(value));
  const fokus = useRef(false);
  useEffect(() => { if (!fokus.current && liczba(tekst) !== (value ?? null)) setTekst(doPola(value)); }, [value]); // eslint-disable-line
  const zmien = (t: string) => {
    setTekst(t);
    const n = liczba(t);
    if (t.trim() === '') onChange(null);
    else if (n !== null && (min === undefined || n >= min)) onChange(n);
  };
  const zly = tekst.trim() !== '' && (liczba(tekst) === null || (min !== undefined && (liczba(tekst) ?? 0) < min));
  return (
    <Etykieta etykieta={etykieta} blad={blad ?? (zly ? 'Wpisz poprawną liczbę' : null)} podpowiedz={podpowiedz} className={klasa}>
      <div className="relative">
        <input inputMode="decimal" value={tekst} disabled={disabled} placeholder={placeholder}
          onFocus={(e) => { fokus.current = true; e.target.select(); }}
          onBlur={() => { fokus.current = false; const n = liczba(tekst); if (n !== null && krok) { const z = Math.round(n / krok) * krok; onChange(z); setTekst(doPola(z)); } else if (n !== null) setTekst(doPola(n)); }}
          onChange={(e) => zmien(e.target.value)} className={kl(POLE, 'liczby', jedn && 'pr-12')} aria-invalid={zly} />
        {jedn && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-przygasz">{jedn}</span>}
      </div>
    </Etykieta>
  );
}

/** Trójka netto / VAT / brutto – wpisanie jednej kwoty wylicza drugą. */
export function PolaKwoty({ netto, brutto, vat, onChange }: { netto: number; brutto: number; vat: Vat; onChange: (k: { netto: number; brutto: number; vat: Vat }) => void }) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem_1fr] gap-2">
      <PoleLiczba etykieta="Netto" jedn="zł" value={netto} min={0} onChange={(n) => onChange({ netto: n ?? 0, vat, brutto: bruttoZNetto(n ?? 0, vat) })} />
      <Wybor etykieta="VAT" value={vat} opcje={STAWKI_VAT.map((v) => ({ w: v, e: `${v}%` }))} onChange={(v) => onChange({ netto, vat: v, brutto: bruttoZNetto(netto, v) })} />
      <PoleLiczba etykieta="Brutto" jedn="zł" value={brutto} min={0} onChange={(b) => onChange({ brutto: b ?? 0, vat, netto: nettoZBrutto(b ?? 0, vat) })} />
    </div>
  );
}

export function Przelacznik({ etykieta, value, onChange, opis }: { etykieta: string; value: boolean; onChange: (v: boolean) => void; opis?: string }) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 py-1">
      <span><span className="block text-[15px]">{etykieta}</span>{opis && <span className="block text-xs text-przygasz">{opis}</span>}</span>
      <input type="checkbox" role="switch" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full bg-linia transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-6 after:w-6 after:rounded-full after:bg-karta after:shadow after:transition-transform peer-checked:bg-akcent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-akcent/50" />
    </label>
  );
}

export function Segmenty<T extends string>({ value, onChange, opcje, etykieta }: { value: T; onChange: (v: T) => void; opcje: { w: T; e: string }[]; etykieta?: string }) {
  return (
    <div role="radiogroup" aria-label={etykieta} className="inline-flex max-w-full rounded-xl border border-linia bg-wglebienie p-1 przewijanie-x">
      {opcje.map((o) => (
        <button key={o.w} type="button" role="radio" aria-checked={value === o.w} onClick={() => onChange(o.w)}
          className={kl('min-h-9 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors', value === o.w ? 'bg-karta text-tekst shadow-sm' : 'text-przygasz hover:text-tekst')}>{o.e}</button>
      ))}
    </div>
  );
}

// ---------- układ ----------
export function Karta({ children, className, tytul, akcje }: { children: ReactNode; className?: string; tytul?: string; akcje?: ReactNode }) {
  return (
    <section className={kl('rounded-2xl border border-linia bg-karta p-4', className)}>
      {(tytul || akcje) && <div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-base font-semibold">{tytul}</h2>{akcje}</div>}
      {children}
    </section>
  );
}
export function Kafel({ etykieta, wartosc, opis, ton }: { etykieta: string; wartosc: string; opis?: string; ton?: 'dobrze' | 'zle' }) {
  return (
    <div className="rounded-2xl border border-linia bg-karta p-3.5">
      <div className="text-xs font-medium uppercase tracking-wide text-przygasz">{etykieta}</div>
      <div className={kl('liczby mt-1 text-xl font-semibold leading-tight', ton === 'dobrze' && 'text-dobrze', ton === 'zle' && 'text-zle')}>{wartosc}</div>
      {opis && <div className="mt-0.5 text-xs text-przygasz">{opis}</div>}
    </div>
  );
}
export function Naglowek({ tytul, akcje, wstecz }: { tytul: string; akcje?: ReactNode; wstecz?: () => void }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        {wstecz && <button type="button" onClick={wstecz} aria-label="Wstecz" className="-ml-2 grid h-11 w-11 place-items-center rounded-xl text-2xl text-przygasz hover:bg-wglebienie">‹</button>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{tytul}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">{akcje}</div>
    </header>
  );
}
export function Pusto({ tytul, opis, akcja }: { tytul: string; opis?: string; akcja?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-linia px-4 py-10 text-center">
      <div className="text-base font-medium">{tytul}</div>
      {opis && <p className="mx-auto mt-1 max-w-sm text-sm text-przygasz">{opis}</p>}
      {akcja && <div className="mt-4">{akcja}</div>}
    </div>
  );
}
export function Znaczek({ children, ton = 'szary' }: { children: ReactNode; ton?: 'szary' | 'akcent' | 'dobrze' | 'zle' | 'uwaga' }) {
  const t = { szary: 'bg-wglebienie text-przygasz', akcent: 'bg-akcent-tlo text-akcent-mocny', dobrze: 'bg-dobrze/15 text-dobrze', zle: 'bg-zle/15 text-zle', uwaga: 'bg-uwaga/15 text-uwaga' }[ton];
  return <span className={kl('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>;
}
export const tonStatusu = (s: string): 'szary' | 'akcent' | 'dobrze' | 'zle' | 'uwaga' =>
  ({ 'Oferta': 'szary', 'Zaakceptowane': 'akcent', 'W realizacji': 'uwaga', 'Zakończone': 'dobrze', 'robocza': 'szary', 'wysłana': 'uwaga', 'zaakceptowana': 'dobrze', 'odrzucona': 'zle' } as const)[s] ?? 'szary';

export function Wiersz({ etykieta, children, mocny }: { etykieta: string; children: ReactNode; mocny?: boolean }) {
  return <div className={kl('flex items-baseline justify-between gap-3 py-1.5', mocny && 'border-t border-linia font-semibold')}><span className="text-sm text-przygasz">{etykieta}</span><span className="liczby text-right">{children}</span></div>;
}
export const Kwota = ({ v, kolor }: { v: number | null | undefined; kolor?: boolean }) =>
  <span className={kl('liczby whitespace-nowrap', kolor && v != null && v < 0 && 'text-zle', kolor && v != null && v > 0 && 'text-dobrze')}>{zl(v)}</span>;

/** Tabela przewijana w poziomie na telefonie. */
export function Tabela({ naglowki, children, stopka }: { naglowki: (string | { e: string; prawo?: boolean })[]; children: ReactNode; stopka?: ReactNode }) {
  return (
    <div className="przewijanie-x rounded-2xl border border-linia bg-karta">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead><tr>{naglowki.map((n, i) => { const o = typeof n === 'string' ? { e: n } : n; return <th key={i} scope="col" className={kl('whitespace-nowrap border-b border-linia px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-przygasz', o.prawo ? 'text-right' : 'text-left')}>{o.e}</th>; })}</tr></thead>
        <tbody className="[&>tr:not(:last-child)>td]:border-b [&>tr>td]:border-linia [&>tr>td]:px-3 [&>tr>td]:py-2.5">{children}</tbody>
        {stopka && <tfoot className="[&>tr>td]:border-t [&>tr>td]:border-linia [&>tr>td]:px-3 [&>tr>td]:py-2.5 font-semibold">{stopka}</tfoot>}
      </table>
    </div>
  );
}

// ---------- pasek listy: szukanie, sortowanie, filtr ----------
export interface StanListy { szukaj: string; sort: string; filtr: string }
export function PasekListy({ stan, onChange, sorty, filtry, etykietaFiltra = 'Filtr', dodatkowe }: { stan: StanListy; onChange: (s: StanListy) => void; sorty?: { w: string; e: string }[]; filtry?: { w: string; e: string }[]; etykietaFiltra?: string; dodatkowe?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end gap-2">
      <label className="min-w-[10rem] flex-1">
        <span className="sr-only">Szukaj</span>
        <input type="search" placeholder="Szukaj…" value={stan.szukaj} onChange={(e) => onChange({ ...stan, szukaj: e.target.value })} className={POLE} />
      </label>
      {filtry && <label><span className="sr-only">{etykietaFiltra}</span><select aria-label={etykietaFiltra} value={stan.filtr} onChange={(e) => onChange({ ...stan, filtr: e.target.value })} className={kl(POLE, 'w-auto')}>{filtry.map((f) => <option key={f.w} value={f.w}>{f.e}</option>)}</select></label>}
      {dodatkowe}
      {sorty && <label><span className="sr-only">Sortowanie</span><select aria-label="Sortowanie" value={stan.sort} onChange={(e) => onChange({ ...stan, sort: e.target.value })} className={kl(POLE, 'w-auto')}>{sorty.map((f) => <option key={f.w} value={f.w}>{f.e}</option>)}</select></label>}
    </div>
  );
}
/** Czy rekord pasuje do wyszukiwanej frazy (bez polskich znaków, wszystkie słowa). */
export function pasuje(fraza: string, ...pola: unknown[]): boolean {
  const slowa = norm(fraza).split(/\s+/).filter(Boolean);
  if (!slowa.length) return true;
  const tekst = norm(pola.join(' '));
  return slowa.every((s) => tekst.includes(s));
}

// ---------- okno modalne ----------
export function Okno({ tytul, onClose, children, stopka, szerokie }: { tytul: string; onClose: () => void; children: ReactNode; stopka?: ReactNode; szerokie?: boolean }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const poprzedni = document.activeElement as HTMLElement | null;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; poprzedni?.focus?.(); };
  }, []); // eslint-disable-line
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={kl('flex max-h-[94dvh] w-full flex-col rounded-t-3xl bg-tlo shadow-2xl outline-none sm:rounded-3xl', szerokie ? 'sm:max-w-3xl' : 'sm:max-w-xl')}>
        <div className="flex items-center justify-between gap-2 border-b border-linia px-4 py-3">
          <h2 id={id} className="text-lg font-semibold">{tytul}</h2>
          <button type="button" onClick={onClose} aria-label="Zamknij" className="grid h-10 w-10 place-items-center rounded-xl text-xl text-przygasz hover:bg-wglebienie">✕</button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{children}</div>
        {stopka && <div className="flex flex-wrap justify-end gap-2 border-t border-linia px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{stopka}</div>}
      </div>
    </div>
  );
}

// ---------- potwierdzenia ----------
interface Pytanie { tytul: string; tresc?: ReactNode; tak?: string; grozne?: boolean; opcje?: { w: string; e: string; grozne?: boolean }[]; ok: (w: string | null) => void }
const KontekstPytan = createContext<(p: Omit<Pytanie, 'ok'>) => Promise<string | null>>(async () => null);
export function DostawcaPytan({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Pytanie | null>(null);
  const zapytaj = useCallback((q: Omit<Pytanie, 'ok'>) => new Promise<string | null>((ok) => setP({ ...q, ok })), []);
  const odp = (w: string | null) => { p?.ok(w); setP(null); };
  return (
    <KontekstPytan.Provider value={zapytaj}>
      {children}
      {p && (
        <Okno tytul={p.tytul} onClose={() => odp(null)} stopka={<>
          <Przycisk onClick={() => odp(null)}>Anuluj</Przycisk>
          {(p.opcje ?? [{ w: 'tak', e: p.tak ?? 'Usuń', grozne: p.grozne ?? true }]).map((o) => <Przycisk key={o.w} wariant={o.grozne ? 'grozny' : 'glowny'} onClick={() => odp(o.w)}>{o.e}</Przycisk>)}
        </>}>
          <div className="text-[15px] text-przygasz">{p.tresc ?? 'Tę operację można cofnąć przyciskiem „Cofnij” zaraz po wykonaniu.'}</div>
        </Okno>
      )}
    </KontekstPytan.Provider>
  );
}
/** `const pytaj = usePytanie(); if (await pytaj({ tytul: 'Usunąć?' })) …` */
export const usePytanie = () => useContext(KontekstPytan);

/** Usuwanie z potwierdzeniem i komunikatem z przyciskiem „Cofnij”. */
export function useUsuwanie() {
  const pytaj = usePytanie();
  return async (co: string, wykonaj: () => Promise<void>) => {
    if (!(await pytaj({ tytul: `Usunąć ${co}?` }))) return false;
    await wykonaj();
    komunikat(`Usunięto ${co}.`, 'ok', true);
    return true;
  };
}

export function Komunikaty() {
  const lista = useKomunikaty();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3 lg:bottom-6">
      {lista.map((k) => (
        <div key={k.id} className={kl('pointer-events-auto flex max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lg', k.rodzaj === 'blad' ? 'bg-zle text-white' : 'bg-tekst text-tlo')}>
          <span>{k.tekst}</span>
          {k.cofnij && <button type="button" className="font-semibold underline underline-offset-2" onClick={async () => { const e = await cofnij(); if (e) komunikat('Cofnięto: ' + e.toLowerCase()); }}>Cofnij</button>}
        </div>
      ))}
    </div>
  );
}

/** Prosty stan formularza. */
export function useForm<T extends object>(poczatek: T): [T, <K extends keyof T>(pole: K, w: T[K]) => void, (czesc: Partial<T>) => void] {
  const [w, setW] = useState<T>(poczatek);
  const ustaw = useCallback(<K extends keyof T>(pole: K, wartosc: T[K]) => setW((s) => ({ ...s, [pole]: wartosc })), []);
  const wiele = useCallback((czesc: Partial<T>) => setW((s) => ({ ...s, ...czesc })), []);
  return [w, ustaw, wiele];
}
