import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useKto, useTabela, useUst } from '../db/hooki';
import { fmtData, proc, zaokr, zl } from '../lib/kwoty';
import { wynikZlecenia } from '../lib/obliczenia';
import { KATEGORIE, type Koszt } from '../lib/typy';
import { Kwota, Naglowek, pasuje, PasekListy, Przycisk, Pusto, Znaczek, type StanListy } from '../ui/komponenty';
import { FormularzKosztu, KalkulatorDojazdu } from './formularze';

export default function Koszty() {
  const kto = useKto();
  const ust = useUst();
  const koszty = useTabela('koszty');
  const zlecenia = useTabela('zlecenia');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'wszystkie' });
  const [kat, setKat] = useState('wszystkie');
  const [okno, setOkno] = useState<Koszt | 'nowy' | null>(null);
  const maWynik = kto === 'wlasciciel' || (ust.uprawnienia.kwoty && ust.uprawnienia.koszty);
  const grupy = useMemo(() => {
    const f = koszty
      .filter((k) => (stan.filtr === 'wszystkie' ? true : stan.filtr === 'ogolne' ? !k.zlecenieId : k.zlecenieId === stan.filtr))
      .filter((k) => kat === 'wszystkie' || k.kategoria === kat)
      .filter((k) => pasuje(stan.szukaj, k.opis, k.dostawca, k.kategoria, fmtData(k.data)))
      .sort((a, b) => (stan.sort === 'kwota' ? b.netto - a.netto : b.data.localeCompare(a.data)));
    const m = new Map<string, Koszt[]>();
    for (const k of f) { const g = k.zlecenieId ?? ''; m.set(g, [...(m.get(g) ?? []), k]); }
    return [...m.entries()].map(([zid, lista]) => ({ zid, zlecenie: zlecenia.find((z) => z.id === zid), lista, netto: zaokr(lista.reduce((a, k) => a + k.netto, 0)), brutto: zaokr(lista.reduce((a, k) => a + k.brutto, 0)) }))
      .sort((a, b) => (a.zid === '' ? 1 : b.zid === '' ? -1 : (b.lista[0]?.data ?? '').localeCompare(a.lista[0]?.data ?? '')));
  }, [koszty, zlecenia, stan, kat]);
  const suma = grupy.reduce((a, g) => ({ netto: zaokr(a.netto + g.netto), brutto: zaokr(a.brutto + g.brutto) }), { netto: 0, brutto: 0 });
  return (
    <>
      <Naglowek tytul="Koszty" akcje={<Przycisk wariant="glowny" onClick={() => setOkno('nowy')}>+ Nowy koszt</Przycisk>} />
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Zlecenie"
        filtry={[{ w: 'wszystkie', e: 'Wszystkie zlecenia' }, { w: 'ogolne', e: 'Koszty ogólne firmy' }, ...zlecenia.map((z) => ({ w: z.id, e: z.klient }))]}
        sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'kwota', e: 'Wg kwoty' }]}
        dodatkowe={<select aria-label="Kategoria" value={kat} onChange={(e) => setKat(e.target.value)} className="min-h-11 rounded-xl border border-linia bg-karta px-3"><option value="wszystkie">Wszystkie kategorie</option>{KATEGORIE.map((k) => <option key={k}>{k}</option>)}</select>} />
      {grupy.length === 0 ? <Pusto tytul={koszty.length ? 'Nic nie pasuje do filtrów' : 'Nie ma jeszcze kosztów'} opis={koszty.length ? 'Zmień filtr zlecenia lub kategorii.' : 'Dodaj pierwszy koszt – najlepiej od razu ze zdjęciem paragonu.'} /> : <>
        <p className="mb-3 text-sm text-przygasz">Razem: <strong className="text-tekst">{zl(suma.netto)}</strong> netto · {zl(suma.brutto)} brutto</p>
        <div className="space-y-4">
          {grupy.map((g) => {
            const w = g.zlecenie ? wynikZlecenia(g.zlecenie, koszty) : null;
            return (
              <section key={g.zid} className="rounded-2xl border border-linia bg-karta">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-linia px-3.5 py-3">
                  <h2 className="font-semibold">{g.zlecenie ? <Link to={`/zlecenia/${g.zid}`} className="hover:text-akcent">{g.zlecenie.klient} ›</Link> : g.zid ? 'Zlecenie niedostępne' : 'Koszty ogólne firmy'}</h2>
                  <div className="text-right text-sm"><span className="liczby font-semibold">{zl(g.netto)}</span> netto · <span className="liczby text-przygasz">{zl(g.brutto)} brutto</span>
                    {w && maWynik && <div className="text-przygasz">przychód {zl(w.przychod)} · wynik <Kwota v={w.wynik} kolor /> · marża {proc(w.marza)}</div>}</div>
                </header>
                <ul className="divide-y divide-linia">
                  {g.lista.map((k) => (
                    <li key={k.id}><button type="button" onClick={() => setOkno(k)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-wglebienie">
                      <div className="min-w-0 flex-1"><div className="truncate">{k.opis || k.kategoria}</div><div className="text-sm text-przygasz">{fmtData(k.data)} · {k.kategoria}{k.dostawca ? ` · ${k.dostawca}` : ''}{k.plikId ? ' · 📎' : ''}</div></div>
                      {!k.zlecenieId && (k.rozdzial?.length ? <Znaczek ton="akcent">rozksięgowany</Znaczek> : <Znaczek>do rozdzielenia</Znaczek>)}
                      <div className="text-right"><Kwota v={k.netto} /><div className="text-xs text-przygasz">{zl(k.brutto)} brutto</div></div>
                    </button></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      </>}
      {okno && (okno !== 'nowy' && okno.dojazd ? <KalkulatorDojazdu koszt={okno} onClose={() => setOkno(null)} /> : <FormularzKosztu koszt={okno === 'nowy' ? undefined : okno} zlecenieId={stan.filtr !== 'wszystkie' && stan.filtr !== 'ogolne' ? stan.filtr : null} onClose={() => setOkno(null)} />)}
    </>
  );
}
