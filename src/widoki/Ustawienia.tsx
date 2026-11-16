import { useEffect, useState } from 'react';
import { db, zmienUstawienia } from '../db/baza';
import { wczytajDemo } from '../db/demo';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { eksportCSV, eksportJSON, eksportXLSX, importJSON, KOLUMNY, pobierzPlik } from '../db/kopie';
import { komunikat, ustawMotyw, ustawSesje, useMotyw, useSesja } from '../db/sesja';
import { listaKopii, pobierzKopie, rpc, supabase, synchronizuj, wyloguj } from '../db/sync';
import { googleSkonfigurowany, rozlacz } from '../google/google';
import { CENNIK, OPISY_UPRAWNIEN, SZABLONY, ZUZYCIE } from '../lib/domyslne';
import { fmtCzas } from '../lib/kwoty';
import { NAZWY_TABEL, STAWKI_VAT, TABELE, type PozycjaCennika, type Tabela, type Uprawnienia, type Ustawienia as Ust, type Vat } from '../lib/typy';
import { Naglowek, Obszar, Pole, PoleLiczba, Przelacznik, Przycisk, Segmenty, usePytanie, Wybor } from '../ui/komponenty';

function Sekcja({ tytul, opis, children, otwarta }: { tytul: string; opis?: string; children: React.ReactNode; otwarta?: boolean }) {
  return (
    <details open={otwarta} className="group rounded-2xl border border-linia bg-karta">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-2">
        <span><span className="block font-semibold">{tytul}</span>{opis && <span className="block text-sm text-przygasz">{opis}</span>}</span>
        <span aria-hidden className="text-przygasz transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 border-t border-linia px-4 py-4">{children}</div>
    </details>
  );
}

const TEKSTY_SZABLONOW: [string, string][] = [['oferta_wstep', 'Oferta – wstęp'], ['oferta_warunki', 'Oferta – warunki (każda linia to punkt)'], ['oferta_stopka', 'Oferta – zakończenie'], ['umowa', 'Umowa o dzieło'], ['protokol', 'Protokół odbioru'], ['pielegnacja', 'Instrukcja pielęgnacji'], ['zaliczka', 'Potwierdzenie zaliczki'], ['proforma', 'Proforma']];

