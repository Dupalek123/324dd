import { useEffect, useMemo, useState } from 'react';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { dodajDni, dzis, fmtData, fmtIlosc, fmtMiesiac, isoData, poczatekTygodnia, zaokr } from '../lib/kwoty';
import type { OsobaId, WpisGodzin } from '../lib/typy';
import { Kafel, Karta, kl, Naglowek, pasuje, PasekListy, Przycisk, Pusto, Segmenty, Wybor, type StanListy } from '../ui/komponenty';
import { FormularzGodzin, useOpcjeZlecen } from './formularze';

const DNI = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];
const KLUCZ_STOPERA = 'bf-stoper';

function Stoper({ onStop }: { onStop: (godziny: number, zlecenieId: string | null) => void }) {
  const opcje = useOpcjeZlecen();
  const [stan, setStan] = useState<{ start: number; zlecenieId: string | null } | null>(() => { try { return JSON.parse(localStorage.getItem(KLUCZ_STOPERA) ?? 'null'); } catch { return null; } });
  const [zl, setZl] = useState('__brak__');
  const [, tik] = useState(0);
  useEffect(() => { if (!stan) return; const i = setInterval(() => tik((x) => x + 1), 1000); return () => clearInterval(i); }, [stan]);
  const zapisz = (s: typeof stan) => { if (s) localStorage.setItem(KLUCZ_STOPERA, JSON.stringify(s)); else localStorage.removeItem(KLUCZ_STOPERA); setStan(s); };
  const sek = stan ? Math.floor((Date.now() - stan.start) / 1000) : 0;
  const czas = `${String(Math.floor(sek / 3600)).padStart(2, '0')}:${String(Math.floor((sek % 3600) / 60)).padStart(2, '0')}:${String(sek % 60).padStart(2, '0')}`;
  return (
    <Karta tytul="Stoper" className="mb-4">
      {stan ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><div className="liczby text-3xl font-semibold" aria-live="off">{czas}</div><div className="text-sm text-przygasz">{opcje.find((o) => o.w === (stan.zlecenieId ?? '__brak__'))?.e}</div></div>
          <div className="flex gap-2"><Przycisk onClick={() => zapisz(null)}>Anuluj</Przycisk>
            <Przycisk wariant="glowny" onClick={() => { const h = Math.max(0.25, Math.round(sek / 900) / 4); const z = stan.zlecenieId; zapisz(null); onStop(h, z); }}>Stop i zapisz</Przycisk></div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Wybor klasa="min-w-[12rem] flex-1" etykieta="Zlecenie" value={zl} opcje={opcje} onChange={setZl} />
          <Przycisk wariant="glowny" onClick={() => zapisz({ start: Date.now(), zlecenieId: zl === '__brak__' ? null : zl })}>▶ Start</Przycisk>
        </div>
      )}
      <p className="mt-2 text-xs text-przygasz">Czas zaokrągla się do 0,25 h. Stoper działa także po zamknięciu aplikacji.</p>
    </Karta>
  );
}

