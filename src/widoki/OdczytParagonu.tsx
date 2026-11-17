import { useEffect, useRef, useState } from 'react';
import { mozeOdczytacParagon, odczytajParagon } from '../db/paragon';
import { fmtData, fmtIlosc, zl } from '../lib/kwoty';
import { dataParagonu, opisParagonu, sumyParagonu, type DaneParagonu } from '../lib/paragon';
import type { Kategoria, Vat } from '../lib/typy';
import { Przycisk, Wiersz } from '../ui/komponenty';

export interface WynikOdczytu { data: string | null; dostawca: string; opis: string; netto: number; brutto: number; vat: Vat; kategoria: Kategoria | null }

type Stan = { s: 'spoczynek' } | { s: 'trwa' } | { s: 'blad'; blad: string } | { s: 'ok'; dane: DaneParagonu } | { s: 'wstawiono' };

/**
 * Odczyt paragonu ze zdjęcia. Wynik zawsze trafia najpierw do akceptacji – nic nie jest wpisywane samo.
 * `klucz` zmienia się przy wyborze nowego zdjęcia; przy `auto` odczyt rusza wtedy sam.
 */
export function OdczytParagonu({ zrodlo, klucz, auto, domyslnyVat, onUzyj }: { zrodlo: () => Promise<Blob | null>; klucz: number; auto: boolean; domyslnyVat: Vat; onUzyj: (w: WynikOdczytu) => void }) {
  const [st, setSt] = useState<Stan>({ s: 'spoczynek' });
  const numer = useRef(0);
  const uruchom = async () => {
    const moj = ++numer.current;
    setSt({ s: 'trwa' });
    try {
      const b = await zrodlo();
      if (!b) { if (moj === numer.current) setSt({ s: 'blad', blad: 'Nie znaleziono zdjęcia (może jeszcze się nie pobrało – spróbuj po połączeniu z siecią).' }); return; }
      const dane = await odczytajParagon(b);
      if (moj === numer.current) setSt({ s: 'ok', dane });
    } catch (e) { if (moj === numer.current) setSt({ s: 'blad', blad: (e as Error).message }); }
  };
  useEffect(() => { setSt({ s: 'spoczynek' }); if (auto && klucz > 0 && mozeOdczytacParagon()) void uruchom(); return () => { numer.current++; }; }, [klucz]); // eslint-disable-line

  if (!mozeOdczytacParagon()) return null;
  if (st.s === 'spoczynek') return <Przycisk maly onClick={uruchom}>Odczytaj dane z paragonu</Przycisk>;
  if (st.s === 'trwa') return <p role="status" className="rounded-xl bg-wglebienie px-3 py-2 text-sm">Odczytuję paragon… (kilka sekund)</p>;
  if (st.s === 'wstawiono') return <p className="text-sm text-dobrze">Wstawiono dane z paragonu. Sprawdź je przed zapisem. <button type="button" className="underline" onClick={uruchom}>Odczytaj ponownie</button></p>;
  if (st.s === 'blad') return (
    <div role="alert" className="rounded-xl border border-zle/40 bg-zle/10 px-3 py-2 text-sm text-zle">
      <p>Nie udało się odczytać paragonu: {st.blad}</p>
      <Przycisk maly className="mt-2" onClick={uruchom}>Spróbuj ponownie</Przycisk>
    </div>
  );
  const d = st.dane;
  const s = sumyParagonu(d, domyslnyVat);
  const data = dataParagonu(d.data);
  if (!d.czy_paragon || (!d.pozycje.length && !d.razem_brutto)) return (
    <div className="rounded-xl border border-uwaga/40 bg-uwaga/10 px-3 py-2 text-sm">
      <p>To zdjęcie nie wygląda na czytelny paragon lub fakturę. Zrób je z bliska, na płasko, przy dobrym świetle – cały dokument w kadrze.</p>
      <Przycisk maly className="mt-2" onClick={uruchom}>Odczytaj ponownie</Przycisk>
    </div>
  );
  return (
    <div className="rounded-xl border border-akcent/50 bg-akcent-tlo/50 p-3">
      <div className="mb-1 text-sm font-semibold">Odczytano z paragonu – sprawdź przed wstawieniem</div>
      <Wiersz etykieta="Data">{data ? fmtData(data) : <span className="text-uwaga">nie odczytano</span>}</Wiersz>
      <Wiersz etykieta="Sprzedawca">{d.sprzedawca || '–'}{d.nip ? ` (NIP ${d.nip})` : ''}</Wiersz>
      {d.numer && <Wiersz etykieta="Numer">{d.numer}</Wiersz>}
      {d.kategoria && <Wiersz etykieta="Kategoria">{d.kategoria}</Wiersz>}
      {d.pozycje.length > 0 && <ul className="my-1 divide-y divide-linia rounded-lg bg-karta px-2 text-sm">
        {d.pozycje.map((p, i) => <li key={i} className="flex items-baseline justify-between gap-3 py-1.5"><span className="min-w-0 flex-1 break-words">{p.nazwa}{p.ilosc !== 1 ? ` × ${fmtIlosc(p.ilosc)}` : ''}</span><span className="liczby whitespace-nowrap text-przygasz">{(p.vat >= 0 ? `${p.vat}% · ` : '')}{zl(p.wartosc_brutto)}</span></li>)}
      </ul>}
      {s.grupy.map((g) => <Wiersz key={g.vat} etykieta={`VAT ${g.vat}%: brutto ${zl(g.brutto)}`}>netto {zl(g.netto)}</Wiersz>)}
      <Wiersz etykieta="Razem" mocny>{zl(s.brutto)} brutto · {zl(s.netto)} netto</Wiersz>
      {s.rozbieznosc !== 0 && <p className="mt-1 text-sm text-uwaga">Suma pozycji różni się o {zl(Math.abs(s.rozbieznosc))} od sumy na paragonie (rabat lub nieodczytana pozycja). Do kosztu trafia kwota z paragonu.</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Przycisk wariant="glowny" onClick={() => { onUzyj({ data, dostawca: d.sprzedawca, opis: opisParagonu(d), netto: s.netto, brutto: s.brutto, vat: s.vat, kategoria: d.kategoria }); setSt({ s: 'wstawiono' }); }}>Wstaw do formularza</Przycisk>
        <Przycisk onClick={() => setSt({ s: 'spoczynek' })}>Odrzuć</Przycisk>
      </div>
    </div>
  );
}
