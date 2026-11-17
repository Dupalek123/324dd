// Formularze dodawania i edycji używane w wielu widokach.
import { useEffect, useMemo, useState } from 'react';
import { akcja, dodaj, nowyId, usun, zapiszBlob, zmien, zmienUstawienia } from '../db/baza';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { pobierzBlob } from '../db/sync';
import { dzis, fmtIlosc, nettoZBrutto, zl as fmtZl } from '../lib/kwoty';
import { odlegloscKm, zmniejszObraz } from '../lib/obraz';
import { kalkulatorDojazdu, kwotaZCenyM2, rozksieguj } from '../lib/obliczenia';
import {
  KATEGORIE, OSOBY, STATUSY_ZLECEN, SYSTEMY, TYPY_PRAC, ZRODLA, type Klient, type Koszt, type OsobaId, type Vat,
  type WpisGodzin, type Zadanie, type Zlecenie,
} from '../lib/typy';
import { OdczytParagonu } from './OdczytParagonu';
import { Etykieta, Obszar, Okno, PolaKwoty, Pole, PoleLiczba, Przelacznik, Przycisk, Segmenty, useForm, useUsuwanie, Wiersz, Wybor } from '../ui/komponenty';

const BRAK = '__brak__';

export function useOpcjeZlecen(zPustym: string | null = '— bez zlecenia —') {
  const zlecenia = useTabela('zlecenia');
  return useMemo(() => {
    const o = [...zlecenia].sort((a, b) => (b.dataStart ?? '').localeCompare(a.dataStart ?? '')).map((z) => ({ w: z.id, e: `${z.klient}${z.adres ? ' · ' + z.adres.split(',')[0] : ''}${z.status === 'Zakończone' ? ' (zakończone)' : ''}` }));
    return zPustym === null ? o : [{ w: BRAK, e: zPustym }, ...o];
  }, [zlecenia, zPustym]);
}

