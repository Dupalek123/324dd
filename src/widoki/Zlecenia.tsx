import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useKto, useTabela, useUst } from '../db/hooki';
import { fmtData, fmtIlosc, proc } from '../lib/kwoty';
import { wynikZlecenia } from '../lib/obliczenia';
import { STATUSY_ZLECEN } from '../lib/typy';
import { Kwota, Naglowek, pasuje, PasekListy, Przycisk, Pusto, tonStatusu, Znaczek, type StanListy } from '../ui/komponenty';
import { FormularzZlecenia } from './formularze';

export default function Zlecenia() {
  const ust = useUst();
  const kto = useKto();
  const nav = useNavigate();
  const zlecenia = useTabela('zlecenia');
  const koszty = useTabela('koszty');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'aktywne' });
  const [nowe, setNowe] = useState(false);
  const maKwoty = kto === 'wlasciciel' || ust.uprawnienia.kwoty;
  const lista = useMemo(() => {
    const l = zlecenia
      .filter((z) => (stan.filtr === 'wszystkie' ? true : stan.filtr === 'aktywne' ? z.status !== 'Zakończone' : z.status === stan.filtr))
      .filter((z) => pasuje(stan.szukaj, z.klient, z.adres, z.opis, z.system, z.telefon, z.typPrac))
      .map((z) => ({ z, w: wynikZlecenia(z, koszty) }));
    const d = (x: typeof l[number]) => x.z.dataStart ?? x.z.dataKoniec ?? '';
    return l.sort((a, b) => stan.sort === 'klient' ? a.z.klient.localeCompare(b.z.klient, 'pl') : stan.sort === 'kwota' ? (b.z.netto ?? 0) - (a.z.netto ?? 0) : stan.sort === 'wynik' ? b.w.wynik - a.w.wynik : d(b).localeCompare(d(a)) || b.z.utworzono - a.z.utworzono);
  }, [zlecenia, koszty, stan]);
  return (
    <>
      <Naglowek tytul="Zlecenia" akcje={kto === 'wlasciciel' && <Przycisk wariant="glowny" onClick={() => setNowe(true)}>+ Nowe zlecenie</Przycisk>} />
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Status"
        filtry={[{ w: 'aktywne', e: 'Aktywne' }, { w: 'wszystkie', e: 'Wszystkie' }, ...STATUSY_ZLECEN.map((s) => ({ w: s, e: s }))]}
        sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'klient', e: 'Wg klienta' }, ...(maKwoty ? [{ w: 'kwota', e: 'Wg kwoty' }, { w: 'wynik', e: 'Wg wyniku' }] : [])]} />
      {lista.length === 0 ? (
        <Pusto tytul={zlecenia.length ? 'Nic nie pasuje do filtrów' : 'Nie ma jeszcze zleceń'}
          opis={zlecenia.length ? 'Zmień filtr statusu albo wyczyść wyszukiwanie.' : kto === 'wlasciciel' ? 'Dodaj pierwsze zlecenie albo zamień zaakceptowaną ofertę na zlecenie.' : 'Zobaczysz tu zlecenia, do których przypisze Cię właściciel.'}
          akcja={!zlecenia.length && kto === 'wlasciciel' ? <Przycisk wariant="glowny" onClick={() => setNowe(true)}>+ Nowe zlecenie</Przycisk> : undefined} />
      ) : (
        <ul className="space-y-2">
          {lista.map(({ z, w }) => (
            <li key={z.id}>
              <Link to={`/zlecenia/${z.id}`} className="block rounded-2xl border border-linia bg-karta p-3.5 hover:border-akcent">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><div className="truncate text-[17px] font-semibold">{z.klient || '(bez nazwy)'}</div><div className="truncate text-sm text-przygasz">{z.adres || '—'}</div></div>
                  <Znaczek ton={tonStatusu(z.status)}>{z.status}</Znaczek>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-przygasz">
                  <span>{z.system}{z.m2 ? ` · ${fmtIlosc(z.m2)} m²` : ''}</span>
                  {z.dataStart && <span>{fmtData(z.dataStart)}{z.dataKoniec ? ` – ${fmtData(z.dataKoniec)}` : ''}</span>}
                  {maKwoty && <span className="ml-auto text-tekst"><Kwota v={z.netto} /> netto{(kto === 'wlasciciel' || ust.uprawnienia.koszty) && <> · wynik <Kwota v={w.wynik} kolor /> ({proc(w.marza)})</>}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {nowe && <FormularzZlecenia onClose={() => setNowe(false)} onZapisano={(id) => nav(`/zlecenia/${id}`)} />}
    </>
  );
}
