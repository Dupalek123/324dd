import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { akcja, zmien } from '../db/baza';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { googleSkonfigurowany, pobierzWydarzenia, zapiszWydarzenie, type Wydarzenie } from '../google/google';
import { dodajDni, dzis, fmtData, fmtMiesiac, isoData, poczatekTygodnia } from '../lib/kwoty';
import { Karta, kl, Naglowek, Przycisk, usePytanie, Znaczek } from '../ui/komponenty';
import { FormularzZadania } from './formularze';

interface Pozycja { tekst: string; rodzaj: 'zlecenie' | 'zadanie' | 'google' | 'oferta'; do?: string; ekipa?: string[] }
const KOLORY = { zlecenie: 'bg-akcent text-na-akcencie', zadanie: 'bg-uwaga/20 text-uwaga', google: 'bg-wglebienie text-tekst', oferta: 'bg-zle/15 text-zle' };

export default function Kalendarz() {
  const ust = useUst();
  const kto = useKto();
  const pytaj = usePytanie();
  const zlecenia = useTabela('zlecenia');
  const zadania = useTabela('zadania');
  const oferty = useTabela('oferty');
  const [miesiac, setMiesiac] = useState(dzis().slice(0, 7));
  const [wybrany, setWybrany] = useState<string>(dzis());
  const [google, setGoogle] = useState<Wydarzenie[]>([]);
  const [czeka, setCzeka] = useState(false);
  const [noweZadanie, setNoweZadanie] = useState(false);

  const [r, m] = miesiac.split('-').map(Number);
  const pierwszy = poczatekTygodnia(`${miesiac}-01`);
  const ostatni = isoData(new Date(r, m, 0));
  const dni = useMemo(() => { const l: string[] = []; for (let d = pierwszy; d <= ostatni || l.length % 7 !== 0; d = dodajDni(d, 1)) l.push(d); return l; }, [pierwszy, ostatni]);

  const mapa = useMemo(() => {
    const mp = new Map<string, Pozycja[]>();
    const dodajP = (d: string, p: Pozycja) => mp.set(d, [...(mp.get(d) ?? []), p]);
    const powiazane = new Set(zlecenia.map((z) => z.googleEventId).filter(Boolean));
    for (const z of zlecenia) {
      if (!z.dataStart || z.status === 'Oferta') continue;
      for (let d = z.dataStart; d <= (z.dataKoniec ?? z.dataStart) && d <= dni[dni.length - 1]; d = dodajDni(d, 1)) if (d >= dni[0]) dodajP(d, { tekst: z.klient, rodzaj: 'zlecenie', do: `/zlecenia/${z.id}`, ekipa: z.ekipa });
    }
    for (const t of zadania) if (t.termin && !t.zrobione) dodajP(t.termin, { tekst: t.tytul, rodzaj: 'zadanie', do: '/zadania', ekipa: t.osoba ? [t.osoba] : [] });
    for (const o of oferty) if (o.status === 'wysłana' && o.followUp) dodajP(o.followUp, { tekst: `Przypomnij: ${o.klient}`, rodzaj: 'oferta', do: `/oferty/${o.id}` });
    for (const e of google) { if (powiazane.has(e.id) || e.zlecenieId) continue; for (let d = e.od; d <= e.do; d = dodajDni(d, 1)) dodajP(d, { tekst: e.tytul, rodzaj: 'google' }); }
    return mp;
  }, [zlecenia, zadania, oferty, google, dni]);

  const przesun = (k: number) => setMiesiac(isoData(new Date(r, m - 1 + k, 1)).slice(0, 7));
  const synchronizuj = async () => {
    setCzeka(true);
    try {
      const wydarzenia = await pobierzWydarzenia(ust.google.kalendarzId, dni[0], dni[dni.length - 1]);
      setGoogle(wydarzenia);
      // Google → aplikacja: terminy zmienione w kalendarzu
      const zmiany = wydarzenia.map((e) => ({ e, z: zlecenia.find((x) => x.id === e.zlecenieId) })).filter((x) => x.z && (x.z.dataStart !== x.e.od || (x.z.dataKoniec ?? x.z.dataStart) !== x.e.do));
      if (kto === 'wlasciciel' && zmiany.length && await pytaj({ tytul: 'Terminy zmienione w Kalendarzu Google', grozne: false, tak: 'Zaktualizuj zlecenia',
        tresc: <ul className="list-disc pl-5">{zmiany.map((x) => <li key={x.e.id}>{x.z!.klient}: {fmtData(x.z!.dataStart)}–{fmtData(x.z!.dataKoniec)} → {fmtData(x.e.od)}–{fmtData(x.e.do)}</li>)}</ul> })) {
        await akcja('Zaktualizowano terminy z kalendarza', async () => { for (const x of zmiany) await zmien('zlecenia', x.z!.id, { dataStart: x.e.od, dataKoniec: x.e.do, googleEventId: x.e.id }); });
      }
      // aplikacja → Google: zlecenia bez wydarzenia lub ze zmienionym terminem
      const zmienione = new Set(zmiany.map((x) => x.z!.id));
      const doWyslania = zlecenia.filter((z) => z.dataStart && z.status !== 'Oferta' && z.status !== 'Zakończone' && !zmienione.has(z.id)
        && !wydarzenia.some((e) => e.zlecenieId === z.id && e.od === z.dataStart && e.do === (z.dataKoniec ?? z.dataStart)) && (z.dataKoniec ?? z.dataStart!) >= dni[0] && z.dataStart! <= dni[dni.length - 1]);
      if (kto === 'wlasciciel' && doWyslania.length && await pytaj({ tytul: `Zapisać ${doWyslania.length} zleceń w Kalendarzu Google?`, grozne: false, tak: 'Zapisz w kalendarzu', tresc: <ul className="list-disc pl-5">{doWyslania.map((z) => <li key={z.id}>{z.klient}: {fmtData(z.dataStart)}–{fmtData(z.dataKoniec ?? z.dataStart)}</li>)}</ul> })) {
        for (const z of doWyslania) {
          const id = await zapiszWydarzenie(ust.google.kalendarzId, { ...z, dataStart: z.dataStart!, googleEventId: wydarzenia.find((e) => e.zlecenieId === z.id)?.id ?? z.googleEventId }, (z.ekipa ?? []).map((o) => imie(ust, o)).join(', '));
          if (id !== z.googleEventId) await zmien('zlecenia', z.id, { googleEventId: id }, { bezCofania: true, bezHistorii: true });
        }
        setGoogle(await pobierzWydarzenia(ust.google.kalendarzId, dni[0], dni[dni.length - 1]));
      }
      komunikat('Kalendarz zsynchronizowany.');
    } catch (e) { komunikat((e as Error).message, 'blad'); } finally { setCzeka(false); }
  };
  const lista = mapa.get(wybrany) ?? [];
  const zajeci = (d: string) => new Set((mapa.get(d) ?? []).filter((p) => p.rodzaj === 'zlecenie').flatMap((p) => p.ekipa ?? []));

  return (
    <>
      <Naglowek tytul="Kalendarz" akcje={<>
        <Przycisk maly onClick={() => setNoweZadanie(true)}>+ Zadanie</Przycisk>
        {googleSkonfigurowany && <Przycisk maly wariant="glowny" disabled={czeka} onClick={synchronizuj}>{czeka ? 'Synchronizuję…' : 'Synchronizuj z Google'}</Przycisk>}
      </>} />
      <div className="mb-3 flex items-center justify-between gap-2">
        <Przycisk maly onClick={() => przesun(-1)} aria-label="Poprzedni miesiąc">‹</Przycisk>
        <button type="button" className="min-h-9 flex-1 text-center text-lg font-semibold capitalize" onClick={() => { setMiesiac(dzis().slice(0, 7)); setWybrany(dzis()); }}>{fmtMiesiac(miesiac)}</button>
        <Przycisk maly onClick={() => przesun(1)} aria-label="Następny miesiąc">›</Przycisk>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-przygasz">{['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'].map((d) => <div key={d} className="py-1">{d}</div>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {dni.map((d) => {
          const p = mapa.get(d) ?? [], z = zajeci(d);
          return (
            <button key={d} type="button" onClick={() => setWybrany(d)} aria-pressed={wybrany === d} aria-label={`${fmtData(d)}, pozycji: ${p.length}`}
              className={kl('flex min-h-16 flex-col rounded-xl border p-1 text-left sm:min-h-24', wybrany === d ? 'border-akcent bg-akcent-tlo' : 'border-linia bg-karta', !d.startsWith(miesiac) && 'opacity-45')}>
              <span className={kl('liczby text-sm', d === dzis() && 'grid h-6 w-6 place-items-center rounded-full bg-akcent font-semibold text-na-akcencie')}>{Number(d.slice(8))}</span>
              <span className="mt-0.5 hidden flex-1 space-y-0.5 overflow-hidden sm:block">{p.slice(0, 3).map((x, i) => <span key={i} className={kl('block truncate rounded px-1 text-[11px]', KOLORY[x.rodzaj])}>{x.tekst}</span>)}{p.length > 3 && <span className="block text-[11px] text-przygasz">+{p.length - 3}</span>}</span>
              <span className="mt-auto flex gap-0.5 sm:hidden">{p.slice(0, 4).map((x, i) => <span key={i} className={kl('h-1.5 w-1.5 rounded-full', x.rodzaj === 'zlecenie' ? 'bg-akcent' : x.rodzaj === 'zadanie' ? 'bg-uwaga' : x.rodzaj === 'oferta' ? 'bg-zle' : 'bg-przygasz')} />)}</span>
              {z.size > 0 && <span className="mt-0.5 text-[10px] leading-none text-przygasz">{[...z].map((o) => imie(ust, o as 'wlasciciel')[0]).join('·')}</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-przygasz">Litery w dniach = kto jest zajęty na realizacji ({imie(ust, 'wlasciciel')[0]} – {imie(ust, 'wlasciciel')}, {imie(ust, 'wspolnik')[0]} – {imie(ust, 'wspolnik')}).</p>
      <Karta className="mt-4" tytul={fmtData(wybrany)}>
        {lista.length === 0 ? <p className="text-sm text-przygasz">Nic zaplanowanego. Obie osoby są wolne.</p> : (
          <ul className="divide-y divide-linia">{lista.map((p, i) => {
            const tresc = <><span className="flex-1 truncate">{p.tekst}</span>{p.ekipa?.length ? <span className="text-xs text-przygasz">{p.ekipa.map((o) => imie(ust, o as 'wlasciciel')).join(', ')}</span> : null}<Znaczek ton={p.rodzaj === 'zlecenie' ? 'akcent' : p.rodzaj === 'zadanie' ? 'uwaga' : p.rodzaj === 'oferta' ? 'zle' : 'szary'}>{{ zlecenie: 'Realizacja', zadanie: 'Zadanie', oferta: 'Oferta', google: 'Google' }[p.rodzaj]}</Znaczek></>;
            return <li key={i}>{p.do ? <Link to={p.do} className="flex min-h-11 items-center gap-3">{tresc}</Link> : <div className="flex min-h-11 items-center gap-3">{tresc}</div>}</li>;
          })}</ul>
        )}
      </Karta>
      {!googleSkonfigurowany && <p className="mt-3 text-sm text-przygasz">Kalendarz Google nie jest podłączony (brak VITE_GOOGLE_CLIENT_ID – instrukcja w README). Zlecenia, zadania i przypomnienia o ofertach działają bez niego.</p>}
      {noweZadanie && <FormularzZadania poczatkowe={{ termin: wybrany }} onClose={() => setNoweZadanie(false)} />}
    </>
  );
}
