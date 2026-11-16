import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { akcja, dodaj, nowyId, usun, zmien } from '../db/baza';
import { useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { wyciagnijDane } from '../db/wyciaganie';
import { googleSkonfigurowany, wyslijMail } from '../google/google';
import { dodajDni, dzis, fmtData, fmtIlosc, zl } from '../lib/kwoty';
import { cenaPozycji, nastepnyNumer, podpowiedzDni, sumaOferty, zlecenieZOferty } from '../lib/obliczenia';
import { STATUSY_OFERT, SYSTEMY, type Oferta, type PozycjaOferty, type Vat } from '../lib/typy';
import type { DaneZWiadomosci } from '../lib/wyciaganie';
import { ofertaPdf } from '../pdf/dokumenty';
import { blobBase64, generujPdf, nazwaPliku, pobierzPdf, udostepnijPdf } from '../pdf/pdf';
import { Etykieta, Karta, Kwota, Naglowek, Obszar, Okno, Pole, PoleLiczba, Przelacznik, Przycisk, Pusto, usePytanie, useUsuwanie, Wiersz, Wybor } from '../ui/komponenty';

type Szkic = Omit<Oferta, '_ts' | '_zm' | 'utworzono' | 'utworzyl'>;

export default function FormularzOferty() {
  const { id = 'nowa' } = useParams();
  const [parametry] = useSearchParams();
  const nav = useNavigate();
  const ust = useUst();
  const kto = useKto();
  const pytaj = usePytanie();
  const usuwanie = useUsuwanie();
  const oferty = useTabela('oferty');
  const klienci = useTabela('klienci');
  const zapytania = useTabela('zapytania');
  const istniejaca = oferty.find((o) => o.id === id);
  const [o, setO] = useState<Szkic | null>(null);
  const [wiadomosc, setWiadomosc] = useState('');
  const [wyciagniete, setWyciagniete] = useState<DaneZWiadomosci | null>(null);
  const [czeka, setCzeka] = useState(false);
  const [panel, setPanel] = useState(false);
  const [dodatkowe, setDodatkowe] = useState(false);
  const [mail, setMail] = useState<{ do: string; temat: string; tresc: string } | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  // wczytanie istniejącej oferty albo przygotowanie nowej (cennik kopiowany z ustawień)
  useEffect(() => {
    if (o && (o.id === id || (id === 'nowa' && !istniejaca))) return;
    if (id !== 'nowa') { if (istniejaca) setO(structuredClone(istniejaca)); return; }
    const k = klienci.find((x) => x.id === parametry.get('klient'));
    const zap = zapytania.find((x) => x.id === parametry.get('zapytanie'));
    setO({
      id: nowyId(), nr: nastepnyNumer(oferty.map((x) => x.nr), new Date().getFullYear()), data: dzis(), klientId: k?.id ?? null, klient: k?.nazwa ?? '', telefon: k?.telefon ?? '', email: k?.email ?? '', adres: k?.adres ?? '',
      system: SYSTEMY[1], vat: ust.vatOfert, niestandardowe: false, pozycje: (ust.cennik ?? []).map((c) => ({ ...c, ilosc: null })), dni: null, startDni: 14, zaliczka: ust.zaliczka, waznosc: ust.waznosc, uwagi: '', status: 'robocza', wyslano: null, followUp: null, zlecenieId: null,
    });
    if (zap) { setWiadomosc(zap.tresc); setPanel(true); }
  }, [id, istniejaca?.id, oferty.length, ust.cennik?.length]); // eslint-disable-line

  // lista ofert wczytuje się asynchronicznie – jeśli numer nowej oferty okazał się zajęty, nadajemy kolejny
  useEffect(() => {
    if (o && !istniejaca && id === 'nowa' && oferty.some((x) => x.nr === o.nr)) setO({ ...o, nr: nastepnyNumer(oferty.map((x) => x.nr), new Date().getFullYear()) });
  }, [oferty.length, o?.nr]); // eslint-disable-line

  if (!o) return <><Naglowek tytul="Oferta" wstecz={() => nav('/oferty')} />{id !== 'nowa' && <Pusto tytul="Wczytywanie oferty…" opis="Jeśli to trwa, oferta mogła zostać usunięta." />}</>;
  const nowa = !istniejaca;
  const ustaw = <K extends keyof Szkic>(pole: K, w: Szkic[K]) => setO((s) => (s ? { ...s, [pole]: w } : s));
  const pozycja = (i: number, zm: Partial<PozycjaOferty>) => setO((s) => (s ? { ...s, pozycje: s.pozycje.map((p, j) => (j === i ? { ...p, ...zm } : p)) } : s));
  const s = sumaOferty(o);
  const stopnie = o.pozycje.find((p) => p.klucz === 'st')?.ilosc ?? 0;
  const podp = podpowiedzDni(s.m2, stopnie);

  const zapisz = async (zmiany: Partial<Szkic> = {}): Promise<Szkic | null> => {
    const dane = { ...o, ...zmiany };
    if (!dane.klient.trim()) { setBlad('Podaj nazwę klienta.'); window.scrollTo(0, 0); return null; }
    if (oferty.some((x) => x.id !== dane.id && x.nr === dane.nr)) { setBlad(`Numer ${dane.nr} jest już zajęty.`); window.scrollTo(0, 0); return null; }
    setBlad(null);
    if (dane.status === 'wysłana' && !dane.followUp) dane.followUp = dodajDni(dzis(), 3);
    await akcja(nowa ? 'Dodano ofertę' : 'Zapisano ofertę', async () => {
      // szybkie dodanie klienta do kartoteki
      if (!dane.klientId && (kto === 'wlasciciel' || ust.uprawnienia.klienci)) {
        const jest = klienci.find((k) => k.nazwa.trim().toLowerCase() === dane.klient.trim().toLowerCase());
        dane.klientId = jest?.id ?? await dodaj('klienci', { nazwa: dane.klient.trim(), telefon: dane.telefon, email: dane.email, adres: dane.adres, zrodlo: '', notatki: '' });
      }
      if (nowa) await dodaj('oferty', dane); else await zmien('oferty', dane.id, dane);
      const zap = parametry.get('zapytanie');
      if (nowa && zap) await zmien('zapytania', zap, { status: 'obsłużone', ofertaId: dane.id, klientId: dane.klientId });
    });
    setO(dane);
    if (nowa) nav(`/oferty/${dane.id}`, { replace: true });
    return dane;
  };

  const wyciagnij = async () => {
    if (!wiadomosc.trim()) { komunikat('Wklej treść wiadomości.', 'blad'); return; }
    setCzeka(true);
    try { setWyciagniete(await wyciagnijDane(wiadomosc)); } finally { setCzeka(false); }
  };
  const zastosuj = () => {
    const d = wyciagniete!;
    setO((x) => x && ({
      ...x, klient: d.klient || x.klient, telefon: d.telefon || x.telefon, email: d.email || x.email, adres: d.adres || x.adres,
      system: d.system || x.system, uwagi: [x.uwagi, d.uwagi].filter(Boolean).join('\n'),
      pozycje: x.pozycje.map((p) => (d.ilosci[p.klucz] ? { ...p, ilosc: d.ilosci[p.klucz] } : p)),
      dni: x.dni ?? (podpowiedzDni((d.ilosci.pos ?? 0) + (d.ilosci.sg ?? 0) + (d.ilosci.sm ?? 0) + (d.ilosci.ga ?? 0), d.ilosci.st ?? 0) || null),
    }));
    setWyciagniete(null); setPanel(false);
    komunikat('Wstawiono dane do formularza. Sprawdź je i zapisz ofertę.');
  };

  const pdf = async (tryb: 'pobierz' | 'udostepnij') => {
    const z = await zapisz();
    if (!z) return;
    try {
      if (tryb === 'pobierz') await pobierzPdf(ofertaPdf(z as Oferta, ust), `Oferta ${z.nr} ${z.klient}`);
      else await udostepnijPdf(ofertaPdf(z as Oferta, ust), `Oferta ${z.nr} ${z.klient}`, `Oferta ${z.nr} – ${ust.firma.nazwa}`);
    } catch (e) { komunikat('Nie udało się wygenerować PDF: ' + (e as Error).message, 'blad'); }
  };
  const otworzMail = async () => {
    const z = await zapisz();
    if (!z) return;
    setMail({ do: z.email, temat: `Oferta ${z.nr} – ${ust.firma.nazwa}`,
      tresc: `Dzień dobry,\n\nw załączniku przesyłam ofertę nr ${z.nr} na wykonanie powierzchni z mikrocementu${z.adres ? ` (${z.adres})` : ''}.\nWartość: ${zl(sumaOferty(z).brutto)} brutto. Oferta jest ważna do ${fmtData(dodajDni(z.data, z.waznosc))}.\n\nW razie pytań proszę o kontakt.\n\nPozdrawiam\n${ust.ludzie.wlasciciel.imie}\n${ust.firma.nazwa}${ust.firma.telefon ? '\ntel. ' + ust.firma.telefon : ''}` });
  };
  const oznaczWyslana = () => zapisz({ status: 'wysłana', wyslano: dzis(), followUp: dodajDni(dzis(), 3) });
  const wyslijGmailem = async () => {
    if (!mail || !/^\S+@\S+\.\S+$/.test(mail.do)) { komunikat('Podaj poprawny adres e-mail odbiorcy.', 'blad'); return; }
    if (!(await pytaj({ tytul: 'Wysłać ofertę z Twojego konta Gmail?', tresc: `Wiadomość z załącznikiem PDF zostanie wysłana na adres ${mail.do}.`, tak: 'Wyślij', grozne: false }))) return;
    setCzeka(true);
    try {
      const b = await generujPdf(ofertaPdf(o as Oferta, ust));
      await wyslijMail({ ...mail, zalacznik: { nazwa: nazwaPliku(`Oferta ${o.nr}`), base64: await blobBase64(b) } });
      await oznaczWyslana();
      setMail(null);
      komunikat('Oferta wysłana.');
    } catch (e) { komunikat((e as Error).message, 'blad'); } finally { setCzeka(false); }
  };
  const przezProgramPocztowy = async () => {
    if (!mail) return;
    await pobierzPdf(ofertaPdf(o as Oferta, ust), `Oferta ${o.nr} ${o.klient}`);
    location.href = `mailto:${encodeURIComponent(mail.do)}?subject=${encodeURIComponent(mail.temat)}&body=${encodeURIComponent(mail.tresc)}`;
    if (await pytaj({ tytul: 'Oznaczyć ofertę jako wysłaną?', tresc: 'PDF został pobrany – dołącz go do wiadomości w programie pocztowym.', tak: 'Oznacz jako wysłaną', grozne: false })) await oznaczWyslana();
    setMail(null);
  };
  const duplikuj = async () => {
    const kopia = { ...structuredClone(o), id: nowyId(), nr: nastepnyNumer(oferty.map((x) => x.nr), new Date().getFullYear()), data: dzis(), status: 'robocza' as const, wyslano: null, followUp: null, zlecenieId: null };
    await dodaj('oferty', kopia, { etykieta: 'Zduplikowano ofertę' });
    komunikat(`Utworzono kopię: ${kopia.nr}.`, 'ok', true);
    nav(`/oferty/${kopia.id}`);
  };
  const naZlecenie = async () => {
    const z = await zapisz({ status: 'zaakceptowana', followUp: null });
    if (!z) return;
    if (z.zlecenieId && !(await pytaj({ tytul: 'Ta oferta ma już zlecenie', tresc: 'Utworzyć kolejne zlecenie z tej samej oferty?', tak: 'Utwórz kolejne', grozne: false }))) { nav(`/zlecenia/${z.zlecenieId}`); return; }
    let zid = '';
    await akcja('Zamieniono ofertę na zlecenie', async () => {
      zid = await dodaj('zlecenia', { ...zlecenieZOferty(z as Oferta), klientId: z.klientId, dataStart: null, dataKoniec: null, klientOd: kto, tryb: 'razem', udzial: null, stawka: null, ekipa: ['wlasciciel', 'wspolnik'], notatki: '' });
      await zmien('oferty', z.id, { zlecenieId: zid });
    });
    komunikat('Utworzono zlecenie ze statusem „Zaakceptowane”.', 'ok', true);
    nav(`/zlecenia/${zid}`);
  };

  const wierszPozycji = (p: PozycjaOferty, i: number) => {
    const alt = p.altGlobalny ? o.niestandardowe : !!p.wariant;
    const cena = cenaPozycji(p, o.niestandardowe);
    return (
      <div key={p.klucz + i} className={`grid grid-cols-[1fr_5.5rem_6.5rem] items-end gap-2 rounded-xl px-2 py-2 sm:grid-cols-[1fr_6.5rem_7.5rem_7rem] ${p.ilosc ? 'bg-akcent-tlo/60' : ''}`}>
        <div className="min-w-0 self-center">
          <div className="text-[15px] font-medium leading-snug">{p.nazwa}</div>
          {p.cenaAlt != null && !p.altGlobalny && <label className="mt-1 flex items-center gap-2 text-sm text-przygasz"><input type="checkbox" className="h-5 w-5 accent-[var(--akcent)]" checked={!!p.wariant} onChange={(e) => pozycja(i, { wariant: e.target.checked })} />{p.altEtykieta}</label>}
          {p.grupa === 'własne' && <button type="button" className="mt-1 text-sm text-zle" onClick={() => setO((x) => x && ({ ...x, pozycje: x.pozycje.filter((_, j) => j !== i) }))}>Usuń pozycję</button>}
        </div>
        <PoleLiczba etykieta={`Ilość (${p.jedn})`} min={0} value={p.ilosc} onChange={(v) => pozycja(i, { ilosc: v })} />
        <PoleLiczba etykieta="Cena netto" jedn="zł" min={0} value={cena} onChange={(v) => pozycja(i, alt && p.cenaAlt != null ? { cenaAlt: v ?? 0 } : { cena: v ?? 0 })} />
        <div className="col-span-3 -mt-1 text-right text-sm sm:col-span-1 sm:mt-0 sm:self-center"><Kwota v={(p.ilosc ?? 0) * cena} /></div>
      </div>
    );
  };
  const zIndeksem = o.pozycje.map((p, i) => ({ p, i }));

  return (
    <>
      <Naglowek tytul={nowa ? 'Nowa oferta' : `Oferta ${o.nr}`} wstecz={() => nav('/oferty')} akcje={<Przycisk wariant="glowny" onClick={async () => { if (await zapisz()) komunikat('Zapisano ofertę.', 'ok', true); }}>Zapisz</Przycisk>} />
      {blad && <p role="alert" className="mb-3 rounded-xl border border-zle/40 bg-zle/10 px-3 py-2 text-sm text-zle">{blad}</p>}

      <Karta className="mb-4" tytul="Wypełnij z wiadomości" akcje={<Przycisk maly wariant="cichy" onClick={() => setPanel(!panel)} aria-expanded={panel}>{panel ? 'Zwiń' : 'Rozwiń'}</Przycisk>}>
        {!panel ? <p className="text-sm text-przygasz">Wklej maila lub SMS-a od klienta – dane klienta, adres i metraże wypełnią się same. Zawsze zobaczysz je do akceptacji.</p> : <>
          <Obszar etykieta="Treść wiadomości od klienta" value={wiadomosc} onChange={setWiadomosc} wiersze={6} />
          <div className="mt-2"><Przycisk onClick={wyciagnij} disabled={czeka}>{czeka ? 'Analizuję…' : 'Wyciągnij dane'}</Przycisk></div>
          {wyciagniete && (
            <div className="mt-3 rounded-xl border border-akcent/50 bg-akcent-tlo/50 p-3">
              <div className="mb-1 text-sm font-semibold">Znalezione dane – sprawdź przed wstawieniem {wyciagniete.zrodlo === 'lokalnie' && <span className="font-normal text-przygasz">(analiza uproszczona, bez modelu językowego)</span>}</div>
              <Wiersz etykieta="Klient">{wyciagniete.klient || '–'}</Wiersz>
              <Wiersz etykieta="Telefon">{wyciagniete.telefon || '–'}</Wiersz>
              <Wiersz etykieta="E-mail">{wyciagniete.email || '–'}</Wiersz>
              <Wiersz etykieta="Adres">{wyciagniete.adres || '–'}</Wiersz>
              <Wiersz etykieta="System">{wyciagniete.system || '–'}</Wiersz>
              {Object.entries(wyciagniete.ilosci).map(([k, v]) => { const p = o.pozycje.find((x) => x.klucz === k); return p ? <Wiersz key={k} etykieta={p.nazwa}>{fmtIlosc(v)} {p.jedn}</Wiersz> : null; })}
              {Object.keys(wyciagniete.ilosci).length === 0 && <p className="text-sm text-przygasz">Nie znaleziono metraży.</p>}
              {wyciagniete.uwagi && <Wiersz etykieta="Uwagi">{wyciagniete.uwagi}</Wiersz>}
              <div className="mt-2 flex gap-2"><Przycisk wariant="glowny" onClick={zastosuj}>Wstaw do formularza</Przycisk><Przycisk onClick={() => setWyciagniete(null)}>Odrzuć</Przycisk></div>
            </div>
          )}
        </>}
      </Karta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Karta tytul="Klient">
          <div className="space-y-3">
            <Etykieta etykieta="Imię i nazwisko / nazwa">
              <input list="oferta-klienci" value={o.klient} onChange={(e) => { const k = klienci.find((x) => x.nazwa === e.target.value); setO((x) => x && (k ? { ...x, klient: k.nazwa, klientId: k.id, telefon: x.telefon || k.telefon, email: x.email || k.email, adres: x.adres || k.adres } : { ...x, klient: e.target.value, klientId: null })); }}
                className="w-full min-h-11 rounded-xl border border-linia bg-karta px-3 py-2 focus:border-akcent focus:outline-none focus:ring-2 focus:ring-akcent/30" />
              <datalist id="oferta-klienci">{klienci.map((k) => <option key={k.id} value={k.nazwa} />)}</datalist>
            </Etykieta>
            <div className="grid grid-cols-2 gap-2"><Pole etykieta="Telefon" type="tel" value={o.telefon} onChange={(v) => ustaw('telefon', v)} /><Pole etykieta="E-mail" type="email" value={o.email} onChange={(v) => ustaw('email', v)} /></div>
            <Pole etykieta="Adres realizacji" value={o.adres} onChange={(v) => ustaw('adres', v)} />
          </div>
        </Karta>
        <Karta tytul="Parametry">
          <div className="grid grid-cols-2 gap-2">
            <Pole etykieta="Numer" value={o.nr} onChange={(v) => ustaw('nr', v)} />
            <Pole etykieta="Data" type="date" value={o.data} onChange={(v) => ustaw('data', v)} />
            <Wybor etykieta="System Festfloor" value={o.system} opcje={[...SYSTEMY, ...(o.system && !(SYSTEMY as readonly string[]).includes(o.system) ? [o.system] : [])]} onChange={(v) => ustaw('system', v)} />
            <Wybor etykieta="VAT" value={o.vat} opcje={[{ w: 8 as Vat, e: '8%' }, { w: 23 as Vat, e: '23%' }]} onChange={(v) => ustaw('vat', v)} />
          </div>
          <Przelacznik etykieta="Kolor lub rozwiązanie niestandardowe" opis="Wyższe ceny posadzek i ścian." value={o.niestandardowe} onChange={(v) => ustaw('niestandardowe', v)} />
        </Karta>
      </div>

      <Karta className="mt-4" tytul="Pozycje" akcje={<span className="text-sm text-przygasz">Wpisana ilość = pozycja w ofercie</span>}>
        <div className="space-y-1">{zIndeksem.filter((x) => x.p.grupa === 'główne').map((x) => wierszPozycji(x.p, x.i))}</div>
        <button type="button" className="mt-3 flex min-h-11 w-full items-center justify-between border-t border-linia pt-2 text-left font-medium" aria-expanded={dodatkowe} onClick={() => setDodatkowe(!dodatkowe)}>
          <span>Prace dodatkowe (po ocenie podłoża)</span><span className="text-przygasz">{dodatkowe ? '▾' : '▸'}</span></button>
        {(dodatkowe || zIndeksem.some((x) => x.p.grupa === 'dodatkowe' && x.p.ilosc)) && <div className="space-y-1">{zIndeksem.filter((x) => x.p.grupa === 'dodatkowe').map((x) => wierszPozycji(x.p, x.i))}</div>}
        <div className="mt-3 border-t border-linia pt-2">
          <div className="mb-1 font-medium">Pozycje indywidualne</div>
          {zIndeksem.filter((x) => x.p.grupa === 'własne').map((x) => (
            <div key={x.i} className="mb-2 rounded-xl border border-linia p-2">
              <div className="grid grid-cols-[1fr_6rem] gap-2"><Pole etykieta="Nazwa pozycji" value={x.p.nazwa} onChange={(v) => pozycja(x.i, { nazwa: v })} /><Wybor etykieta="Jedn." value={x.p.jedn} opcje={['szt.', 'm²', 'mb', 'kpl.', 'godz.']} onChange={(v) => pozycja(x.i, { jedn: v })} /></div>
              {wierszPozycji({ ...x.p, nazwa: '' }, x.i)}
            </div>
          ))}
          <Przycisk maly onClick={() => setO((x) => x && ({ ...x, pozycje: [...x.pozycje, { klucz: 'w' + Date.now(), nazwa: '', jedn: 'szt.', cena: 0, ilosc: 1, grupa: 'własne' }] }))}>+ Pozycja własna (np. meble SPA, sufit)</Przycisk>
        </div>
        <div className="mt-4 rounded-xl bg-wglebienie p-3">
          <Wiersz etykieta="Suma netto"><Kwota v={s.netto} /></Wiersz>
          <Wiersz etykieta={`VAT ${o.vat}%`}><Kwota v={s.vat} /></Wiersz>
          <Wiersz etykieta="Brutto" mocny><Kwota v={s.brutto} /></Wiersz>
          {s.m2 > 0 && <Wiersz etykieta="Powierzchnia razem">{fmtIlosc(s.m2)} m²</Wiersz>}
        </div>
      </Karta>

      <Karta className="mt-4" tytul="Warunki">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PoleLiczba etykieta="Czas realizacji" jedn="dni" min={0} value={o.dni} onChange={(v) => ustaw('dni', v)} podpowiedz={podp ? `Podpowiedź z powierzchni: ${podp}` : 'dni robocze'} />
          <PoleLiczba etykieta="Start prac do" jedn="dni" min={0} value={o.startDni} onChange={(v) => ustaw('startDni', v)} podpowiedz="od podpisania umowy" />
          <PoleLiczba etykieta="Zaliczka" jedn="%" min={0} value={o.zaliczka} onChange={(v) => ustaw('zaliczka', v ?? 0)} />
          <PoleLiczba etykieta="Ważność" jedn="dni" min={0} value={o.waznosc} onChange={(v) => ustaw('waznosc', v ?? 0)} podpowiedz={`do ${fmtData(dodajDni(o.data, o.waznosc || 0))}`} />
        </div>
        {podp > 0 && o.dni !== podp && <Przycisk maly wariant="cichy" onClick={() => ustaw('dni', podp)}>Użyj podpowiedzi: {podp} dni</Przycisk>}
        <Obszar klasa="mt-2" etykieta="Uwagi (trafią do PDF)" value={o.uwagi} onChange={(v) => ustaw('uwagi', v)} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Wybor etykieta="Status" value={o.status} opcje={STATUSY_OFERT.map((x) => ({ w: x, e: x[0].toUpperCase() + x.slice(1) }))} onChange={(v) => ustaw('status', v)} />
          <Pole etykieta="Przypomnij o odpowiedzi" type="date" value={o.followUp ?? ''} onChange={(v) => ustaw('followUp', v || null)} podpowiedz={o.wyslano ? `Wysłana ${fmtData(o.wyslano)}` : 'Ustawia się po wysłaniu'} />
        </div>
      </Karta>

      <div className="mt-4 flex flex-wrap gap-2">
        <Przycisk wariant="glowny" onClick={() => pdf('pobierz')}>Pobierz PDF</Przycisk>
        <Przycisk onClick={() => pdf('udostepnij')}>Udostępnij…</Przycisk>
        <Przycisk onClick={otworzMail}>Wyślij e-mailem</Przycisk>
        {kto === 'wlasciciel' && <Przycisk onClick={naZlecenie}>Zamień na zlecenie</Przycisk>}
        {!nowa && <Przycisk onClick={duplikuj}>Duplikuj</Przycisk>}
        {!nowa && <Przycisk wariant="grozny" onClick={async () => { if (await usuwanie('ofertę', () => usun('oferty', o.id))) nav('/oferty'); }}>Usuń</Przycisk>}
      </div>

      {mail && (
        <Okno tytul="Wyślij ofertę e-mailem" onClose={() => setMail(null)} stopka={<>
          <Przycisk onClick={() => setMail(null)}>Anuluj</Przycisk>
          <Przycisk onClick={przezProgramPocztowy}>Otwórz w programie pocztowym</Przycisk>
          {googleSkonfigurowany && <Przycisk wariant="glowny" disabled={czeka} onClick={wyslijGmailem}>{czeka ? 'Wysyłam…' : 'Wyślij przez Gmail'}</Przycisk>}</>}>
          <Pole etykieta="Do" type="email" value={mail.do} onChange={(v) => setMail({ ...mail, do: v })} />
          <Pole etykieta="Temat" value={mail.temat} onChange={(v) => setMail({ ...mail, temat: v })} />
          <Obszar etykieta="Treść" wiersze={9} value={mail.tresc} onChange={(v) => setMail({ ...mail, tresc: v })} />
          <p className="text-xs text-przygasz">Nic nie zostanie wysłane bez Twojego potwierdzenia. „Program pocztowy” pobiera PDF i otwiera gotową wiadomość – załącznik dodajesz sam{googleSkonfigurowany ? '. „Gmail” wysyła wiadomość z załącznikiem z Twojego konta.' : '.'}</p>
        </Okno>
      )}
    </>
  );
}