export default function Godziny() {
  const ust = useUst();
  const kto = useKto();
  const godziny = useTabela('godziny');
  const zlecenia = useTabela('zlecenia');
  const [widok, setWidok] = useState<'tydzien' | 'miesiac' | 'lista'>('tydzien');
  const [kotwica, setKotwica] = useState(dzis());
  const [osoba, setOsoba] = useState<'wszyscy' | OsobaId>('wszyscy');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'wszystkie' });
  const [okno, setOkno] = useState<{ wpis?: WpisGodzin; poczatkowe?: Partial<WpisGodzin> } | null>(null);
  const widziObie = kto === 'wlasciciel' || ust.uprawnienia.wszystkieGodziny;
  const nazwa = (id: string | null) => zlecenia.find((z) => z.id === id)?.klient ?? (id ? 'Zlecenie' : 'Bez zlecenia');

  const [od, doo, tytul] = useMemo((): [string, string, string] => {
    if (widok === 'tydzien') { const p = poczatekTygodnia(kotwica); return [p, dodajDni(p, 6), `${fmtData(p).slice(0, 5)} – ${fmtData(dodajDni(p, 6))}`]; }
    if (widok === 'miesiac') { const [r, m] = kotwica.split('-').map(Number); return [`${kotwica.slice(0, 7)}-01`, isoData(new Date(r, m, 0)), fmtMiesiac(kotwica.slice(0, 7))]; }
    return ['0000-00-00', '9999-99-99', 'Wszystkie wpisy'];
  }, [widok, kotwica]);
  const przesun = (kier: number) => { if (widok === 'tydzien') setKotwica(dodajDni(kotwica, 7 * kier)); else { const [r, m] = kotwica.split('-').map(Number); setKotwica(isoData(new Date(r, m - 1 + kier, 1))); } };

  const wOkresie = useMemo(() => godziny
    .filter((g) => g.data >= od && g.data <= doo)
    .filter((g) => osoba === 'wszyscy' || g.osoba === osoba)
    .filter((g) => stan.filtr === 'wszystkie' || (stan.filtr === 'brak' ? !g.zlecenieId : g.zlecenieId === stan.filtr))
    .filter((g) => pasuje(stan.szukaj, g.opis, nazwa(g.zlecenieId), imie(ust, g.osoba), fmtData(g.data)))
    .sort((a, b) => (stan.sort === 'godziny' ? b.godziny - a.godziny : b.data.localeCompare(a.data) || b.utworzono - a.utworzono)), [godziny, od, doo, osoba, stan, zlecenia, ust]); // eslint-disable-line
  const suma = (o: OsobaId) => zaokr(wOkresie.filter((g) => g.osoba === o).reduce((a, g) => a + g.godziny, 0));
  const poZleceniach = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of wOkresie) m.set(g.zlecenieId ?? '', (m.get(g.zlecenieId ?? '') ?? 0) + g.godziny);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [wOkresie]);
  const dni = widok === 'tydzien' ? Array.from({ length: 7 }, (_, i) => dodajDni(od, i)) : [];

  return (
    <>
      <Naglowek tytul="Godziny" akcje={<Przycisk wariant="glowny" onClick={() => setOkno({})}>+ Dodaj godziny</Przycisk>} />
      <Stoper onStop={(h, zlecenieId) => setOkno({ poczatkowe: { godziny: h, zlecenieId } })} />
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmenty etykieta="Widok" value={widok} onChange={setWidok} opcje={[{ w: 'tydzien', e: 'Tydzień' }, { w: 'miesiac', e: 'Miesiąc' }, { w: 'lista', e: 'Wszystkie' }]} />
        {widziObie && <Segmenty etykieta="Osoba" value={osoba} onChange={setOsoba} opcje={[{ w: 'wszyscy', e: 'Obie osoby' }, { w: 'wlasciciel', e: imie(ust, 'wlasciciel') }, { w: 'wspolnik', e: imie(ust, 'wspolnik') }]} />}
      </div>
      {widok !== 'lista' && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <Przycisk maly onClick={() => przesun(-1)} aria-label="Poprzedni okres">‹</Przycisk>
          <button type="button" className="min-h-9 flex-1 text-center font-semibold" onClick={() => setKotwica(dzis())} title="Wróć do dziś">{tytul}</button>
          <Przycisk maly onClick={() => przesun(1)} aria-label="Następny okres">›</Przycisk>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {(widziObie ? (['wlasciciel', 'wspolnik'] as OsobaId[]) : [kto]).filter((o) => osoba === 'wszyscy' || osoba === o).map((o) => <Kafel key={o} etykieta={imie(ust, o)} wartosc={`${fmtIlosc(suma(o))} h`} />)}
        {widziObie && osoba === 'wszyscy' && <Kafel etykieta="Razem" wartosc={`${fmtIlosc(zaokr(suma('wlasciciel') + suma('wspolnik')))} h`} />}
      </div>

      {widok === 'tydzien' && (
        <div className="mb-4 grid grid-cols-7 gap-1.5">
          {dni.map((d, i) => {
            const h = zaokr(wOkresie.filter((g) => g.data === d).reduce((a, g) => a + g.godziny, 0));
            return (
              <button key={d} type="button" onClick={() => setOkno({ poczatkowe: { data: d } })} aria-label={`${fmtData(d)}: ${fmtIlosc(h)} h. Dodaj godziny`}
                className={kl('flex min-h-20 flex-col items-center justify-center rounded-xl border bg-karta', d === dzis() ? 'border-akcent' : 'border-linia')}>
                <span className="text-xs text-przygasz">{DNI[i]}</span><span className="text-xs text-przygasz">{fmtData(d).slice(0, 5)}</span>
                <span className={kl('liczby mt-1 text-lg font-semibold', !h && 'text-przygasz/50')}>{h ? fmtIlosc(h) : '+'}</span>
              </button>
            );
          })}
        </div>
      )}
      {poZleceniach.length > 0 && <Karta tytul="Suma wg zleceń" className="mb-4">{poZleceniach.map(([id, h]) => <div key={id} className="flex justify-between py-1 text-sm"><span>{nazwa(id || null)}</span><span className="liczby font-medium">{fmtIlosc(zaokr(h))} h</span></div>)}</Karta>}

      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Zlecenie" filtry={[{ w: 'wszystkie', e: 'Wszystkie zlecenia' }, { w: 'brak', e: 'Bez zlecenia' }, ...zlecenia.map((z) => ({ w: z.id, e: z.klient }))]} sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'godziny', e: 'Wg godzin' }]} />
      {wOkresie.length === 0 ? <Pusto tytul="Brak wpisów w tym okresie" opis="Dotknij dnia w tygodniu albo użyj stopera, żeby dodać godziny." /> : (
        <ul className="space-y-2">
          {wOkresie.map((g) => (
            <li key={g.id}><button type="button" onClick={() => setOkno({ wpis: g })} className="flex w-full items-center gap-3 rounded-2xl border border-linia bg-karta p-3 text-left hover:border-akcent">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{nazwa(g.zlecenieId)}</div><div className="truncate text-sm text-przygasz">{fmtData(g.data)} · {imie(ust, g.osoba)}{g.opis ? ` · ${g.opis}` : ''}</div></div>
              <div className="liczby text-lg font-semibold">{fmtIlosc(g.godziny)} h</div>
            </button></li>
          ))}
        </ul>
      )}
      {okno && <FormularzGodzin wpis={okno.wpis} poczatkowe={okno.poczatkowe} onClose={() => setOkno(null)} />}
    </>
  );
}
