import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usun, wymazKlienta } from '../db/baza';
import { useKto, useTabela } from '../db/hooki';
import { eksportKlienta } from '../db/kopie';
import { komunikat } from '../db/sesja';
import { fmtData, zl } from '../lib/kwoty';
import { sumaOferty } from '../lib/obliczenia';
import type { Klient } from '../lib/typy';
import { Naglowek, Okno, pasuje, PasekListy, Przycisk, Pusto, tonStatusu, usePytanie, Wiersz, Znaczek, type StanListy } from '../ui/komponenty';
import { FormularzKlienta } from './formularze';

export default function Klienci() {
  const kto = useKto();
  const klienci = useTabela('klienci');
  const zlecenia = useTabela('zlecenia');
  const oferty = useTabela('oferty');
  const pytaj = usePytanie();
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'nazwa', filtr: 'wszystkie' });
  const [edycja, setEdycja] = useState<Klient | 'nowy' | null>(null);
  const [karta, setKarta] = useState<string | null>(null);
  const zrodla = [...new Set(klienci.map((k) => k.zrodlo).filter(Boolean))].sort();
  const lista = klienci.filter((k) => stan.filtr === 'wszystkie' || k.zrodlo === stan.filtr).filter((k) => pasuje(stan.szukaj, k.nazwa, k.telefon, k.email, k.adres, k.notatki))
    .sort((a, b) => (stan.sort === 'nowi' ? b.utworzono - a.utworzono : a.nazwa.localeCompare(b.nazwa, 'pl')));
  const k = klienci.find((x) => x.id === karta);
  const jegoZlecenia = zlecenia.filter((z) => z.klientId === karta);
  const jegoOferty = oferty.filter((o) => o.klientId === karta);
  return (
    <>
      <Naglowek tytul="Klienci" akcje={<Przycisk wariant="glowny" onClick={() => setEdycja('nowy')}>+ Nowy klient</Przycisk>} />
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Źródło" filtry={[{ w: 'wszystkie', e: 'Wszystkie źródła' }, ...zrodla.map((z) => ({ w: z, e: z }))]} sorty={[{ w: 'nazwa', e: 'Alfabetycznie' }, { w: 'nowi', e: 'Najnowsi' }]} />
      {lista.length === 0 ? <Pusto tytul={klienci.length ? 'Nic nie pasuje do wyszukiwania' : 'Kartoteka jest pusta'} opis="Klienci dodają się sami przy tworzeniu oferty z wiadomości. Możesz też dodać ich ręcznie." /> : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {lista.map((x) => (
            <li key={x.id}><button type="button" onClick={() => setKarta(x.id)} className="w-full rounded-2xl border border-linia bg-karta p-3.5 text-left hover:border-akcent">
              <div className="flex items-start justify-between gap-2"><span className="truncate text-[17px] font-semibold">{x.nazwa}</span>{x.zrodlo && <Znaczek>{x.zrodlo}</Znaczek>}</div>
              <div className="truncate text-sm text-przygasz">{[x.telefon, x.adres].filter(Boolean).join(' · ') || '—'}</div>
              <div className="mt-1 text-xs text-przygasz">Zlecenia: {zlecenia.filter((z) => z.klientId === x.id).length} · Oferty: {oferty.filter((o) => o.klientId === x.id).length}</div>
            </button></li>
          ))}
        </ul>
      )}
      {k && (
        <Okno tytul={k.nazwa} onClose={() => setKarta(null)} szerokie stopka={<>
          {kto === 'wlasciciel' && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => {
            const odp = await pytaj({ tytul: `Usunąć klienta „${k.nazwa}”?`, tresc: 'Zwykłe usunięcie można cofnąć. Usunięcie danych osobowych (RODO) trwale czyści imię, telefon, e-mail i adres także w ofertach, zleceniach, dokumentach i historii – tego nie da się cofnąć.',
              opcje: [{ w: 'zwykle', e: 'Usuń z kartoteki' }, { w: 'rodo', e: 'Usuń dane osobowe (RODO)', grozne: true }] });
            if (odp === 'rodo') { await wymazKlienta(k.id); komunikat('Dane osobowe klienta zostały trwale usunięte.'); setKarta(null); }
            if (odp === 'zwykle') { await usun('klienci', k.id, { etykieta: 'Usunięto klienta' }); komunikat('Usunięto klienta.', 'ok', true); setKarta(null); }
          }}>Usuń…</Przycisk>}
          <Przycisk onClick={() => eksportKlienta(k.id)}>Eksport danych (RODO)</Przycisk>
          <Przycisk wariant="glowny" onClick={() => setEdycja(k)}>Edytuj</Przycisk></>}>
          {k.telefon && <Wiersz etykieta="Telefon"><a className="text-akcent" href={`tel:${k.telefon.replace(/\s/g, '')}`}>{k.telefon}</a></Wiersz>}
          {k.email && <Wiersz etykieta="E-mail"><a className="text-akcent" href={`mailto:${k.email}`}>{k.email}</a></Wiersz>}
          <Wiersz etykieta="Adres">{k.adres || '–'}</Wiersz>
          <Wiersz etykieta="Źródło">{k.zrodlo || '–'}</Wiersz>
          {k.notatki && <p className="whitespace-pre-wrap rounded-xl bg-wglebienie p-3 text-sm">{k.notatki}</p>}
          <h3 className="pt-2 font-semibold">Zlecenia ({jegoZlecenia.length})</h3>
          {jegoZlecenia.length === 0 ? <p className="text-sm text-przygasz">Brak zleceń.</p> : <ul className="divide-y divide-linia">{jegoZlecenia.map((z) => <li key={z.id}><Link to={`/zlecenia/${z.id}`} className="flex min-h-11 items-center justify-between gap-2"><span className="truncate">{z.opis || z.adres || z.system}</span><span className="flex items-center gap-2 whitespace-nowrap text-sm">{zl(z.netto)} <Znaczek ton={tonStatusu(z.status)}>{z.status}</Znaczek></span></Link></li>)}</ul>}
          <h3 className="pt-2 font-semibold">Oferty ({jegoOferty.length})</h3>
          {jegoOferty.length === 0 ? <p className="text-sm text-przygasz">Brak ofert.</p> : <ul className="divide-y divide-linia">{jegoOferty.map((o) => <li key={o.id}><Link to={`/oferty/${o.id}`} className="flex min-h-11 items-center justify-between gap-2"><span>{o.nr} · {fmtData(o.data)}</span><span className="flex items-center gap-2 whitespace-nowrap text-sm">{zl(sumaOferty(o).netto)} <Znaczek ton={tonStatusu(o.status)}>{o.status}</Znaczek></span></Link></li>)}</ul>}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to={`/oferty/nowa?klient=${k.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-linia bg-karta px-4 font-medium">+ Oferta dla klienta</Link>
          </div>
        </Okno>
      )}
      {edycja && <FormularzKlienta klient={edycja === 'nowy' ? undefined : edycja} onClose={() => setEdycja(null)} />}
    </>
  );
}
