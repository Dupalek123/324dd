import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { akcja, dodaj, usun, zmien } from '../db/baza';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { dzis, fmtData, fmtIlosc, zaokr, zl } from '../lib/kwoty';
import { rozliczenie, saldo, szacunekPodatkow, type FiltrRozliczenia } from '../lib/obliczenia';
import { OSOBY, type OsobaId, type Wyplata } from '../lib/typy';
import { Kafel, Karta, Kwota, Naglowek, Okno, Pole, PoleLiczba, Przycisk, Pusto, Segmenty, Tabela, tonStatusu, useForm, useUsuwanie, Wiersz, Wybor, Znaczek } from '../ui/komponenty';
import { useOpcjeZlecen } from './formularze';

function FormularzWyplaty({ wyplata, poczatkowe, onClose }: { wyplata?: Wyplata; poczatkowe?: Partial<Wyplata>; onClose: () => void }) {
  const ust = useUst();
  const opcje = useOpcjeZlecen('— zaliczka / bez zlecenia —');
  const usuwanie = useUsuwanie();
  const [w, ustaw] = useForm<Partial<Wyplata>>({ data: dzis(), osoba: 'wspolnik', kwota: 0, zlecenieId: null, opis: '', ...poczatkowe, ...wyplata });
  const [blad, setBlad] = useState<string | null>(null);
  const zapisz = async () => {
    if (!w.kwota) { setBlad('Podaj kwotę wypłaty.'); return; }
    if (wyplata) await zmien('wyplaty', wyplata.id, w, { etykieta: 'Zapisano wypłatę' }); else await dodaj('wyplaty', w, { etykieta: 'Dodano wypłatę' });
    komunikat('Zapisano wypłatę.', 'ok', true);
    onClose();
  };
  return (
    <Okno tytul={wyplata ? 'Edycja wypłaty' : 'Nowa wypłata'} onClose={onClose} stopka={<>
      {wyplata && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('wypłatę', () => usun('wyplaty', wyplata.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Data" type="date" value={w.data ?? ''} onChange={(v) => ustaw('data', v)} />
        <Wybor etykieta="Komu" value={w.osoba ?? 'wspolnik'} opcje={OSOBY.map((o) => ({ w: o, e: imie(ust, o) }))} onChange={(v) => ustaw('osoba', v)} />
      </div>
      <PoleLiczba etykieta="Kwota" jedn="zł" value={w.kwota} onChange={(v) => ustaw('kwota', v ?? 0)} blad={blad} />
      <Wybor etykieta="Zlecenie" value={w.zlecenieId ?? '__brak__'} opcje={opcje} onChange={(v) => ustaw('zlecenieId', v === '__brak__' ? null : v)} />
      <Pole etykieta="Opis" value={w.opis ?? ''} onChange={(v) => ustaw('opis', v)} />
    </Okno>
  );
}

export default function Rozliczenie() {
  const ust = useUst();
  const kto = useKto();
  const zlecenia = useTabela('zlecenia');
  const koszty = useTabela('koszty');
  const godziny = useTabela('godziny');
  const wyplaty = useTabela('wyplaty');
  const [filtr, setFiltr] = useState<FiltrRozliczenia>({ status: 'zakonczone', od: null, do: null });
  const [okno, setOkno] = useState<{ wyplata?: Wyplata; poczatkowe?: Partial<Wyplata> } | null>(null);
  const pelne = kto === 'wlasciciel' || (ust.uprawnienia.rozliczenie && ust.uprawnienia.kwoty && ust.uprawnienia.koszty);
  const r = useMemo(() => rozliczenie(zlecenia, koszty, godziny, wyplaty, ust, filtr), [zlecenia, koszty, godziny, wyplaty, ust, filtr]);
  const s = useMemo(() => saldo(zlecenia, koszty, godziny, wyplaty, ust), [zlecenia, koszty, godziny, wyplaty, ust]);
  const historia = [...wyplaty].sort((a, b) => b.data.localeCompare(a.data));
  const nazwa = (id: string | null) => zlecenia.find((z) => z.id === id)?.klient ?? (id ? '—' : 'Zaliczka / bez zlecenia');

  if (!pelne) {
    // Wspólnik bez uprawnień: tylko własne godziny w zleceniach rozliczanych godzinowo i własne wypłaty
    const moje = zlecenia.filter((z) => z.tryb === 'godz' && z.klientOd !== kto && z.status !== 'Oferta').map((z) => {
      const h = zaokr(godziny.filter((g) => g.zlecenieId === z.id && g.osoba === kto).reduce((a, g) => a + g.godziny, 0));
      const stawka = z.stawka ?? ust.stawka;
      return { z, h, stawka, kwota: zaokr(h * stawka) };
    }).filter((x) => x.h > 0);
    const nalezne = zaokr(moje.reduce((a, x) => a + x.kwota, 0));
    const wyplacono = zaokr(wyplaty.filter((w) => w.osoba === kto).reduce((a, w) => a + w.kwota, 0));
    return (
      <>
        <Naglowek tytul="Moje rozliczenie" />
        <div className="mb-4 grid grid-cols-2 gap-3"><Kafel etykieta="Za godziny" wartosc={zl(nalezne)} /><Kafel etykieta="Wypłacono" wartosc={zl(wyplacono)} /></div>
        <p className="mb-4 text-sm text-przygasz">Widzisz wynagrodzenie za godziny w zleceniach rozliczanych godzinowo oraz swoje wypłaty. Udział w zleceniach rozliczanych procentowo pokazuje właściciel (wymaga dodatkowych uprawnień). Kwoty przed podatkami i składkami.</p>
        {moje.length === 0 ? <Pusto tytul="Brak godzin do rozliczenia" /> : (
          <Tabela naglowki={['Zlecenie', { e: 'Godziny', prawo: true }, { e: 'Stawka', prawo: true }, { e: 'Kwota', prawo: true }]}>
            {moje.map((x) => <tr key={x.z.id}><td>{x.z.klient}</td><td className="liczby text-right">{fmtIlosc(x.h)}</td><td className="liczby text-right">{zl(x.stawka)}</td><td className="text-right"><Kwota v={x.kwota} /></td></tr>)}
          </Tabela>
        )}
        {historia.length > 0 && <Karta className="mt-4" tytul="Moje wypłaty">{historia.filter((w) => w.osoba === kto).map((w) => <Wiersz key={w.id} etykieta={`${fmtData(w.data)} · ${w.opis || nazwa(w.zlecenieId)}`}><Kwota v={w.kwota} /></Wiersz>)}</Karta>}
      </>
    );
  }

  const miesiecy = new Set(r.wiersze.map((w) => (w.zlecenie.dataKoniec ?? w.zlecenie.dataStart ?? '').slice(0, 7)).filter(Boolean)).size || 1;
  const wyplac = async (zlecenieId: string, osoba: OsobaId, kwota: number) => {
    await dodaj('wyplaty', { data: dzis(), osoba, kwota, zlecenieId, opis: 'Rozliczenie zlecenia' }, { etykieta: 'Oznaczono jako wypłacone' });
    komunikat(`Oznaczono jako wypłacone: ${zl(kwota)} (${imie(ust, osoba)}).`, 'ok', true);
  };
  const wyplacWszystko = async (osoba: OsobaId) => {
    const doWyplaty = r.wiersze.map((w) => ({ id: w.zlecenie.id, kwota: zaokr(w.podzial.kwoty[osoba] - w.wyplacono[osoba]) })).filter((x) => x.kwota > 0);
    if (!doWyplaty.length) { komunikat('Nie ma nic do wypłaty w wybranych zleceniach.', 'info'); return; }
    await akcja('Oznaczono jako wypłacone', async () => { for (const x of doWyplaty) await dodaj('wyplaty', { data: dzis(), osoba, kwota: x.kwota, zlecenieId: x.id, opis: 'Rozliczenie zlecenia' }); });
    komunikat(`Oznaczono ${doWyplaty.length} rozliczeń jako wypłacone.`, 'ok', true);
  };

  return (
    <>
      <Naglowek tytul="Rozliczenie wspólników" akcje={kto === 'wlasciciel' && <Przycisk wariant="glowny" onClick={() => setOkno({})}>+ Wypłata</Przycisk>} />
      <p className="mb-4 rounded-xl border border-uwaga/40 bg-uwaga/10 px-3 py-2 text-sm">To wynik <strong>przed podatkami i składkami</strong>. Liczony od kwot netto: przychód − koszty, podzielony wg trybu każdego zlecenia.</p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {OSOBY.map((o) => (
          <Karta key={o} tytul={imie(ust, o)}>
            <Wiersz etykieta="Należne (wybrane zlecenia)"><Kwota v={r.suma[o]} /></Wiersz>
            <Wiersz etykieta="Godziny">{fmtIlosc(r.godziny[o])} h</Wiersz>
            <Wiersz etykieta="Należne z zakończonych"><Kwota v={s[o].nalezne} /></Wiersz>
            <Wiersz etykieta="Wypłacono łącznie"><Kwota v={s[o].wyplacono} /></Wiersz>
            <Wiersz etykieta="Saldo do wypłaty" mocny><Kwota v={s[o].saldo} kolor /></Wiersz>
            {kto === 'wlasciciel' && <Przycisk maly className="mt-2" onClick={() => wyplacWszystko(o)}>Oznacz widoczne jako wypłacone</Przycisk>}
          </Karta>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Segmenty etykieta="Status" value={filtr.status} onChange={(v) => setFiltr({ ...filtr, status: v })} opcje={[{ w: 'zakonczone', e: 'Zakończone' }, { w: 'w_realizacji', e: 'W realizacji' }, { w: 'wszystkie', e: 'Wszystkie' }]} />
        <Pole klasa="w-40" etykieta="Od" type="date" value={filtr.od ?? ''} onChange={(v) => setFiltr({ ...filtr, od: v || null })} />
        <Pole klasa="w-40" etykieta="Do" type="date" value={filtr.do ?? ''} onChange={(v) => setFiltr({ ...filtr, do: v || null })} />
      </div>
      {r.wiersze.length === 0 ? <Pusto tytul="Brak zleceń w wybranym zakresie" opis="Zmień filtr statusu albo zakres dat." /> : (
        <Tabela naglowki={['Zlecenie', 'Status', 'Tryb', { e: 'Wynik', prawo: true }, { e: imie(ust, 'wlasciciel'), prawo: true }, { e: imie(ust, 'wspolnik'), prawo: true }, { e: 'Godziny', prawo: true }, 'Wypłata']}
          stopka={<tr><td colSpan={3}>Suma ({r.wiersze.length})</td><td className="text-right"><Kwota v={r.wynik} kolor /></td><td className="text-right"><Kwota v={r.suma.wlasciciel} /></td><td className="text-right"><Kwota v={r.suma.wspolnik} /></td><td className="liczby text-right">{fmtIlosc(r.godziny.wlasciciel)} / {fmtIlosc(r.godziny.wspolnik)}</td><td /></tr>}>
          {r.wiersze.map(({ zlecenie: z, wynik, podzial: p, wyplacono }) => {
            const zostalo = zaokr(p.kwoty.wspolnik - wyplacono.wspolnik);
            return (
              <tr key={z.id}>
                <td><Link to={`/zlecenia/${z.id}`} className="font-medium hover:text-akcent">{z.klient}</Link><div className="text-xs text-przygasz">od: {imie(ust, p.klientOd)}</div></td>
                <td><Znaczek ton={tonStatusu(z.status)}>{z.status}</Znaczek></td>
                <td className="whitespace-nowrap text-sm">{p.tryb === 'godz' ? `Sam + pomoc (${fmtIlosc(p.stawka)} zł/h)` : `Razem ${fmtIlosc(p.udzial)}/${fmtIlosc(100 - p.udzial)}`}</td>
                <td className="text-right"><Kwota v={wynik.wynik} kolor /></td>
                <td className="text-right"><Kwota v={p.kwoty.wlasciciel} /></td>
                <td className="text-right"><Kwota v={p.kwoty.wspolnik} /></td>
                <td className="liczby whitespace-nowrap text-right">{fmtIlosc(p.godziny.wlasciciel)} / {fmtIlosc(p.godziny.wspolnik)}</td>
                <td className="whitespace-nowrap">{zostalo <= 0 && p.kwoty.wspolnik > 0 ? <Znaczek ton="dobrze">wypłacone</Znaczek> : zostalo > 0 ? (kto === 'wlasciciel' ? <Przycisk maly onClick={() => wyplac(z.id, 'wspolnik', zostalo)}>Wypłać {zl(zostalo)}</Przycisk> : <Znaczek ton="uwaga">do wypłaty {zl(zostalo)}</Znaczek>) : <span className="text-przygasz">–</span>}</td>
              </tr>
            );
          })}
        </Tabela>
      )}

      {ust.podatki.wlaczone && (
        <Karta className="mt-4" tytul="Szacunek podatku i ZUS (orientacyjnie)">
          <div className="grid gap-4 sm:grid-cols-2">{OSOBY.map((o) => { const x = szacunekPodatkow(r.suma[o], miesiecy, ust.podatki); return (
            <div key={o}><div className="mb-1 font-medium">{imie(ust, o)}</div>
              <Wiersz etykieta={`Podatek (${fmtIlosc(ust.podatki.podatekProc)}%)`}><Kwota v={x.podatek} /></Wiersz>
              <Wiersz etykieta={`Składka zdrowotna (${fmtIlosc(ust.podatki.zdrowotnaProc)}%)`}><Kwota v={x.zdrowotna} /></Wiersz>
              <Wiersz etykieta={`ZUS (${miesiecy} mies. × ${zl(ust.podatki.zusMies)})`}><Kwota v={x.zus} /></Wiersz>
              <Wiersz etykieta="Szacunkowo na rękę" mocny><Kwota v={x.naReke} kolor /></Wiersz></div>); })}</div>
          <p className="mt-2 text-xs text-przygasz">Uproszczone wyliczenie z parametrów wpisanych w Ustawieniach (te same dla obu osób). To nie jest porada podatkowa – faktyczne kwoty ustala księgowa.</p>
        </Karta>
      )}

      <Karta className="mt-4" tytul="Historia wypłat">
        {historia.length === 0 ? <p className="text-sm text-przygasz">Nie zapisano jeszcze żadnych wypłat.</p> : (
          <ul className="divide-y divide-linia">{historia.map((w) => (
            <li key={w.id}><button type="button" disabled={kto !== 'wlasciciel'} onClick={() => setOkno({ wyplata: w })} className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left">
              <span className="liczby w-24 shrink-0 text-sm text-przygasz">{fmtData(w.data)}</span>
              <span className="min-w-0 flex-1 truncate">{imie(ust, w.osoba)} · {nazwa(w.zlecenieId)}{w.opis ? ` · ${w.opis}` : ''}</span><Kwota v={w.kwota} />
            </button></li>))}
          </ul>)}
      </Karta>
      {okno && <FormularzWyplaty wyplata={okno.wyplata} poczatkowe={okno.poczatkowe} onClose={() => setOkno(null)} />}
    </>
  );
}
