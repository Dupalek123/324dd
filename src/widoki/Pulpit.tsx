import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { dodajDni, dzis, fmtData, fmtIlosc, fmtMiesiac, MIES_KR, proc, zl } from '../lib/kwoty';
import { pulpit, raportOkresowy } from '../lib/raporty';
import { Kafel, Karta, Kwota, Naglowek, Przycisk, Pusto, tonStatusu, Wiersz, Znaczek } from '../ui/komponenty';
import { WykresSlupkowy } from '../ui/Wykres';
import { FormularzGodzin, FormularzKosztu, FormularzZlecenia } from './formularze';

export default function Pulpit() {
  const ust = useUst();
  const kto = useKto();
  const zlecenia = useTabela('zlecenia');
  const koszty = useTabela('koszty');
  const godziny = useTabela('godziny');
  const klienci = useTabela('klienci');
  const zadania = useTabela('zadania');
  const oferty = useTabela('oferty');
  const zapytania = useTabela('zapytania');
  const [okno, setOkno] = useState<'zlecenie' | 'koszt' | 'godziny' | null>(null);
  const maKwoty = kto === 'wlasciciel' || (ust.uprawnienia.kwoty && ust.uprawnienia.koszty);
  const dane = useMemo(() => ({ zlecenia, koszty, godziny, klienci, ust }), [zlecenia, koszty, godziny, klienci, ust]);
  const p = useMemo(() => pulpit(dane, dzis().slice(0, 7)), [dane]);
  const wykres = useMemo(() => {
    const mies = new Map(raportOkresowy(dane, 7, true).map((w) => [w.okres, w]));
    const d = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const x = new Date(d.getFullYear(), d.getMonth() - 11 + i, 1);
      const ym = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
      return { etykieta: MIES_KR[x.getMonth()], pelna: fmtMiesiac(ym), a: mies.get(ym)?.przychod ?? 0, b: mies.get(ym)?.wynik ?? 0 };
    });
  }, [dane]);

  const terminy = useMemo(() => {
    const od = dzis(), doo = dodajDni(od, 21);
    const l: { data: string; tekst: string; do: string; ton: 'akcent' | 'uwaga' | 'zle' | 'szary'; rodzaj: string }[] = [];
    for (const z of zlecenia) {
      if (z.dataStart && z.dataStart >= od && z.dataStart <= doo && z.status !== 'Zakończone') l.push({ data: z.dataStart, tekst: `Start: ${z.klient}`, do: `/zlecenia/${z.id}`, ton: 'akcent', rodzaj: 'Realizacja' });
      if (z.dataKoniec && z.dataKoniec >= od && z.dataKoniec <= doo && z.status === 'W realizacji') l.push({ data: z.dataKoniec, tekst: `Koniec: ${z.klient}`, do: `/zlecenia/${z.id}`, ton: 'uwaga', rodzaj: 'Realizacja' });
    }
    for (const t of zadania) if (!t.zrobione && t.termin && t.termin <= doo) l.push({ data: t.termin, tekst: t.tytul, do: '/zadania', ton: t.termin < od ? 'zle' : 'szary', rodzaj: t.termin < od ? 'Po terminie' : 'Zadanie' });
    for (const o of oferty) if (o.status === 'wysłana' && o.followUp && o.followUp <= doo) l.push({ data: o.followUp, tekst: `Oferta ${o.nr} bez odpowiedzi – ${o.klient}`, do: `/oferty/${o.id}`, ton: o.followUp <= od ? 'zle' : 'uwaga', rodzaj: 'Follow-up' });
    return l.sort((a, b) => a.data.localeCompare(b.data)).slice(0, 8);
  }, [zlecenia, zadania, oferty]);
  const nowe = zapytania.filter((z) => z.status === 'nowe');

  return (
    <>
      <Naglowek tytul="Pulpit" akcje={<>
        <Przycisk maly onClick={() => setOkno('godziny')}>+ Godziny</Przycisk>
        <Przycisk maly onClick={() => setOkno('koszt')}>+ Koszt</Przycisk>
        {kto === 'wlasciciel' && <Przycisk maly wariant="glowny" onClick={() => setOkno('zlecenie')}>+ Zlecenie</Przycisk>}
      </>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kafel etykieta="Zlecenia w toku" wartosc={String(p.wToku.length)} />
        {maKwoty && <>
          <Kafel etykieta="Wartość zleceń netto" wartosc={zl(p.wartosc)} />
          <Kafel etykieta="Koszty netto" wartosc={zl(p.koszty)} />
          <Kafel etykieta="Wynik" wartosc={zl(p.wynik)} ton={p.wynik < 0 ? 'zle' : 'dobrze'} opis="przed podatkami" />
        </>}
        <Kafel etykieta="Godziny w miesiącu" wartosc={`${fmtIlosc(kto === 'wlasciciel' || ust.uprawnienia.wszystkieGodziny ? p.godziny.razem : p.godziny[kto])} h`}
          opis={kto === 'wlasciciel' ? `${imie(ust, 'wlasciciel')} ${fmtIlosc(p.godziny.wlasciciel)} · ${imie(ust, 'wspolnik')} ${fmtIlosc(p.godziny.wspolnik)}` : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {maKwoty && (
          <Karta tytul={`Zakończone zlecenia (${p.zakonczone.liczba})`}>
            <Wiersz etykieta="Przychód netto"><Kwota v={p.zakonczone.przychod} /></Wiersz>
            <Wiersz etykieta="Koszty"><Kwota v={p.zakonczone.koszty} /></Wiersz>
            <Wiersz etykieta="Realny zarobek" mocny><Kwota v={p.zakonczone.wynik} kolor /></Wiersz>
            <Wiersz etykieta="Marża">{proc(p.zakonczone.marza)}</Wiersz>
            {(kto === 'wlasciciel' || ust.uprawnienia.rozliczenie) && <>
              <Wiersz etykieta={imie(ust, 'wlasciciel')}><Kwota v={p.zakonczone.wlasciciel} /></Wiersz>
              <Wiersz etykieta={imie(ust, 'wspolnik')}><Kwota v={p.zakonczone.wspolnik} /></Wiersz>
            </>}
            <p className="mt-2 text-xs text-przygasz">Kwoty przed podatkami i składkami.</p>
          </Karta>
        )}
        <Karta tytul="Najbliższe terminy" akcje={<Link to="/kalendarz" className="text-sm text-akcent">Kalendarz ›</Link>}>
          {terminy.length === 0 ? <p className="text-sm text-przygasz">Brak terminów w najbliższych trzech tygodniach.</p> : (
            <ul className="divide-y divide-linia">
              {terminy.map((t, i) => <li key={i}><Link to={t.do} className="flex min-h-11 items-center gap-3 py-1.5"><span className="liczby w-20 shrink-0 text-sm text-przygasz">{fmtData(t.data).slice(0, 5)}</span><span className="flex-1 truncate text-[15px]">{t.tekst}</span><Znaczek ton={t.ton}>{t.rodzaj}</Znaczek></Link></li>)}
            </ul>
          )}
        </Karta>
      </div>

      {nowe.length > 0 && (
        <Karta className="mt-4" tytul={`Nowe zapytania (${nowe.length})`} akcje={<Link to="/poczta" className="text-sm text-akcent">Wszystkie ›</Link>}>
          <ul className="divide-y divide-linia">{nowe.slice(0, 4).map((z) => <li key={z.id}><Link to="/poczta" className="block py-2"><div className="truncate text-[15px] font-medium">{z.temat || z.tresc.slice(0, 60)}</div><div className="truncate text-sm text-przygasz">{z.od} · {fmtData(z.data)}</div></Link></li>)}</ul>
        </Karta>
      )}

      <Karta className="mt-4" tytul="Zlecenia w toku" akcje={<Link to="/zlecenia" className="text-sm text-akcent">Wszystkie ›</Link>}>
        {p.wToku.length === 0 ? <Pusto tytul="Nic w toku" opis="Zaakceptowane i realizowane zlecenia pojawią się tutaj." /> : (
          <ul className="divide-y divide-linia">
            {p.wToku.map(({ zlecenie: z, wynik }) => (
              <li key={z.id}><Link to={`/zlecenia/${z.id}`} className="flex min-h-14 items-center gap-3 py-2">
                <div className="min-w-0 flex-1"><div className="truncate font-medium">{z.klient}</div><div className="truncate text-sm text-przygasz">{z.adres || z.opis || z.system}</div></div>
                <div className="text-right"><Znaczek ton={tonStatusu(z.status)}>{z.status}</Znaczek>{maKwoty && <div className="mt-0.5 text-sm"><Kwota v={wynik.wynik} kolor /></div>}</div>
              </Link></li>
            ))}
          </ul>
        )}
      </Karta>

      {maKwoty && <Karta className="mt-4" tytul="Przychód i wynik – ostatnie 12 miesięcy"><WykresSlupkowy dane={wykres} nazwaA="Przychód netto" nazwaB="Wynik" /><p className="mt-1 text-xs text-przygasz">Zlecenia zakończone i w realizacji, wg daty zakończenia. Tabela z liczbami: Raporty.</p></Karta>}

      {okno === 'zlecenie' && <FormularzZlecenia onClose={() => setOkno(null)} />}
      {okno === 'koszt' && <FormularzKosztu onClose={() => setOkno(null)} />}
      {okno === 'godziny' && <FormularzGodzin onClose={() => setOkno(null)} />}
    </>
  );
}
