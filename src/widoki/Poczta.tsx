import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { akcja, dodaj, usun, zmien } from '../db/baza';
import { useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { googleSkonfigurowany, pobierzWiadomosci, type Wiadomosc } from '../google/google';
import { dzis, fmtData } from '../lib/kwoty';
import { wyciagnijLokalnie } from '../lib/wyciaganie';
import type { Klient, Zapytanie } from '../lib/typy';
import { Karta, Naglowek, Obszar, Okno, pasuje, PasekListy, Pole, Przycisk, Pusto, usePytanie, useUsuwanie, Wybor, Znaczek, type StanListy } from '../ui/komponenty';
import { FormularzKlienta } from './formularze';

export default function Poczta() {
  const ust = useUst();
  const nav = useNavigate();
  const pytaj = usePytanie();
  const usuwanie = useUsuwanie();
  const zapytania = useTabela('zapytania');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'nowe' });
  const [nowe, setNowe] = useState<{ od: string; temat: string; tresc: string; zrodlo: Zapytanie['zrodlo'] } | null>(null);
  const [zGmaila, setZGmaila] = useState<Wiadomosc[] | null>(null);
  const [czeka, setCzeka] = useState(false);
  const [wynik, setWynik] = useState<{ ok: boolean; pusto: boolean; zapytanie: string; tekst: string } | null>(null);
  const [otwarte, setOtwarte] = useState<string | null>(null);
  const [klient, setKlient] = useState<{ dane: Partial<Klient>; zapytanieId: string } | null>(null);

  const lista = zapytania.filter((z) => stan.filtr === 'wszystkie' || z.status === stan.filtr).filter((z) => pasuje(stan.szukaj, z.od, z.temat, z.tresc))
    .sort((a, b) => (stan.sort === 'nadawca' ? a.od.localeCompare(b.od, 'pl') : b.data.localeCompare(a.data) || b.utworzono - a.utworzono));
  const CALA_SKRZYNKA = 'in:inbox newer_than:14d';
  const pobierz = async (zapytanie: string = ust.google.zapytanie) => {
    setCzeka(true);
    setWynik(null);
    try {
      const znane = new Set(zapytania.map((z) => z.gmailId).filter(Boolean));
      const wszystkie = await pobierzWiadomosci(zapytanie);
      const w = wszystkie.filter((m) => !znane.has(m.id));
      setZGmaila(w);
      setWynik({ ok: true, pusto: w.length === 0, zapytanie,
        tekst: w.length ? `Znaleziono ${w.length} nowych wiadomości (filtr: ${zapytanie}).`
          : wszystkie.length ? `Wszystkie ${wszystkie.length} wiadomości z tego filtra są już dodane jako zapytania.`
          : `Połączenie z Gmailem działa, ale filtr „${zapytanie}” nie pasuje do żadnej wiadomości.` });
    } catch (e) { setWynik({ ok: false, pusto: false, zapytanie, tekst: (e as Error).message }); } finally { setCzeka(false); }
  };
  const importuj = async (wiadomosci: Wiadomosc[]) => {
    await akcja('Zaimportowano zapytania', async () => { for (const m of wiadomosci) await dodaj('zapytania', { data: m.data, zrodlo: 'mail', od: m.od, temat: m.temat, tresc: m.tresc.slice(0, 20000), status: 'nowe', klientId: null, ofertaId: null, gmailId: m.id }); });
    setZGmaila(null);
    komunikat(`Dodano zapytania: ${wiadomosci.length}.`, 'ok', true);
  };
  const dodajKlienta = (z: Zapytanie) => {
    const d = wyciagnijLokalnie(`Od: ${z.od}\n${z.tresc}`);
    setKlient({ zapytanieId: z.id, dane: { nazwa: d.klient || z.od.replace(/<.*>/, '').replace(/"/g, '').trim(), telefon: d.telefon, email: d.email || (/<([^>]+)>/.exec(z.od)?.[1] ?? ''), adres: d.adres, zrodlo: z.zrodlo === 'mail' ? 'Strona www' : '', notatki: '' } });
  };

  return (
    <>
      <Naglowek tytul="Zapytania i poczta" akcje={<>
        <Przycisk maly onClick={() => setNowe({ od: '', temat: '', tresc: '', zrodlo: 'ręczne' })}>+ Wklej wiadomość</Przycisk>
        {googleSkonfigurowany && <Przycisk maly wariant="glowny" disabled={czeka} onClick={() => pobierz()}>{czeka ? 'Pobieram…' : 'Pobierz z Gmaila'}</Przycisk>}
      </>} />
      {!googleSkonfigurowany && <p className="mb-3 rounded-xl border border-linia bg-karta px-3 py-2 text-sm text-przygasz">Gmail nie jest podłączony (brak VITE_GOOGLE_CLIENT_ID – instrukcja w README). Możesz wklejać wiadomości ręcznie – oferta wypełni się tak samo.</p>}
      {googleSkonfigurowany && <p className="mb-3 text-xs text-przygasz">Filtr Gmaila: <code>{ust.google.zapytanie}</code> (zmienisz w Ustawieniach → Integracje). Aplikacja tylko czyta wiadomości; wysyłka zawsze wymaga potwierdzenia.</p>}

      {wynik && (
        <div role="status" className={`mb-3 rounded-xl border px-3 py-2 text-sm ${wynik.ok ? 'border-linia bg-karta' : 'border-zle/40 bg-zle/10 text-zle'}`}>
          <p>{wynik.ok ? wynik.tekst : `Nie udało się pobrać poczty: ${wynik.tekst}`}</p>
          {wynik.ok && wynik.pusto && wynik.zapytanie !== CALA_SKRZYNKA && <>
            <p className="mt-1 text-przygasz">Oznacz maile od klientów w Gmailu etykietą „zapytania” albo przeszukaj całą skrzynkę odbiorczą.</p>
            <Przycisk maly className="mt-2" disabled={czeka} onClick={() => pobierz(CALA_SKRZYNKA)}>Pokaż skrzynkę odbiorczą z 14 dni</Przycisk>
          </>}
          {!wynik.ok && <p className="mt-1">Jeśli okno Google się nie otworzyło, zezwól tej stronie na wyskakujące okienka i spróbuj ponownie.</p>}
        </div>
      )}

      {zGmaila && zGmaila.length > 0 && (
        <Karta className="mb-4" tytul={`Nowe w Gmailu (${zGmaila.length})`} akcje={<Przycisk maly wariant="glowny" onClick={() => importuj(zGmaila)}>Dodaj wszystkie</Przycisk>}>
          <ul className="divide-y divide-linia">{zGmaila.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2"><div className="min-w-0 flex-1"><div className="truncate font-medium">{m.temat || '(bez tematu)'}</div><div className="truncate text-sm text-przygasz">{m.od} · {fmtData(m.data)}</div></div><Przycisk maly onClick={() => importuj([m]).then(() => setZGmaila((l) => l?.filter((x) => x.id !== m.id) ?? null))}>Dodaj</Przycisk></li>))}
          </ul>
        </Karta>
      )}

      <PasekListy stan={stan} onChange={setStan} filtry={[{ w: 'nowe', e: 'Nowe' }, { w: 'obsłużone', e: 'Obsłużone' }, { w: 'wszystkie', e: 'Wszystkie' }]} sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'nadawca', e: 'Wg nadawcy' }]} />
      {lista.length === 0 ? <Pusto tytul={zapytania.length ? 'Nic nie pasuje do filtrów' : 'Brak zapytań'} opis="Wklej maila lub SMS-a od klienta albo pobierz wiadomości z wybranej etykiety Gmaila. Z zapytania jednym przyciskiem zrobisz ofertę." /> : (
        <ul className="space-y-2">{lista.map((z) => (
          <li key={z.id} className="rounded-2xl border border-linia bg-karta p-3.5">
            <button type="button" className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={otwarte === z.id} onClick={() => setOtwarte(otwarte === z.id ? null : z.id)}>
              <div className="min-w-0"><div className="truncate font-semibold">{z.temat || z.tresc.slice(0, 50) || '(pusta wiadomość)'}</div><div className="truncate text-sm text-przygasz">{z.od || 'nieznany nadawca'} · {fmtData(z.data)} · {z.zrodlo}</div></div>
              <Znaczek ton={z.status === 'nowe' ? 'uwaga' : 'dobrze'}>{z.status}</Znaczek>
            </button>
            {otwarte === z.id && <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-wglebienie p-3 text-sm">{z.tresc}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {z.ofertaId ? <Przycisk maly onClick={() => nav(`/oferty/${z.ofertaId}`)}>Otwórz ofertę</Przycisk> : <Przycisk maly wariant="glowny" onClick={() => nav(`/oferty/nowa?zapytanie=${z.id}`)}>Utwórz ofertę</Przycisk>}
              {!z.klientId && <Przycisk maly onClick={() => dodajKlienta(z)}>Dodaj klienta</Przycisk>}
              <Przycisk maly wariant="cichy" onClick={() => zmien('zapytania', z.id, { status: z.status === 'nowe' ? 'obsłużone' : 'nowe' }, { etykieta: 'Zmieniono status zapytania' })}>{z.status === 'nowe' ? 'Oznacz jako obsłużone' : 'Przywróć jako nowe'}</Przycisk>
              <Przycisk maly wariant="grozny" onClick={() => usuwanie('zapytanie', () => usun('zapytania', z.id))}>Usuń</Przycisk>
            </div>
          </li>))}
        </ul>
      )}

      {nowe && (
        <Okno tytul="Nowe zapytanie" onClose={() => setNowe(null)} stopka={<><Przycisk onClick={() => setNowe(null)}>Anuluj</Przycisk>
          <Przycisk wariant="glowny" onClick={async () => {
            if (!nowe.tresc.trim()) { komunikat('Wklej treść wiadomości.', 'blad'); return; }
            const id = await dodaj('zapytania', { data: dzis(), ...nowe, status: 'nowe', klientId: null, ofertaId: null, gmailId: null }, { etykieta: 'Dodano zapytanie' });
            setNowe(null);
            if (await pytaj({ tytul: 'Zapytanie zapisane', tresc: 'Utworzyć od razu ofertę z tej wiadomości?', tak: 'Utwórz ofertę', grozne: false })) nav(`/oferty/nowa?zapytanie=${id}`);
          }}>Zapisz</Przycisk></>}>
          <div className="grid grid-cols-2 gap-2"><Pole etykieta="Od kogo" value={nowe.od} onChange={(v) => setNowe({ ...nowe, od: v })} /><Wybor etykieta="Źródło" value={nowe.zrodlo} opcje={['ręczne', 'mail', 'sms'] as const} onChange={(v) => setNowe({ ...nowe, zrodlo: v })} /></div>
          <Pole etykieta="Temat (opcjonalnie)" value={nowe.temat} onChange={(v) => setNowe({ ...nowe, temat: v })} />
          <Obszar etykieta="Treść wiadomości" wiersze={8} value={nowe.tresc} onChange={(v) => setNowe({ ...nowe, tresc: v })} />
        </Okno>
      )}
      {klient && <FormularzKlienta poczatkowe={klient.dane} onClose={() => setKlient(null)} onZapisano={(id) => void zmien('zapytania', klient.zapytanieId, { klientId: id }, { bezCofania: true })} />}
    </>
  );
}
