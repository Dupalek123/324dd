import { useMemo, useState } from 'react';
import { useTabela } from '../db/hooki';
import { dzis, fmtData, fmtIlosc, fmtMiesiac, zaokr, zl } from '../lib/kwoty';
import { sumaDojazdow } from '../lib/obliczenia';
import type { Koszt } from '../lib/typy';
import { Kafel, Karta, Kwota, Naglowek, pasuje, PasekListy, Przycisk, Pusto, Tabela, type StanListy } from '../ui/komponenty';
import { KalkulatorDojazdu } from './formularze';

export default function Dojazdy() {
  const koszty = useTabela('koszty');
  const zlecenia = useTabela('zlecenia');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'wszystkie' });
  const [okno, setOkno] = useState<Koszt | 'nowy' | null>(null);
  const dojazdy = useMemo(() => koszty.filter((k) => k.dojazd), [koszty]);
  const nazwa = (id: string | null) => zlecenia.find((z) => z.id === id)?.klient ?? (id ? '—' : 'Bez zlecenia');
  const lista = dojazdy.filter((k) => stan.filtr === 'wszystkie' || k.zlecenieId === stan.filtr).filter((k) => pasuje(stan.szukaj, k.opis, nazwa(k.zlecenieId), fmtData(k.data)))
    .sort((a, b) => (stan.sort === 'km' ? b.dojazd!.km - a.dojazd!.km : b.data.localeCompare(a.data)));
  const ym = dzis().slice(0, 7), rok = dzis().slice(0, 4);
  const sm = sumaDojazdow(dojazdy.filter((k) => k.data.startsWith(ym)));
  const sr = sumaDojazdow(dojazdy.filter((k) => k.data.startsWith(rok)));
  const sw = sumaDojazdow(lista);
  const mies = useMemo(() => {
    const m = new Map<string, { km: number; litry: number; brutto: number }>();
    for (const k of dojazdy) { const x = m.get(k.data.slice(0, 7)) ?? { km: 0, litry: 0, brutto: 0 }; x.km += k.dojazd!.km; x.litry += k.dojazd!.litry; x.brutto += k.brutto; m.set(k.data.slice(0, 7), x); }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [dojazdy]);
  return (
    <>
      <Naglowek tytul="Dojazdy" akcje={<Przycisk wariant="glowny" onClick={() => setOkno('nowy')}>+ Kalkulator dojazdu</Przycisk>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kafel etykieta={`Km – ${fmtMiesiac(ym)}`} wartosc={`${fmtIlosc(sm.km)} km`} opis={`${fmtIlosc(sm.litry)} l · ${zl(sm.brutto)}`} />
        <Kafel etykieta={`Km – rok ${rok}`} wartosc={`${fmtIlosc(sr.km)} km`} opis={`${fmtIlosc(sr.litry)} l · ${zl(sr.brutto)}`} />
        <Kafel etykieta="Litry w roku" wartosc={`${fmtIlosc(sr.litry)} l`} />
        <Kafel etykieta="Koszt w roku (brutto)" wartosc={zl(sr.brutto)} opis={`netto ${zl(sr.netto)}`} />
      </div>
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Zlecenie" filtry={[{ w: 'wszystkie', e: 'Wszystkie zlecenia' }, ...zlecenia.map((z) => ({ w: z.id, e: z.klient }))]} sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'km', e: 'Wg km' }]} />
      {lista.length === 0 ? <Pusto tytul={dojazdy.length ? 'Nic nie pasuje do filtrów' : 'Nie ma jeszcze dojazdów'} opis="Kalkulator: dni × km × 2 × spalanie × cena paliwa. Wynik zapisuje się jako koszt transportu przy zleceniu." akcja={<Przycisk wariant="glowny" onClick={() => setOkno('nowy')}>+ Kalkulator dojazdu</Przycisk>} /> : (
        <Tabela naglowki={['Data', 'Zlecenie', 'Opis', { e: 'km', prawo: true }, { e: 'Litry', prawo: true }, { e: 'Brutto', prawo: true }]}
          stopka={<tr><td colSpan={3}>Razem ({sw.liczba})</td><td className="liczby text-right">{fmtIlosc(sw.km)}</td><td className="liczby text-right">{fmtIlosc(sw.litry)}</td><td className="text-right"><Kwota v={sw.brutto} /></td></tr>}>
          {lista.map((k) => (
            <tr key={k.id} tabIndex={0} role="button" onClick={() => setOkno(k)} onKeyDown={(e) => { if (e.key === 'Enter') setOkno(k); }} className="cursor-pointer hover:bg-wglebienie">
              <td className="liczby whitespace-nowrap">{fmtData(k.data)}</td><td className="whitespace-nowrap">{nazwa(k.zlecenieId)}</td><td>{k.opis}</td>
              <td className="liczby text-right">{fmtIlosc(k.dojazd!.km)}</td><td className="liczby text-right">{fmtIlosc(k.dojazd!.litry)}</td><td className="text-right"><Kwota v={k.brutto} /></td>
            </tr>
          ))}
        </Tabela>
      )}
      {mies.length > 0 && <Karta className="mt-4" tytul="Miesiące">
        {mies.map(([m, x]) => <div key={m} className="flex justify-between border-b border-linia py-1.5 text-sm last:border-0"><span>{fmtMiesiac(m)}</span><span className="liczby text-przygasz">{fmtIlosc(zaokr(x.km, 1))} km · {fmtIlosc(zaokr(x.litry))} l · {zl(x.brutto)}</span></div>)}
      </Karta>}
      {okno && <KalkulatorDojazdu koszt={okno === 'nowy' ? undefined : okno} zlecenieId={stan.filtr !== 'wszystkie' ? stan.filtr : null} onClose={() => setOkno(null)} />}
    </>
  );
}