export default function Ustawienia() {
  const zapisane = useUst();
  const kto = useKto();
  const sesja = useSesja()!;
  const motyw = useMotyw();
  const pytaj = usePytanie();
  const historia = useTabela('historia');
  const [u, setU] = useState<Ust>(zapisane);
  const [brudne, setBrudne] = useState(false);
  const [czlonkowie, setCzlonkowie] = useState<{ czlonkowie: { email: string; rola: string }[]; zaproszenia: string[] } | null>(null);
  const [zaproszenie, setZaproszenie] = useState('');
  const [kopie, setKopie] = useState<string[] | null>(null);
  const [system, setSystem] = useState(Object.keys(zapisane.zuzycie ?? {})[0] ?? '');
  const [szablon, setSzablon] = useState('oferta_warunki');
  const wl = kto === 'wlasciciel';
  const chmura = sesja.tryb === 'chmura';
  useEffect(() => { if (!brudne) setU(zapisane); }, [zapisane, brudne]);
  useEffect(() => { if (chmura && navigator.onLine) { rpc<typeof czlonkowie>('lista_czlonkow').then(setCzlonkowie).catch(() => undefined); if (wl) listaKopii().then(setKopie).catch(() => undefined); } }, [chmura, wl]);

  const ustaw = <K extends keyof Ust>(pole: K, w: Ust[K]) => { setU((s) => ({ ...s, [pole]: w })); setBrudne(true); };
  const zapisz = async () => {
    const { id, _ts, _zm, _brudne, utworzono, utworzyl, zmienil, usuniety, ...dane } = u;
    await zmienUstawienia(dane);
    setBrudne(false);
    komunikat('Zapisano ustawienia.', 'ok', true);
  };
  const cennik = (i: number, zm: Partial<PozycjaCennika>) => ustaw('cennik', u.cennik.map((p, j) => (j === i ? { ...p, ...zm } : p)));
  const warstwy = u.zuzycie?.[system] ?? [];
  const warstwa = (i: number, zm: object) => ustaw('zuzycie', { ...u.zuzycie, [system]: warstwy.map((w, j) => (j === i ? { ...w, ...zm } : w)) });
  const wczytajLogo = (f?: File) => { if (!f) return; if (f.size > 400_000) { komunikat('Logo jest za duże (maks. 400 kB). Zmniejsz obraz.', 'blad'); return; } const r = new FileReader(); r.onload = () => ustaw('firma', { ...u.firma, logo: r.result as string }); r.readAsDataURL(f); };
  const importuj = async (f?: File) => {
    if (!f) return;
    try {
      const w = await importJSON(JSON.parse(await f.text()));
      await pytaj({ tytul: w.stary ? 'Zaimportowano kopię ze starego prototypu' : 'Zaimportowano kopię', grozne: false, tak: 'OK',
        tresc: <div className="space-y-1"><p>Dodano lub zaktualizowano rekordów: <strong>{w.dodano}</strong>, pominięto (już były): {w.pominieto}.</p>
          {w.liczniki && <p>W pliku: zlecenia {w.liczniki.zlecenia}, koszty {w.liczniki.koszty}, godziny {w.liczniki.godziny}, oferty {w.liczniki.oferty}, klienci {w.liczniki.klienci}.</p>}
          {w.ostrzezenia.length > 0 && <><p className="font-medium text-uwaga">Do sprawdzenia:</p><ul className="list-disc pl-5">{w.ostrzezenia.map((o, i) => <li key={i}>{o}</li>)}</ul></>}</div> });
      setBrudne(false);
    } catch (e) { komunikat(e instanceof SyntaxError ? 'Ten plik nie jest poprawnym plikiem JSON.' : (e as Error).message, 'blad'); }
  };
  const wyczysc = async () => {
    if (!(await pytaj({ tytul: 'Usunąć WSZYSTKIE dane?', tresc: `Trwale usuwa wszystkie dane z tego urządzenia${chmura ? ' i z chmury (także u wspólnika)' : ''}. Tej operacji nie da się cofnąć – najpierw pobierz kopię JSON.`, tak: 'Usuń wszystko' }))) return;
    if (!(await pytaj({ tytul: 'Na pewno?', tresc: 'To ostatnie potwierdzenie.', tak: 'Tak, usuń wszystko' }))) return;
    try {
      if (chmura) await rpc('usun_wszystkie_dane');
      for (const t of TABELE) await db().table(t).clear();
      await db().bloby.clear(); await db().meta.clear();
      komunikat('Usunięto wszystkie dane.');
    } catch (e) { komunikat((e as Error).message, 'blad'); }
  };

  return (
    <>
      <Naglowek tytul="Ustawienia" akcje={wl && brudne && <><Przycisk onClick={() => { setU(zapisane); setBrudne(false); }}>Odrzuć</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz zmiany</Przycisk></>} />
      {!wl && <p className="mb-3 rounded-xl border border-linia bg-karta px-3 py-2 text-sm text-przygasz">Ustawienia firmy zmienia właściciel. Tutaj możesz zmienić wygląd aplikacji i się wylogować.</p>}
      <div className="space-y-3">
        <Sekcja tytul="Wygląd" opis="Motyw jasny lub ciemny" otwarta={!wl}>
          <Segmenty etykieta="Motyw" value={motyw} onChange={ustawMotyw} opcje={[{ w: 'auto', e: 'Jak w systemie' }, { w: 'jasny', e: 'Jasny' }, { w: 'ciemny', e: 'Ciemny' }]} />
        </Sekcja>

        {wl && <>
          <Sekcja tytul="Dane firmy" opis="Trafiają do ofert i dokumentów">
            <div className="grid gap-2 sm:grid-cols-2">
              <Pole etykieta="Nazwa" value={u.firma.nazwa} onChange={(v) => ustaw('firma', { ...u.firma, nazwa: v })} />
              <Pole etykieta="NIP" value={u.firma.nip} onChange={(v) => ustaw('firma', { ...u.firma, nip: v })} />
              <Pole klasa="sm:col-span-2" etykieta="Adres" value={u.firma.adres} onChange={(v) => ustaw('firma', { ...u.firma, adres: v })} podpowiedz="Używany też do liczenia odległości w kalkulatorze dojazdów" />
              <Pole etykieta="Telefon" type="tel" value={u.firma.telefon} onChange={(v) => ustaw('firma', { ...u.firma, telefon: v })} />
              <Pole etykieta="E-mail" type="email" value={u.firma.email} onChange={(v) => ustaw('firma', { ...u.firma, email: v })} />
              <Pole etykieta="Strona www" value={u.firma.www} onChange={(v) => ustaw('firma', { ...u.firma, www: v })} />
              <Pole etykieta="Rachunek bankowy" value={u.firma.konto} onChange={(v) => ustaw('firma', { ...u.firma, konto: v })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {u.firma.logo ? <img src={u.firma.logo} alt="Logo firmy" className="h-14 rounded border border-linia bg-white p-1" /> : <span className="text-sm text-przygasz">Brak logo – w dokumentach pojawi się nazwa firmy.</span>}
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-linia px-4 font-medium">Wgraj logo (PNG/JPG)<input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => wczytajLogo(e.target.files?.[0])} /></label>
              {u.firma.logo && <Przycisk wariant="cichy" onClick={() => ustaw('firma', { ...u.firma, logo: null })}>Usuń logo</Przycisk>}
            </div>
          </Sekcja>

          <Sekcja tytul="Wspólnicy i uprawnienia" opis="Imiona, konta i to, co widzi wspólnik">
            <div className="grid grid-cols-2 gap-2">
              <Pole etykieta="Właściciel – imię" value={u.ludzie.wlasciciel.imie} onChange={(v) => ustaw('ludzie', { ...u.ludzie, wlasciciel: { imie: v } })} />
              <Pole etykieta="Wspólnik – imię" value={u.ludzie.wspolnik.imie} onChange={(v) => ustaw('ludzie', { ...u.ludzie, wspolnik: { imie: v } })} />
            </div>
            <div className="rounded-xl border border-linia px-3 py-1">
              {(Object.keys(OPISY_UPRAWNIEN) as (keyof Uprawnienia)[]).map((k) => <Przelacznik key={k} etykieta={OPISY_UPRAWNIEN[k]} value={u.uprawnienia[k]} onChange={(v) => ustaw('uprawnienia', { ...u.uprawnienia, [k]: v })} />)}
            </div>
            <p className="text-xs text-przygasz">Wspólnik zawsze widzi i edytuje swoje godziny, zadania oraz zlecenia, na których pracuje (bez kwot). Pozostałe dane odblokowujesz powyżej. {chmura ? 'Ograniczenia egzekwuje serwer – ukryte dane nie trafiają na telefon wspólnika.' : 'W trybie lokalnym to tylko podgląd widoku wspólnika na tym urządzeniu.'}</p>
            {chmura && <div className="rounded-xl bg-wglebienie p-3">
              <div className="mb-1 text-sm font-medium">Konta</div>
              {czlonkowie ? <ul className="text-sm">{czlonkowie.czlonkowie.map((c) => <li key={c.email}>{c.email} – {c.rola === 'wlasciciel' ? 'Właściciel' : 'Wspólnik'}</li>)}{czlonkowie.zaproszenia.map((z) => <li key={z} className="text-przygasz">{z} – zaproszenie czeka</li>)}</ul> : <p className="text-sm text-przygasz">Lista kont dostępna po połączeniu z siecią.</p>}
              {!czlonkowie?.czlonkowie.some((c) => c.rola === 'wspolnik') && <div className="mt-2 flex flex-wrap items-end gap-2">
                <Pole klasa="min-w-[12rem] flex-1" etykieta="Zaproś wspólnika (e-mail)" type="email" value={zaproszenie} onChange={setZaproszenie} />
                <Przycisk onClick={async () => { try { await rpc('zapros_wspolnika', { p_email: zaproszenie }); setZaproszenie(''); setCzlonkowie(await rpc('lista_czlonkow')); komunikat('Zaproszenie zapisane. Wspólnik zakłada konto na ten adres i loguje się.'); } catch (e) { komunikat((e as Error).message, 'blad'); } }}>Zaproś</Przycisk>
              </div>}
              {czlonkowie?.czlonkowie.some((c) => c.rola === 'wspolnik') && <Przycisk maly wariant="grozny" className="mt-2" onClick={async () => { if (await pytaj({ tytul: 'Odebrać dostęp wspólnikowi?', tresc: 'Konto wspólnika straci dostęp do danych firmy. Dane zostają.', tak: 'Odbierz dostęp' })) { await rpc('usun_wspolnika'); setCzlonkowie(await rpc('lista_czlonkow')); } }}>Odbierz dostęp wspólnikowi</Przycisk>}
            </div>}
          </Sekcja>

          <Sekcja tytul="Rozliczenie i VAT" opis="Podział zysku, stawka pomocnika, domyślne stawki">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <PoleLiczba etykieta="Procent dla „Klient od”" jedn="%" min={0} value={u.udzial} onChange={(v) => ustaw('udzial', Math.min(100, v ?? 0))} podpowiedz={`Druga osoba: ${100 - u.udzial}%`} />
              <PoleLiczba etykieta="Stawka pomocnika" jedn="zł/h" min={0} value={u.stawka} onChange={(v) => ustaw('stawka', v ?? 0)} />
              <Wybor etykieta="VAT zleceń" value={u.vatZlecen} opcje={STAWKI_VAT.map((v) => ({ w: v, e: `${v}%` }))} onChange={(v) => ustaw('vatZlecen', v as Vat)} />
              <Wybor etykieta="VAT kosztów" value={u.vatKosztow} opcje={STAWKI_VAT.map((v) => ({ w: v, e: `${v}%` }))} onChange={(v) => ustaw('vatKosztow', v as Vat)} />
              <Wybor etykieta="VAT ofert" value={u.vatOfert} opcje={[{ w: 8 as Vat, e: '8%' }, { w: 23 as Vat, e: '23%' }]} onChange={(v) => ustaw('vatOfert', v)} />
              <PoleLiczba etykieta="Zaliczka w ofercie" jedn="%" min={0} value={u.zaliczka} onChange={(v) => ustaw('zaliczka', v ?? 0)} />
              <PoleLiczba etykieta="Ważność oferty" jedn="dni" min={0} value={u.waznosc} onChange={(v) => ustaw('waznosc', v ?? 0)} />
            </div>
          </Sekcja>

          <Sekcja tytul="Szacunek podatku i ZUS" opis="Opcjonalny moduł w widoku Rozliczenie">
            <Przelacznik etykieta="Pokazuj szacunek w Rozliczeniu" value={u.podatki.wlaczone} onChange={(v) => ustaw('podatki', { ...u.podatki, wlaczone: v })} />
            <div className="grid grid-cols-3 gap-2">
              <PoleLiczba etykieta="Podatek" jedn="%" min={0} value={u.podatki.podatekProc} onChange={(v) => ustaw('podatki', { ...u.podatki, podatekProc: v ?? 0 })} />
              <PoleLiczba etykieta="Składka zdrowotna" jedn="%" min={0} value={u.podatki.zdrowotnaProc} onChange={(v) => ustaw('podatki', { ...u.podatki, zdrowotnaProc: v ?? 0 })} />
              <PoleLiczba etykieta="ZUS miesięcznie" jedn="zł" min={0} value={u.podatki.zusMies} onChange={(v) => ustaw('podatki', { ...u.podatki, zusMies: v ?? 0 })} />
            </div>
            <p className="text-xs text-przygasz">Stawki zmieniają się co roku i zależą od formy opodatkowania, dlatego nie są wpisane na stałe – podaj wartości od księgowej. Wynik jest tylko orientacyjny.</p>
          </Sekcja>

          <Sekcja tytul="Cennik" opis="Kopiowany do każdej nowej oferty">
            <div className="space-y-2">
              {u.cennik.map((p, i) => (
                <div key={p.klucz} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-linia p-2 sm:grid-cols-[1fr_5rem_6.5rem_6.5rem_2.75rem]">
                  <Pole klasa="col-span-2 sm:col-span-1" etykieta="Pozycja" value={p.nazwa} onChange={(v) => cennik(i, { nazwa: v })} />
                  <Pole etykieta="Jedn." value={p.jedn} onChange={(v) => cennik(i, { jedn: v })} />
                  <PoleLiczba etykieta="Cena netto" jedn="zł" min={0} value={p.cena} onChange={(v) => cennik(i, { cena: v ?? 0 })} />
                  <PoleLiczba etykieta={p.altEtykieta ? `Cena: ${p.altEtykieta}` : 'Cena wariantu'} jedn="zł" min={0} value={p.cenaAlt ?? null} onChange={(v) => cennik(i, { cenaAlt: v, altEtykieta: p.altEtykieta || 'wariant' })} />
                  <button type="button" aria-label={`Usuń pozycję ${p.nazwa}`} className="grid h-11 w-11 place-items-center rounded-xl text-przygasz hover:bg-wglebienie" onClick={async () => { if (await pytaj({ tytul: `Usunąć „${p.nazwa}” z cennika?`, tresc: 'Istniejące oferty zachowają tę pozycję.' })) ustaw('cennik', u.cennik.filter((_, j) => j !== i)); }}>✕</button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Przycisk maly onClick={() => ustaw('cennik', [...u.cennik, { klucz: 'c' + Date.now(), nazwa: 'Nowa pozycja', jedn: 'm²', cena: 0, grupa: 'główne' }])}>+ Pozycja</Przycisk>
              <Przycisk maly wariant="cichy" onClick={async () => { if (await pytaj({ tytul: 'Przywrócić cennik domyślny?', tresc: 'Twoje zmiany w cenniku zostaną zastąpione.', tak: 'Przywróć' })) ustaw('cennik', structuredClone(CENNIK)); }}>Przywróć domyślny</Przycisk>
            </div>
          </Sekcja>

          <Sekcja tytul="Szablony dokumentów" opis="Teksty ofert, umowy, protokołu i instrukcji">
            <Wybor etykieta="Szablon" value={szablon} opcje={TEKSTY_SZABLONOW.map(([w, e]) => ({ w, e }))} onChange={setSzablon} />
            <Obszar etykieta="Treść" wiersze={12} value={u.szablony[szablon] ?? ''} onChange={(v) => ustaw('szablony', { ...u.szablony, [szablon]: v })}
              podpowiedz="Zmienne w podwójnych klamrach wstawią się same, np. {{klient}}, {{adres}}, {{data}}, {{system}}, {{dni}}, {{start}}, {{zaliczka}}, {{vat}}, {{waznosc}}, {{waznaDo}}, {{zakres}}, {{netto}}, {{brutto}}, {{kwota}}, {{firma}}, {{nip}}." />
            <Przycisk maly wariant="cichy" onClick={() => ustaw('szablony', { ...u.szablony, [szablon]: SZABLONY[szablon] })}>Przywróć tekst domyślny</Przycisk>
          </Sekcja>

          <Sekcja tytul="Kalkulator dojazdów" opis="Wartości domyślne (zapamiętują się też po każdym wyliczeniu)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PoleLiczba etykieta="Spalanie" jedn="l/100" min={0} value={u.dojazd.spalanie} onChange={(v) => ustaw('dojazd', { ...u.dojazd, spalanie: v ?? 0 })} />
              <PoleLiczba etykieta="Cena paliwa" jedn="zł/l" min={0} value={u.dojazd.cenaPaliwa} onChange={(v) => ustaw('dojazd', { ...u.dojazd, cenaPaliwa: v ?? 0 })} />
              <PoleLiczba etykieta="Eksploatacja" jedn="zł/km" min={0} value={u.dojazd.zlKm} onChange={(v) => ustaw('dojazd', { ...u.dojazd, zlKm: v ?? 0 })} />
              <Wybor etykieta="VAT" value={u.dojazd.vat} opcje={STAWKI_VAT.map((v) => ({ w: v, e: `${v}%` }))} onChange={(v) => ustaw('dojazd', { ...u.dojazd, vat: v as Vat })} />
            </div>
          </Sekcja>

          <Sekcja tytul="Zużycie materiałów" opis="Parametry kalkulatora dla każdego systemu Festfloor">
            <Wybor etykieta="System" value={system} opcje={Object.keys(u.zuzycie ?? {})} onChange={setSystem} />
            {warstwy.map((w, i) => (
              <div key={i} className="grid grid-cols-2 items-end gap-2 rounded-xl border border-linia p-2 sm:grid-cols-[1fr_6rem_5rem_5rem_6rem_2.75rem]">
                <Pole klasa="col-span-2 sm:col-span-1" etykieta="Warstwa / produkt" value={w.nazwa} onChange={(v) => warstwa(i, { nazwa: v })} />
                <PoleLiczba etykieta="Zużycie/m²" min={0} value={w.zuzycie} onChange={(v) => warstwa(i, { zuzycie: v ?? 0 })} />
                <PoleLiczba etykieta="Warstwy" min={0} value={w.warstwy} onChange={(v) => warstwa(i, { warstwy: v ?? 0 })} />
                <Pole etykieta="Jedn." value={w.jedn} onChange={(v) => warstwa(i, { jedn: v })} />
                <PoleLiczba etykieta="Opakowanie" min={0} value={w.opakowanie} onChange={(v) => warstwa(i, { opakowanie: v ?? 0 })} />
                <button type="button" aria-label={`Usuń warstwę ${w.nazwa}`} className="grid h-11 w-11 place-items-center rounded-xl text-przygasz hover:bg-wglebienie" onClick={() => ustaw('zuzycie', { ...u.zuzycie, [system]: warstwy.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Przycisk maly onClick={() => ustaw('zuzycie', { ...u.zuzycie, [system]: [...warstwy, { nazwa: 'Nowa warstwa', zuzycie: 0, warstwy: 1, jedn: 'kg', opakowanie: 1 }] })}>+ Warstwa</Przycisk>
              <Przycisk maly wariant="cichy" onClick={() => ustaw('zuzycie', { ...u.zuzycie, [system]: structuredClone(ZUZYCIE[system] ?? []) })}>Przywróć domyślne</Przycisk>
            </div>
            <p className="text-xs text-przygasz">Wartości startowe są orientacyjne. Wpisz zużycia z kart technicznych producenta dla swoich zestawów.</p>
          </Sekcja>

          <Sekcja tytul="Integracje" opis="Gmail, Kalendarz Google, model językowy">
            <p className="text-sm">Google: {googleSkonfigurowany ? <strong className="text-dobrze">skonfigurowane</strong> : <span className="text-przygasz">nieskonfigurowane (VITE_GOOGLE_CLIENT_ID – patrz README)</span>}</p>
            <Pole etykieta="Filtr wiadomości Gmail" value={u.google.zapytanie} onChange={(v) => ustaw('google', { ...u.google, zapytanie: v })} podpowiedz="Składnia wyszukiwarki Gmaila, np. label:zapytania albo from:(formularz@mojastrona.pl OR biuro@partner.pl)" />
            <Pole etykieta="Identyfikator kalendarza" value={u.google.kalendarzId} onChange={(v) => ustaw('google', { ...u.google, kalendarzId: v })} podpowiedz="primary = kalendarz główny. Wspólny kalendarz firmy: wklej jego identyfikator z ustawień Kalendarza Google." />
            {googleSkonfigurowany && <Przycisk maly onClick={() => { rozlacz(); komunikat('Odłączono konto Google na tym urządzeniu.'); }}>Odłącz konto Google</Przycisk>}
            <p className="text-xs text-przygasz">Aplikacja prosi tylko o: odczyt poczty, wysyłkę wiadomości i wydarzenia kalendarza. Każda wysyłka i każdy zapis w kalendarzu wymaga Twojego potwierdzenia. Wypełnianie ofert modelem językowym działa po wdrożeniu funkcji „wyciagnij-dane” (README); bez niej działa prostszy parser offline.</p>
          </Sekcja>

          <Sekcja tytul="Kopie zapasowe i eksport" opis="JSON, XLSX, CSV, import ze starego prototypu">
            <div className="flex flex-wrap gap-2">
              <Przycisk wariant="glowny" onClick={() => eksportJSON(true)}>Pobierz kopię (JSON)</Przycisk>
              <Przycisk onClick={() => eksportXLSX()}>Eksport wszystkich tabel (XLSX)</Przycisk>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-linia bg-karta px-4 font-medium">Wczytaj kopię (JSON)<input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void importuj(e.target.files?.[0]); e.target.value = ''; }} /></label>
            </div>
            <p className="text-xs text-przygasz">Import rozpoznaje zarówno kopie z tej aplikacji, jak i plik ze starego prototypu. Niczego nie kasuje – dane są dopisywane i scalane, a ponowny import tego samego pliku nie tworzy duplikatów.</p>
            <div><div className="mb-1 text-sm font-medium">Pojedyncze tabele do CSV</div><div className="flex flex-wrap gap-2">{(Object.keys(KOLUMNY) as Tabela[]).map((t) => <Przycisk key={t} maly onClick={() => eksportCSV(t)}>{NAZWY_TABEL[t]}</Przycisk>)}</div></div>
            {chmura && <div><div className="mb-1 text-sm font-medium">Automatyczne kopie w chmurze (raz na dobę)</div>
              {!kopie ? <p className="text-sm text-przygasz">Lista dostępna po połączeniu z siecią.</p> : kopie.length === 0 ? <p className="text-sm text-przygasz">Pierwsza kopia powstanie po najbliższej synchronizacji.</p> : <div className="flex flex-wrap gap-2">{kopie.slice(0, 10).map((k) => <Przycisk key={k} maly onClick={async () => { const b = await pobierzKopie(k); if (b) pobierzPlik(`beskid-floor-kopia-${k}`, b); }}>{k.replace('.json', '')}</Przycisk>)}</div>}</div>}
            <div className="flex flex-wrap gap-2 border-t border-linia pt-3">
              <Przycisk maly onClick={async () => { if (await pytaj({ tytul: 'Wczytać dane demo?', tresc: 'Do bazy zostaną dopisane przykładowe zlecenia, koszty, godziny i oferty. Można to cofnąć od razu po wczytaniu.', tak: 'Wczytaj', grozne: false })) { await wczytajDemo(); komunikat('Wczytano dane demo.', 'ok', true); } }}>Wczytaj dane demo</Przycisk>
              <Przycisk maly wariant="grozny" onClick={wyczysc}>Usuń wszystkie dane…</Przycisk>
            </div>
          </Sekcja>

          <Sekcja tytul="Historia zmian" opis="Kto, kiedy i co zmienił">
            {historia.length === 0 ? <p className="text-sm text-przygasz">Brak wpisów.</p> : <ul className="max-h-96 divide-y divide-linia overflow-y-auto text-sm">{[...historia].sort((a, b) => b.kiedy - a.kiedy).slice(0, 150).map((h) => (
              <li key={h.id} className="py-1.5"><span className="text-przygasz">{fmtCzas(h.kiedy)}</span> · <strong>{imie(zapisane, h.kto)}</strong> {h.akcja} · {NAZWY_TABEL[h.tabela as Tabela] ?? h.tabela}{h.etykieta ? `: ${h.etykieta}` : ''}{h.akcja === 'zmieniono' && Object.keys(h.zmiany ?? {}).length ? <span className="text-przygasz"> ({Object.keys(h.zmiany).join(', ')})</span> : null}</li>))}</ul>}
          </Sekcja>
        </>}

        <Sekcja tytul="Konto" opis={chmura ? sesja.email : 'Tryb lokalny – dane tylko na tym urządzeniu'}>
          <p className="text-sm text-przygasz">Zalogowano jako: <strong className="text-tekst">{imie(zapisane, kto)}</strong> ({wl ? 'Właściciel' : 'Wspólnik'}). {chmura ? 'Dane synchronizują się szyfrowanym połączeniem i są dostępne tylko dla kont tej firmy.' : supabase ? 'Zaloguj się kontem, aby włączyć synchronizację.' : 'Synchronizacja włączy się po skonfigurowaniu Supabase (README).'}</p>
          <div className="flex flex-wrap gap-2">
            {chmura && <Przycisk onClick={() => synchronizuj()}>Synchronizuj teraz</Przycisk>}
            <Przycisk onClick={async () => { if (chmura) await wyloguj(); ustawSesje(null); }}>{chmura ? 'Wyloguj' : 'Zmień profil'}</Przycisk>
          </div>
        </Sekcja>
      </div>
    </>
  );
}