// ---------- Zlecenie ----------
export function FormularzZlecenia({ zlecenie, poczatkowe, onClose, onZapisano }: { zlecenie?: Zlecenie; poczatkowe?: Partial<Zlecenie>; onClose: () => void; onZapisano?: (id: string) => void }) {
  const ust = useUst();
  const kto = useKto();
  const klienci = useTabela('klienci');
  const wspolnik = kto === 'wspolnik';
  const [w, ustaw, wiele] = useForm<Partial<Zlecenie>>({
    klient: '', telefon: '', adres: '', opis: '', system: SYSTEMY[0], typPrac: TYPY_PRAC[0], m2: null, cenaM2: null, vat: ust.vatZlecen, netto: 0, brutto: 0,
    status: 'Zaakceptowane', dataStart: null, dataKoniec: null, klientOd: kto, tryb: 'razem', udzial: null, stawka: null, ekipa: ['wlasciciel', 'wspolnik'], notatki: '', klientId: null,
    ...poczatkowe, ...zlecenie,
  });
  const [blad, setBlad] = useState<string | null>(null);
  const zCeny = (m2: number | null, cena: number | null, vat: Vat) => { if (m2 && cena) wiele({ m2, cenaM2: cena, vat, ...kwotaZCenyM2(m2, cena, vat) }); else wiele({ m2, cenaM2: cena, vat }); };
  const wybierzKlienta = (nazwa: string) => {
    const k = klienci.find((x) => x.nazwa === nazwa);
    if (k) wiele({ klient: nazwa, klientId: k.id, telefon: w.telefon || k.telefon, adres: w.adres || k.adres }); else wiele({ klient: nazwa, klientId: null });
  };
  const zapisz = async () => {
    if (!wspolnik && !w.klient?.trim()) { setBlad('Podaj nazwę klienta.'); return; }
    if (w.dataStart && w.dataKoniec && w.dataKoniec < w.dataStart) { setBlad('Data końca nie może być wcześniejsza niż data startu.'); return; }
    const dane = wspolnik ? { status: w.status, notatki: w.notatki } : w;
    let id = zlecenie?.id;
    if (id) await zmien('zlecenia', id, dane, { etykieta: 'Zapisano zlecenie' }); else id = await dodaj('zlecenia', dane, { etykieta: 'Dodano zlecenie' });
    komunikat(zlecenie ? 'Zapisano zlecenie.' : 'Dodano zlecenie.', 'ok', true);
    onZapisano?.(id);
    onClose();
  };
  return (
    <Okno tytul={zlecenie ? 'Edycja zlecenia' : 'Nowe zlecenie'} onClose={onClose} stopka={<><Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      {!wspolnik && <>
        <Etykieta etykieta="Klient" blad={blad && !w.klient?.trim() ? blad : null}>
          <input list="lista-klientow" value={w.klient ?? ''} onChange={(e) => wybierzKlienta(e.target.value)} autoFocus={!zlecenie}
            className="w-full min-h-11 rounded-xl border border-linia bg-karta px-3 py-2 focus:border-akcent focus:outline-none focus:ring-2 focus:ring-akcent/30" />
          <datalist id="lista-klientow">{klienci.map((k) => <option key={k.id} value={k.nazwa} />)}</datalist>
        </Etykieta>
        <div className="grid grid-cols-2 gap-2">
          <Pole etykieta="Telefon" type="tel" value={w.telefon ?? ''} onChange={(v) => ustaw('telefon', v)} />
          <Wybor etykieta="Typ prac" value={w.typPrac ?? 'Inne'} opcje={TYPY_PRAC} onChange={(v) => ustaw('typPrac', v)} />
        </div>
        <Pole etykieta="Adres realizacji" value={w.adres ?? ''} onChange={(v) => ustaw('adres', v)} />
        <Obszar etykieta="Opis" value={w.opis ?? ''} onChange={(v) => ustaw('opis', v)} wiersze={2} />
        <div className="grid grid-cols-3 gap-2">
          <Wybor etykieta="System Festfloor" value={w.system ?? ''} opcje={[...SYSTEMY, ...(w.system && !(SYSTEMY as readonly string[]).includes(w.system) ? [w.system] : [])]} onChange={(v) => ustaw('system', v)} />
          <PoleLiczba etykieta="Powierzchnia" jedn="m²" min={0} value={w.m2} onChange={(v) => zCeny(v, w.cenaM2 ?? null, w.vat!)} />
          <PoleLiczba etykieta="Cena brutto/m²" jedn="zł" min={0} value={w.cenaM2} onChange={(v) => zCeny(w.m2 ?? null, v, w.vat!)} podpowiedz="Wylicza kwotę" />
        </div>
        <PolaKwoty netto={w.netto ?? 0} brutto={w.brutto ?? 0} vat={w.vat ?? 8} onChange={(k) => wiele(k)} />
      </>}
      <div className="grid grid-cols-3 gap-2">
        <Wybor etykieta="Status" value={w.status ?? 'Oferta'} opcje={STATUSY_ZLECEN} onChange={(v) => ustaw('status', v)} />
        {!wspolnik && <>
          <Pole etykieta="Start" type="date" value={w.dataStart ?? ''} onChange={(v) => ustaw('dataStart', v || null)} />
          <Pole etykieta="Koniec" type="date" value={w.dataKoniec ?? ''} onChange={(v) => ustaw('dataKoniec', v || null)} blad={blad && w.klient?.trim() ? blad : null} />
        </>}
      </div>
      {!wspolnik && <>
        <div className="grid grid-cols-2 gap-2">
          <Wybor etykieta="Klient od" value={w.klientOd ?? 'wlasciciel'} opcje={OSOBY.map((o) => ({ w: o, e: imie(ust, o) }))} onChange={(v) => ustaw('klientOd', v)} podpowiedz="Kto załatwił klienta" />
          <Wybor etykieta="Tryb rozliczenia" value={w.tryb ?? 'razem'} opcje={[{ w: 'razem', e: 'Razem (podział %)' }, { w: 'godz', e: 'Sam + pomoc godzinowa' }]} onChange={(v) => ustaw('tryb', v as 'razem' | 'godz')} />
        </div>
        {w.tryb === 'razem'
          ? <PoleLiczba etykieta={`Procent dla osoby „Klient od” (${imie(ust, w.klientOd)})`} jedn="%" min={0} value={w.udzial} placeholder={`${ust.udzial} (z ustawień)`} onChange={(v) => ustaw('udzial', v === null ? null : Math.min(100, v))} podpowiedz="Puste = wartość z ustawień" />
          : <PoleLiczba etykieta="Stawka pomocnika" jedn="zł/h" min={0} value={w.stawka} placeholder={`${ust.stawka} (z ustawień)`} onChange={(v) => ustaw('stawka', v)} podpowiedz="Puste = stawka domyślna z ustawień" />}
        <Przelacznik etykieta={`${imie(ust, 'wspolnik')} pracuje na tym zleceniu`} opis="Wspólnik widzi tylko zlecenia, na których pracuje." value={(w.ekipa ?? []).includes('wspolnik')}
          onChange={(v) => ustaw('ekipa', v ? ['wlasciciel', 'wspolnik'] : ['wlasciciel'])} />
      </>}
      <Obszar etykieta="Notatki" value={w.notatki ?? ''} onChange={(v) => ustaw('notatki', v)} wiersze={2} />
    </Okno>
  );
}

// ---------- Koszt ----------
export function FormularzKosztu({ koszt, zlecenieId, onClose }: { koszt?: Koszt; zlecenieId?: string | null; onClose: () => void }) {
  const ust = useUst();
  const zlecenia = useTabela('zlecenia');
  const opcje = useOpcjeZlecen('— koszt ogólny firmy —');
  const usuwanie = useUsuwanie();
  const [w, ustaw, wiele] = useForm<Partial<Koszt>>({
    data: dzis(), zlecenieId: zlecenieId ?? null, ogolny: !zlecenieId, kategoria: 'Materiał', opis: '', dostawca: '', vat: ust.vatKosztow, netto: 0, brutto: 0, plikId: null, dojazd: null, rozdzial: null, ...koszt,
  });
  const [metoda, setMetoda] = useState<'brak' | 'rowno' | 'przychod'>(koszt?.rozdzial?.length ? 'rowno' : 'brak');
  const [wybrane, setWybrane] = useState<string[]>(koszt?.rozdzial?.map((r) => r.zlecenieId) ?? []);
  const [plik, setPlik] = useState<Blob | null>(null);
  const [plikNr, setPlikNr] = useState(0);
  const [podglad, setPodglad] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    (async () => { const b = plik ?? (w.plikId ? await pobierzBlob(w.plikId) : null); if (b) { url = URL.createObjectURL(b); setPodglad(url); } else setPodglad(null); })();
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [plik, w.plikId]);
  const kandydaci = zlecenia.filter((z) => z.status !== 'Oferta');
  const rozdzial = w.zlecenieId || metoda === 'brak' ? null : rozksieguj(w.netto ?? 0, kandydaci.filter((z) => wybrane.includes(z.id)), metoda);
  const zapisz = async () => {
    if (!w.opis?.trim() && !w.netto) { setBlad('Podaj opis albo kwotę.'); return; }
    if (!w.data) { setBlad('Podaj datę.'); return; }
    await akcja(koszt ? 'Zapisano koszt' : 'Dodano koszt', async () => {
      let plikId = w.plikId ?? null;
      const id = koszt?.id ?? nowyId();
      if (plik) {
        plikId = nowyId();
        await zapiszBlob(plikId, plik);
        await dodaj('pliki', { id: plikId, rodzaj: 'paragon', zlecenieId: w.zlecenieId ?? null, kosztId: id, nazwa: 'paragon.jpg', typ: plik.type, rozmiar: plik.size });
      }
      const dane = { ...w, plikId, ogolny: !w.zlecenieId, rozdzial: rozdzial?.length ? rozdzial : null };
      if (koszt) await zmien('koszty', id, dane); else await dodaj('koszty', { ...dane, id });
    });
    komunikat(koszt ? 'Zapisano koszt.' : 'Dodano koszt.', 'ok', true);
    onClose();
  };
  return (
    <Okno tytul={koszt ? 'Edycja kosztu' : 'Nowy koszt'} onClose={onClose} stopka={<>
      {koszt && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('koszt', () => usun('koszty', koszt.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <Etykieta etykieta="Zdjęcie paragonu / faktury" podpowiedz="Zrób zdjęcie z bliska, na płasko, przy dobrym świetle – cały paragon w kadrze. Dane odczytają się same.">
        <input type="file" accept="image/*,application/pdf" capture="environment" className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-linia file:bg-karta file:px-4 file:text-tekst"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setPlik(await zmniejszObraz(f, 2000, 0.85)); setPlikNr((n) => n + 1); } }} />
      </Etykieta>
      {(plik || w.plikId) && <OdczytParagonu klucz={plikNr} auto={plikNr > 0} domyslnyVat={ust.vatKosztow} zrodlo={async () => plik ?? (w.plikId ? pobierzBlob(w.plikId) : null)}
        onUzyj={(r) => wiele({ ...(r.data ? { data: r.data } : {}), ...(r.dostawca ? { dostawca: r.dostawca } : {}), ...(r.opis ? { opis: r.opis } : {}), ...(r.kategoria ? { kategoria: r.kategoria } : {}), netto: r.netto, brutto: r.brutto, vat: r.vat })} />}
      {podglad && <a href={podglad} target="_blank" rel="noreferrer"><img src={podglad} alt="Paragon" className="max-h-48 rounded-xl border border-linia" /></a>}
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Data" type="date" value={w.data ?? ''} onChange={(v) => ustaw('data', v)} />
        <Wybor etykieta="Kategoria" value={w.kategoria ?? 'Inne'} opcje={KATEGORIE} onChange={(v) => ustaw('kategoria', v)} />
      </div>
      <Wybor etykieta="Zlecenie" value={w.zlecenieId ?? BRAK} opcje={opcje} onChange={(v) => wiele({ zlecenieId: v === BRAK ? null : v, ogolny: v === BRAK })} />
      <Pole etykieta="Opis" value={w.opis ?? ''} onChange={(v) => ustaw('opis', v)} blad={blad} />
      <Pole etykieta="Dostawca" value={w.dostawca ?? ''} onChange={(v) => ustaw('dostawca', v)} />
      <PolaKwoty netto={w.netto ?? 0} brutto={w.brutto ?? 0} vat={w.vat ?? 23} onChange={(k) => wiele(k)} />
      {w.dojazd && <p className="text-sm text-przygasz">Dojazd: {fmtIlosc(w.dojazd.km)} km, {fmtIlosc(w.dojazd.litry)} l. Parametry zmienisz w kalkulatorze dojazdów.</p>}
      {!w.zlecenieId && (
        <div className="rounded-xl border border-linia p-3">
          <div className="mb-2 text-sm font-medium">Rozksięgowanie na zlecenia</div>
          <Segmenty etykieta="Metoda" value={metoda} onChange={setMetoda} opcje={[{ w: 'brak', e: 'Nie rozdzielaj' }, { w: 'rowno', e: 'Po równo' }, { w: 'przychod', e: 'Wg przychodu' }]} />
          {metoda !== 'brak' && (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">
              {kandydaci.length === 0 && <p className="text-sm text-przygasz">Brak zleceń do wyboru.</p>}
              {kandydaci.map((z) => (
                <label key={z.id} className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="h-5 w-5 accent-[var(--akcent)]" checked={wybrane.includes(z.id)} onChange={(e) => setWybrane((l) => (e.target.checked ? [...l, z.id] : l.filter((x) => x !== z.id)))} />
                  <span className="flex-1 truncate">{z.klient}</span>
                  <span className="liczby text-przygasz">{fmtZl(rozdzial?.find((r) => r.zlecenieId === z.id)?.netto ?? 0)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Okno>
  );
}

// ---------- Godziny ----------
export function FormularzGodzin({ wpis, poczatkowe, onClose }: { wpis?: WpisGodzin; poczatkowe?: Partial<WpisGodzin>; onClose: () => void }) {
  const ust = useUst();
  const kto = useKto();
  const opcje = useOpcjeZlecen();
  const usuwanie = useUsuwanie();
  const [w, ustaw] = useForm<Partial<WpisGodzin>>({ data: dzis(), osoba: kto, zlecenieId: null, godziny: 8, opis: '', ...poczatkowe, ...wpis });
  const [blad, setBlad] = useState<string | null>(null);
  const zapisz = async () => {
    if (!w.godziny || w.godziny <= 0) { setBlad('Podaj liczbę godzin większą od zera.'); return; }
    if (w.godziny > 24) { setBlad('Doba ma tylko 24 godziny.'); return; }
    if (!w.data) { setBlad('Podaj datę.'); return; }
    if (wpis) await zmien('godziny', wpis.id, w, { etykieta: 'Zapisano godziny' }); else await dodaj('godziny', w, { etykieta: 'Dodano godziny' });
    komunikat(wpis ? 'Zapisano godziny.' : 'Dodano godziny.', 'ok', true);
    onClose();
  };
  return (
    <Okno tytul={wpis ? 'Edycja godzin' : 'Nowe godziny'} onClose={onClose} stopka={<>
      {wpis && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('wpis godzin', () => usun('godziny', wpis.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Data" type="date" value={w.data ?? ''} onChange={(v) => ustaw('data', v)} />
        {kto === 'wlasciciel'
          ? <Wybor etykieta="Osoba" value={w.osoba ?? 'wlasciciel'} opcje={OSOBY.map((o) => ({ w: o, e: imie(ust, o) }))} onChange={(v) => ustaw('osoba', v as OsobaId)} />
          : <Etykieta etykieta="Osoba"><div className="flex min-h-11 items-center px-1">{imie(ust, 'wspolnik')}</div></Etykieta>}
      </div>
      <Wybor etykieta="Zlecenie" value={w.zlecenieId ?? BRAK} opcje={opcje} onChange={(v) => ustaw('zlecenieId', v === BRAK ? null : v)} />
      <PoleLiczba etykieta="Godziny" jedn="h" krok={0.25} min={0} value={w.godziny} onChange={(v) => ustaw('godziny', v ?? 0)} blad={blad} podpowiedz="Kroki co 0,25 h" />
      <div className="flex flex-wrap gap-2">{[4, 6, 8, 10].map((h) => <Przycisk key={h} maly onClick={() => ustaw('godziny', h)}>{h} h</Przycisk>)}
        <Przycisk maly onClick={() => ustaw('godziny', Math.max(0, (w.godziny ?? 0) - 0.25))}>− 0,25</Przycisk><Przycisk maly onClick={() => ustaw('godziny', (w.godziny ?? 0) + 0.25)}>+ 0,25</Przycisk></div>
      <Obszar etykieta="Opis prac" value={w.opis ?? ''} onChange={(v) => ustaw('opis', v)} wiersze={2} />
    </Okno>
  );
}

// ---------- Dojazd ----------
export function KalkulatorDojazdu({ koszt, zlecenieId, onClose }: { koszt?: Koszt; zlecenieId?: string | null; onClose: () => void }) {
  const ust = useUst();
  const kto = useKto();
  const zlecenia = useTabela('zlecenia');
  const opcje = useOpcjeZlecen();
  const usuwanie = useUsuwanie();
  const d = koszt?.dojazd;
  const [w, ustaw] = useForm({
    data: koszt?.data ?? dzis(), zlecenieId: koszt?.zlecenieId ?? zlecenieId ?? null, dni: d?.dni || 1, kmJednaStrona: d?.kmJednaStrona || 0, tamIPowrot: d?.tamIPowrot ?? true,
    spalanie: d?.spalanie ?? ust.dojazd.spalanie, cenaPaliwa: d?.cenaPaliwa ?? ust.dojazd.cenaPaliwa, zlKm: d?.zlKm ?? ust.dojazd.zlKm, vat: (koszt?.vat ?? ust.dojazd.vat) as Vat,
  });
  const [czeka, setCzeka] = useState(false);
  const wynik = kalkulatorDojazdu(w);
  const zlecenie = zlecenia.find((z) => z.id === w.zlecenieId);
  const zMapy = async () => {
    if (!ust.firma.adres || !zlecenie?.adres) { komunikat('Uzupełnij adres firmy (Ustawienia) i adres realizacji zlecenia.', 'blad'); return; }
    setCzeka(true);
    try { ustaw('kmJednaStrona', await odlegloscKm(ust.firma.adres, zlecenie.adres)); } catch (e) { komunikat((e as Error).message || 'Nie udało się pobrać trasy.', 'blad'); } finally { setCzeka(false); }
  };
  const zapisz = async () => {
    if (wynik.km <= 0) { komunikat('Podaj liczbę dni i kilometrów.', 'blad'); return; }
    const dane: Partial<Koszt> = {
      data: w.data, zlecenieId: w.zlecenieId, ogolny: !w.zlecenieId, kategoria: 'Transport', dostawca: koszt?.dostawca ?? '', vat: w.vat,
      opis: `Dojazdy: ${fmtIlosc(w.dni)} dni × ${fmtIlosc(w.kmJednaStrona)} km${w.tamIPowrot ? ' (tam i z powrotem)' : ''}`,
      brutto: wynik.razem, netto: nettoZBrutto(wynik.razem, w.vat),
      dojazd: { dni: w.dni, kmJednaStrona: w.kmJednaStrona, tamIPowrot: w.tamIPowrot, spalanie: w.spalanie, cenaPaliwa: w.cenaPaliwa, zlKm: w.zlKm, km: wynik.km, litry: wynik.litry },
    };
    await akcja('Zapisano dojazd', async () => {
      if (koszt) await zmien('koszty', koszt.id, dane); else await dodaj('koszty', dane);
      // spalanie, cena paliwa i zł/km są pamiętane jako domyślne
      if (kto === 'wlasciciel' && (w.spalanie !== ust.dojazd.spalanie || w.cenaPaliwa !== ust.dojazd.cenaPaliwa || w.zlKm !== ust.dojazd.zlKm || w.vat !== ust.dojazd.vat))
        await zmienUstawienia({ dojazd: { spalanie: w.spalanie, cenaPaliwa: w.cenaPaliwa, zlKm: w.zlKm, vat: w.vat } });
    });
    komunikat('Zapisano dojazd jako koszt (Transport).', 'ok', true);
    onClose();
  };
  return (
    <Okno tytul={koszt ? 'Edycja dojazdu' : 'Kalkulator dojazdu'} onClose={onClose} stopka={<>
      {koszt && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('dojazd', () => usun('koszty', koszt.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz jako koszt</Przycisk></>}>
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Data" type="date" value={w.data} onChange={(v) => ustaw('data', v)} />
        <Wybor etykieta="Zlecenie" value={w.zlecenieId ?? BRAK} opcje={opcje} onChange={(v) => ustaw('zlecenieId', v === BRAK ? null : v)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PoleLiczba etykieta="Dni dojazdu" min={0} value={w.dni} onChange={(v) => ustaw('dni', v ?? 0)} />
        <PoleLiczba etykieta="Km w jedną stronę" jedn="km" min={0} value={w.kmJednaStrona} onChange={(v) => ustaw('kmJednaStrona', v ?? 0)} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Przelacznik etykieta="Tam i z powrotem" value={w.tamIPowrot} onChange={(v) => ustaw('tamIPowrot', v)} />
        <Przycisk maly disabled={czeka || !zlecenie} onClick={zMapy}>{czeka ? 'Pobieram…' : 'Odległość z mapy'}</Przycisk>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PoleLiczba etykieta="Spalanie" jedn="l/100" min={0} value={w.spalanie} onChange={(v) => ustaw('spalanie', v ?? 0)} />
        <PoleLiczba etykieta="Cena paliwa" jedn="zł/l" min={0} value={w.cenaPaliwa} onChange={(v) => ustaw('cenaPaliwa', v ?? 0)} />
        <PoleLiczba etykieta="Eksploatacja" jedn="zł/km" min={0} value={w.zlKm} onChange={(v) => ustaw('zlKm', v ?? 0)} />
      </div>
      <div className="rounded-xl bg-wglebienie p-3">
        <Wiersz etykieta="Kilometry razem">{fmtIlosc(wynik.km)} km</Wiersz>
        <Wiersz etykieta="Paliwo">{fmtIlosc(wynik.litry)} l · {fmtZl(wynik.kosztPaliwa)}</Wiersz>
        {wynik.kosztEksploatacji > 0 && <Wiersz etykieta="Eksploatacja (opony, serwis, amortyzacja)">{fmtZl(wynik.kosztEksploatacji)}</Wiersz>}
        <Wiersz etykieta="Koszt brutto" mocny>{fmtZl(wynik.razem)}</Wiersz>
        <Wiersz etykieta={`Netto (VAT ${w.vat}%)`}>{fmtZl(nettoZBrutto(wynik.razem, w.vat))}</Wiersz>
      </div>
      <Wybor etykieta="VAT w cenie" value={w.vat} opcje={[23, 8, 5, 0].map((v) => ({ w: v as Vat, e: `${v}%` }))} onChange={(v) => ustaw('vat', v)}
        podpowiedz="Cena na stacji jest ceną brutto. Przy samochodzie używanym także prywatnie odlicza się zwykle tylko część VAT – ustal to z księgową." />
    </Okno>
  );
}

// ---------- Klient ----------
export function FormularzKlienta({ klient, poczatkowe, onClose, onZapisano }: { klient?: Klient; poczatkowe?: Partial<Klient>; onClose: () => void; onZapisano?: (id: string) => void }) {
  const [w, ustaw] = useForm<Partial<Klient>>({ nazwa: '', telefon: '', email: '', adres: '', zrodlo: '', notatki: '', ...poczatkowe, ...klient });
  const [blad, setBlad] = useState<string | null>(null);
  const zapisz = async () => {
    if (!w.nazwa?.trim()) { setBlad('Podaj imię i nazwisko albo nazwę.'); return; }
    if (w.email && !/^\S+@\S+\.\S+$/.test(w.email)) { setBlad('Adres e-mail wygląda na niepoprawny.'); return; }
    let id = klient?.id;
    if (id) await zmien('klienci', id, w, { etykieta: 'Zapisano klienta' }); else id = await dodaj('klienci', w, { etykieta: 'Dodano klienta' });
    komunikat(klient ? 'Zapisano klienta.' : 'Dodano klienta.', 'ok', true);
    onZapisano?.(id);
    onClose();
  };
  return (
    <Okno tytul={klient ? 'Edycja klienta' : 'Nowy klient'} onClose={onClose} stopka={<><Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <Pole etykieta="Imię i nazwisko / nazwa" value={w.nazwa ?? ''} onChange={(v) => ustaw('nazwa', v)} blad={blad} autoFocus={!klient} />
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Telefon" type="tel" value={w.telefon ?? ''} onChange={(v) => ustaw('telefon', v)} />
        <Pole etykieta="E-mail" type="email" value={w.email ?? ''} onChange={(v) => ustaw('email', v)} />
      </div>
      <Pole etykieta="Adres" value={w.adres ?? ''} onChange={(v) => ustaw('adres', v)} />
      <Etykieta etykieta="Źródło (skąd klient)">
        <input list="lista-zrodel" value={w.zrodlo ?? ''} onChange={(e) => ustaw('zrodlo', e.target.value)} className="w-full min-h-11 rounded-xl border border-linia bg-karta px-3 py-2 focus:border-akcent focus:outline-none focus:ring-2 focus:ring-akcent/30" />
        <datalist id="lista-zrodel">{ZRODLA.map((z) => <option key={z} value={z} />)}</datalist>
      </Etykieta>
      <Obszar etykieta="Notatki" value={w.notatki ?? ''} onChange={(v) => ustaw('notatki', v)} />
    </Okno>
  );
}

// ---------- Zadanie ----------
export function FormularzZadania({ zadanie, poczatkowe, onClose }: { zadanie?: Zadanie; poczatkowe?: Partial<Zadanie>; onClose: () => void }) {
  const ust = useUst();
  const kto = useKto();
  const opcje = useOpcjeZlecen();
  const usuwanie = useUsuwanie();
  const [w, ustaw] = useForm<Partial<Zadanie>>({ tytul: '', opis: '', termin: null, osoba: kto, zlecenieId: null, zrobione: false, ...poczatkowe, ...zadanie });
  const [blad, setBlad] = useState<string | null>(null);
  const zapisz = async () => {
    if (!w.tytul?.trim()) { setBlad('Wpisz, co jest do zrobienia.'); return; }
    if (zadanie) await zmien('zadania', zadanie.id, w, { etykieta: 'Zapisano zadanie' }); else await dodaj('zadania', w, { etykieta: 'Dodano zadanie' });
    onClose();
  };
  return (
    <Okno tytul={zadanie ? 'Edycja zadania' : 'Nowe zadanie'} onClose={onClose} stopka={<>
      {zadanie && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('zadanie', () => usun('zadania', zadanie.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <Pole etykieta="Co jest do zrobienia" value={w.tytul ?? ''} onChange={(v) => ustaw('tytul', v)} blad={blad} autoFocus={!zadanie} />
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Termin" type="date" value={w.termin ?? ''} onChange={(v) => ustaw('termin', v || null)} />
        <Wybor etykieta="Kto" value={w.osoba ?? BRAK} opcje={[{ w: BRAK, e: '— ktokolwiek —' }, ...OSOBY.map((o) => ({ w: o as string, e: imie(ust, o) }))]} onChange={(v) => ustaw('osoba', v === BRAK ? null : (v as OsobaId))} />
      </div>
      <Wybor etykieta="Zlecenie" value={w.zlecenieId ?? BRAK} opcje={opcje} onChange={(v) => ustaw('zlecenieId', v === BRAK ? null : v)} />
      <Obszar etykieta="Opis" value={w.opis ?? ''} onChange={(v) => ustaw('opis', v)} wiersze={2} />
    </Okno>
  );
}
