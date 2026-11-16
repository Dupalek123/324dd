import { useMemo, useState } from 'react';
import { imie, useTabela, useUst } from '../db/hooki';
import { zapiszXLSX } from '../db/kopie';
import { komunikat } from '../db/sesja';
import { fmtIlosc, fmtMiesiac, proc } from '../lib/kwoty';
import { raportOkresowy, raportSystemow, raportTypowPrac, raportZrodel, type WierszGrupy } from '../lib/raporty';
import { raportPdf } from '../pdf/dokumenty';
import { pobierzPdf } from '../pdf/pdf';
import { Kwota, Naglowek, Przelacznik, Przycisk, Pusto, Segmenty, Tabela, Wybor } from '../ui/komponenty';
import { WykresSlupkowy } from '../ui/Wykres';

type Zak = 'okresy' | 'systemy' | 'typy' | 'zrodla' | 'praca' | 'wspolnicy';

export default function Raporty() {
  const ust = useUst();
  const zlecenia = useTabela('zlecenia');
  const koszty = useTabela('koszty');
  const godziny = useTabela('godziny');
  const klienci = useTabela('klienci');
  const [zak, setZak] = useState<Zak>('okresy');
  const [lata, setLata] = useState(false);
  const [rok, setRok] = useState('wszystkie');
  const [zWR, setZWR] = useState(false);
  const dane = useMemo(() => ({ zlecenia, koszty, godziny, klienci, ust }), [zlecenia, koszty, godziny, klienci, ust]);
  const okresy = useMemo(() => raportOkresowy(dane, lata ? 4 : 7, zWR).filter((w) => rok === 'wszystkie' || w.okres.startsWith(rok)), [dane, lata, zWR, rok]);
  const wRoku = useMemo(() => (rok === 'wszystkie' ? dane : { ...dane, zlecenia: zlecenia.filter((z) => (z.dataKoniec ?? z.dataStart ?? '').startsWith(rok)) }), [dane, rok, zlecenia]);
  const systemy = useMemo(() => raportSystemow(wRoku, zWR), [wRoku, zWR]);
  const typy = useMemo(() => raportTypowPrac(wRoku, zWR), [wRoku, zWR]);
  const zrodla = useMemo(() => raportZrodel(wRoku, zWR), [wRoku, zWR]);
  const dostepneLata = [...new Set(raportOkresowy(dane, 4, true).map((w) => w.okres))].sort().reverse();
  const nazwaOkresu = (o: string) => (o.length === 7 ? fmtMiesiac(o) : o);
  const A = imie(ust, 'wlasciciel'), B = imie(ust, 'wspolnik');
  const s = (k: keyof (typeof okresy)[number]) => okresy.reduce((a, w) => a + (w[k] as number), 0);

  const arkusze = () => [
    { nazwa: lata ? 'Lata' : 'Miesiące', wiersze: [['Okres', 'Zleceń', 'Przychód netto', 'Koszty zleceń', 'Koszty ogólne', 'Wynik', 'Marża %', A, B, `Godziny ${A}`, `Godziny ${B}`, 'km', 'Litry', 'Transport i paliwo netto'],
      ...okresy.map((w) => [nazwaOkresu(w.okres), w.zlecen, w.przychod, w.koszty, w.ogolne, w.wynik, w.marza, w.wlasciciel, w.wspolnik, w.godzWlasciciel, w.godzWspolnik, w.km, w.litry, w.paliwo])] },
    ...([['Systemy Festfloor', systemy], ['Typy prac', typy], ['Źródła klientów', zrodla]] as [string, WierszGrupy[]][]).map(([nazwa, l]) => ({ nazwa, wiersze: [[nazwa, 'Zleceń', 'm²', 'Przychód netto', 'Koszty', 'Wynik', 'Marża %'], ...l.map((w) => [w.nazwa, w.zlecen, w.m2, w.przychod, w.koszty, w.wynik, w.marza])] })),
  ];
  const tabelaGrup = (naglowek: string, l: WierszGrupy[]) => l.length === 0 ? <Pusto tytul="Brak danych" opis="Raport obejmuje zlecenia zakończone (opcjonalnie także w realizacji)." /> : (
    <Tabela naglowki={[naglowek, { e: 'Zleceń', prawo: true }, { e: 'm²', prawo: true }, { e: 'Przychód', prawo: true }, { e: 'Koszty', prawo: true }, { e: 'Wynik', prawo: true }, { e: 'Marża', prawo: true }]}>
      {l.map((w, i) => <tr key={w.nazwa}><td className="font-medium">{naglowek === 'Źródło' ? `${i + 1}. ` : ''}{w.nazwa}</td><td className="liczby text-right">{w.zlecen}</td><td className="liczby text-right">{fmtIlosc(w.m2)}</td><td className="text-right"><Kwota v={w.przychod} /></td><td className="text-right"><Kwota v={w.koszty} /></td><td className="text-right"><Kwota v={w.wynik} kolor /></td><td className="liczby text-right">{proc(w.marza)}</td></tr>)}
    </Tabela>);

  return (
    <>
      <Naglowek tytul="Raporty" akcje={<>
        <Przycisk maly onClick={() => zapiszXLSX(`raport-beskid-floor-${rok}.xlsx`, arkusze()).then(() => komunikat('Pobrano raport XLSX.'))}>Eksport XLSX</Przycisk>
        <Przycisk maly onClick={() => pobierzPdf(raportPdf(ust, `Raport ${rok === 'wszystkie' ? '' : rok}`.trim(), arkusze().map((a) => ({ tytul: a.nazwa, wiersze: a.wiersze }))), `Raport ${rok}`).catch((e) => komunikat((e as Error).message, 'blad'))}>Eksport PDF</Przycisk>
      </>} />
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Wybor klasa="w-36" etykieta="Rok" value={rok} opcje={[{ w: 'wszystkie', e: 'Wszystkie' }, ...dostepneLata.map((r) => ({ w: r, e: r }))]} onChange={setRok} />
        <Przelacznik etykieta="Także zlecenia w realizacji" value={zWR} onChange={setZWR} />
      </div>
      <div className="mb-4"><Segmenty etykieta="Raport" value={zak} onChange={setZak} opcje={[{ w: 'okresy', e: 'Przychód i wynik' }, { w: 'systemy', e: 'Systemy' }, { w: 'typy', e: 'Typy prac' }, { w: 'zrodla', e: 'Źródła klientów' }, { w: 'praca', e: 'Godziny i paliwo' }, { w: 'wspolnicy', e: 'Wspólnicy' }]} /></div>

      {(zak === 'okresy' || zak === 'praca' || zak === 'wspolnicy') && <div className="mb-3"><Segmenty etykieta="Okres" value={lata ? 'lata' : 'mies'} onChange={(v) => setLata(v === 'lata')} opcje={[{ w: 'mies', e: 'Miesiące' }, { w: 'lata', e: 'Lata' }]} /></div>}
      {zak === 'okresy' && (okresy.length === 0 ? <Pusto tytul="Brak danych do raportu" opis="Raport liczy zlecenia zakończone wg daty zakończenia. Koszty ogólne firmy trafiają do miesiąca, w którym je poniesiono." /> : <>
        <div className="mb-4 rounded-2xl border border-linia bg-karta p-4"><WykresSlupkowy dane={okresy.slice(-12).map((w) => ({ etykieta: w.okres.length === 7 ? w.okres.slice(5) + '.' + w.okres.slice(2, 4) : w.okres, pelna: nazwaOkresu(w.okres), a: w.przychod, b: w.wynik }))} nazwaA="Przychód netto" nazwaB="Wynik" /></div>
        <Tabela naglowki={['Okres', { e: 'Zleceń', prawo: true }, { e: 'Przychód netto', prawo: true }, { e: 'Koszty zleceń', prawo: true }, { e: 'Koszty ogólne', prawo: true }, { e: 'Wynik', prawo: true }, { e: 'Marża', prawo: true }]}
          stopka={<tr><td>Razem</td><td className="liczby text-right">{s('zlecen')}</td><td className="text-right"><Kwota v={s('przychod')} /></td><td className="text-right"><Kwota v={s('koszty')} /></td><td className="text-right"><Kwota v={s('ogolne')} /></td><td className="text-right"><Kwota v={s('wynik')} kolor /></td><td className="liczby text-right">{proc(s('przychod') ? (s('wynik') / s('przychod')) * 100 : 0)}</td></tr>}>
          {okresy.map((w) => <tr key={w.okres}><td className="whitespace-nowrap font-medium">{nazwaOkresu(w.okres)}</td><td className="liczby text-right">{w.zlecen}</td><td className="text-right"><Kwota v={w.przychod} /></td><td className="text-right"><Kwota v={w.koszty} /></td><td className="text-right"><Kwota v={w.ogolne} /></td><td className="text-right"><Kwota v={w.wynik} kolor /></td><td className="liczby text-right">{proc(w.marza)}</td></tr>)}
        </Tabela>
      </>)}
      {zak === 'systemy' && tabelaGrup('System', systemy)}
      {zak === 'typy' && tabelaGrup('Typ prac', typy)}
      {zak === 'zrodla' && tabelaGrup('Źródło', zrodla)}
      {zak === 'praca' && (okresy.length === 0 ? <Pusto tytul="Brak danych" /> : (
        <Tabela naglowki={['Okres', { e: `Godziny ${A}`, prawo: true }, { e: `Godziny ${B}`, prawo: true }, { e: 'km', prawo: true }, { e: 'Litry', prawo: true }, { e: 'Transport i paliwo netto', prawo: true }]}
          stopka={<tr><td>Razem</td><td className="liczby text-right">{fmtIlosc(s('godzWlasciciel'))}</td><td className="liczby text-right">{fmtIlosc(s('godzWspolnik'))}</td><td className="liczby text-right">{fmtIlosc(s('km'))}</td><td className="liczby text-right">{fmtIlosc(s('litry'))}</td><td className="text-right"><Kwota v={s('paliwo')} /></td></tr>}>
          {okresy.map((w) => <tr key={w.okres}><td className="whitespace-nowrap font-medium">{nazwaOkresu(w.okres)}</td><td className="liczby text-right">{fmtIlosc(w.godzWlasciciel)}</td><td className="liczby text-right">{fmtIlosc(w.godzWspolnik)}</td><td className="liczby text-right">{fmtIlosc(w.km)}</td><td className="liczby text-right">{fmtIlosc(w.litry)}</td><td className="text-right"><Kwota v={w.paliwo} /></td></tr>)}
        </Tabela>))}
      {zak === 'wspolnicy' && (okresy.length === 0 ? <Pusto tytul="Brak danych" /> : (
        <Tabela naglowki={['Okres', { e: 'Wynik zleceń', prawo: true }, { e: A, prawo: true }, { e: B, prawo: true }]}
          stopka={<tr><td>Razem</td><td className="text-right"><Kwota v={s('wlasciciel') + s('wspolnik')} /></td><td className="text-right"><Kwota v={s('wlasciciel')} /></td><td className="text-right"><Kwota v={s('wspolnik')} /></td></tr>}>
          {okresy.map((w) => <tr key={w.okres}><td className="whitespace-nowrap font-medium">{nazwaOkresu(w.okres)}</td><td className="text-right"><Kwota v={w.wlasciciel + w.wspolnik} /></td><td className="text-right"><Kwota v={w.wlasciciel} /></td><td className="text-right"><Kwota v={w.wspolnik} /></td></tr>)}
        </Tabela>))}
      <p className="mt-3 text-xs text-przygasz">Wszystkie kwoty netto. Wynik przed podatkami i składkami.</p>
    </>
  );
}
