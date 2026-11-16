import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { akcja, dodaj, nowyId, usun, zapiszBlob, zmien } from '../db/baza';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { fmtCzas, fmtData, fmtIlosc, proc, zl } from '../lib/kwoty';
import { zmniejszObraz } from '../lib/obraz';
import { podzialZysku, sumaDojazdow, wynikZlecenia, zuzycieMaterialow } from '../lib/obliczenia';
import { KATEGORIE, STATUSY_ZLECEN, TYPY_DOKUMENTOW, type Koszt, type PozycjaZakupu, type WpisGodzin } from '../lib/typy';
import { Karta, Kwota, Naglowek, Obszar, Przycisk, Pusto, Segmenty, tonStatusu, usePytanie, useUsuwanie, Wiersz, Znaczek } from '../ui/komponenty';
import { Zdjecie } from '../ui/Zdjecie';
import { FormularzGodzin, FormularzKosztu, FormularzZlecenia, KalkulatorDojazdu } from './formularze';

type Zakladka = 'koszty' | 'godziny' | 'dojazdy' | 'zdjecia' | 'materialy' | 'dokumenty' | 'historia';
const NAZWY_POL: Record<string, string> = { klient: 'klient', telefon: 'telefon', adres: 'adres', opis: 'opis', system: 'system', m2: 'm²', cenaM2: 'cena/m²', netto: 'netto', brutto: 'brutto', vat: 'VAT', status: 'status', dataStart: 'start', dataKoniec: 'koniec', klientOd: 'klient od', tryb: 'tryb', udzial: 'procent', stawka: 'stawka', notatki: 'notatki', ekipa: 'ekipa', listaZakupow: 'lista zakupów', godziny: 'godziny', data: 'data', kategoria: 'kategoria', typPrac: 'typ prac', usuniety: 'usunięcie' };

export default function KartaZlecenia() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ust = useUst();
  const kto = useKto();
  const pytaj = usePytanie();
  const usuwanie = useUsuwanie();
  const z = useTabela('zlecenia').find((x) => x.id === id);
  const wszystkieKoszty = useTabela('koszty');
  const godziny = useTabela('godziny');
  const pliki = useTabela('pliki').filter((p) => p.zlecenieId === id && p.rodzaj === 'zdjecie');
  const dokumenty = useTabela('dokumenty').filter((d) => d.zlecenieId === id);
  const historia = useTabela('historia');
  const [zak, setZak] = useState<Zakladka>('koszty');
  const [edycja, setEdycja] = useState(false);
  const [koszt, setKoszt] = useState<Koszt | 'nowy' | null>(null);
  const [wpis, setWpis] = useState<WpisGodzin | 'nowy' | null>(null);
  const [dojazd, setDojazd] = useState<Koszt | 'nowy' | null>(null);
  const [notatki, setNotatki] = useState<string | null>(null);

  const koszty = useMemo(() => wszystkieKoszty.filter((k) => k.zlecenieId === id).sort((a, b) => b.data.localeCompare(a.data)), [wszystkieKoszty, id]);
  const godz = useMemo(() => godziny.filter((g) => g.zlecenieId === id).sort((a, b) => b.data.localeCompare(a.data)), [godziny, id]);
  const wlasciciel = kto === 'wlasciciel';
  const maKwoty = wlasciciel || ust.uprawnienia.kwoty;
  const maWynik = wlasciciel || (ust.uprawnienia.kwoty && ust.uprawnienia.koszty);
  if (!z) return <><Naglowek tytul="Zlecenie" wstecz={() => nav('/zlecenia')} /><Pusto tytul="Nie znaleziono zlecenia" opis="Mogło zostać usunięte albo nie masz do niego dostępu." /></>;

  const wynik = wynikZlecenia(z, wszystkieKoszty);
  const podzial = podzialZysku(z, wynik.wynik, godziny, ust);
  const dojazdy = koszty.filter((k) => k.dojazd);
  const sd = sumaDojazdow(dojazdy);
  const idsPowiazane = new Set([id, ...koszty.map((k) => k.id), ...godz.map((g) => g.id)]);
  const os = historia.filter((h) => idsPowiazane.has(h.rekId)).sort((a, b) => b.kiedy - a.kiedy).slice(0, 60);

  const usunZlecenie = async () => {
    const ile = koszty.length + godz.length;
    const odp = await pytaj({
      tytul: `Usunąć zlecenie „${z.klient}”?`,
      tresc: ile ? `Do zlecenia przypisano ${koszty.length} kosztów i ${godz.length} wpisów godzin. Co z nimi zrobić?` : undefined,
      opcje: ile ? [{ w: 'zostaw', e: 'Usuń zlecenie, zostaw koszty i godziny' }, { w: 'razem', e: 'Usuń wszystko', grozne: true }] : undefined,
    });
    if (!odp) return;
    await akcja('Usunięto zlecenie', async () => {
      for (const k of koszty) if (odp === 'razem') await usun('koszty', k.id); else await zmien('koszty', k.id, { zlecenieId: null, ogolny: true, opis: `${k.opis} (z usuniętego zlecenia: ${z.klient})` });
      for (const g of godz) if (odp === 'razem') await usun('godziny', g.id); else await zmien('godziny', g.id, { zlecenieId: null });
      await usun('zlecenia', id);
    });
    komunikat('Usunięto zlecenie.', 'ok', true);
    nav('/zlecenia');
  };
  const dodajZdjecia = async (lista: FileList | null) => {
    if (!lista?.length) return;
    await akcja('Dodano zdjęcia', async () => {
      for (const f of Array.from(lista)) {
        const b = await zmniejszObraz(f);
        const pid = nowyId();
        await zapiszBlob(pid, b);
        await dodaj('pliki', { id: pid, rodzaj: 'zdjecie', zlecenieId: id, kosztId: null, nazwa: f.name, typ: b.type || f.type, rozmiar: b.size });
      }
    });
    komunikat(`Dodano zdjęcia: ${lista.length}.`);
  };
  const lista: PozycjaZakupu[] = z.listaZakupow ?? [];
  const warstwy = ust.zuzycie?.[z.system] ?? [];
  const zuzycie = zuzycieMaterialow(z.m2 ?? 0, warstwy);
  const zakladki: { w: Zakladka; e: string }[] = [
    { w: 'koszty', e: `Koszty (${koszty.length})` }, { w: 'godziny', e: `Godziny (${godz.length})` }, { w: 'dojazdy', e: `Dojazdy (${dojazdy.length})` },
    { w: 'zdjecia', e: `Zdjęcia (${pliki.length})` }, { w: 'materialy', e: 'Materiały' },
    ...(wlasciciel || ust.uprawnienia.dokumenty ? [{ w: 'dokumenty' as const, e: `Dokumenty (${dokumenty.length})` }] : []), { w: 'historia', e: 'Oś czasu' },
  ];

  return (
    <>
      <Naglowek tytul={z.klient || 'Zlecenie'} wstecz={() => nav('/zlecenia')} akcje={<>
        <Przycisk maly onClick={() => setEdycja(true)}>Edytuj</Przycisk>
        {wlasciciel && <Przycisk maly wariant="grozny" onClick={usunZlecenie}>Usuń</Przycisk>}
      </>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Znaczek ton={tonStatusu(z.status)}>{z.status}</Znaczek>
        {STATUSY_ZLECEN.filter((s) => s !== z.status).map((s) => <Przycisk key={s} maly wariant="cichy" onClick={() => zmien('zlecenia', id, { status: s }, { etykieta: 'Zmieniono status' }).then(() => komunikat(`Status: ${s}.`, 'ok', true))}>→ {s}</Przycisk>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Karta tytul="Dane">
          {z.telefon && <Wiersz etykieta="Telefon"><a className="text-akcent underline-offset-2 hover:underline" href={`tel:${z.telefon.replace(/\s/g, '')}`}>{z.telefon}</a></Wiersz>}
          {z.adres && <Wiersz etykieta="Adres"><a className="text-akcent underline-offset-2 hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(z.adres)}`}>{z.adres}</a></Wiersz>}
          <Wiersz etykieta="System">{z.system || '–'} · {z.typPrac}</Wiersz>
          <Wiersz etykieta="Powierzchnia">{z.m2 ? `${fmtIlosc(z.m2)} m²` : '–'}</Wiersz>
          <Wiersz etykieta="Termin">{fmtData(z.dataStart)} – {fmtData(z.dataKoniec)}</Wiersz>
          <Wiersz etykieta="Klient od">{imie(ust, z.klientOd)}</Wiersz>
          <Wiersz etykieta="Rozliczenie">{z.tryb === 'godz' ? `Sam + pomoc godzinowa (${fmtIlosc(podzial.stawka)} zł/h)` : wlasciciel || ust.uprawnienia.rozliczenie ? `Razem ${fmtIlosc(podzial.udzial)}/${fmtIlosc(100 - podzial.udzial)}` : 'Razem'}</Wiersz>
          {z.opis && <p className="mt-2 whitespace-pre-wrap text-sm text-przygasz">{z.opis}</p>}
        </Karta>
        {maKwoty && (
          <Karta tytul="Kwoty i wynik">
            <Wiersz etykieta="Przychód netto"><Kwota v={z.netto} /></Wiersz>
            <Wiersz etykieta={`Brutto (VAT ${z.vat}%)`}><Kwota v={z.brutto} /></Wiersz>
            {z.cenaM2 ? <Wiersz etykieta="Cena brutto za m²"><Kwota v={z.cenaM2} /></Wiersz> : null}
            {maWynik && <>
              {KATEGORIE.filter((k) => wynik.wgKategorii[k]).map((k) => <Wiersz key={k} etykieta={`Koszty: ${k}`}><Kwota v={wynik.wgKategorii[k]} /></Wiersz>)}
              {wynik.ogolne > 0 && <Wiersz etykieta="Koszty ogólne (rozksięgowane)"><Kwota v={wynik.ogolne} /></Wiersz>}
              <Wiersz etykieta="Koszty razem netto"><Kwota v={wynik.koszty} /></Wiersz>
              <Wiersz etykieta="Wynik" mocny><Kwota v={wynik.wynik} kolor /></Wiersz>
              <Wiersz etykieta="Marża">{proc(wynik.marza)}</Wiersz>
              {(wlasciciel || ust.uprawnienia.rozliczenie) && <div className="mt-2 rounded-xl bg-wglebienie p-3">
                <div className="mb-1 text-sm font-medium">Podział zysku</div>
                <Wiersz etykieta={`${imie(ust, 'wlasciciel')} (${fmtIlosc(podzial.godziny.wlasciciel)} h)`}><Kwota v={podzial.kwoty.wlasciciel} /></Wiersz>
                <Wiersz etykieta={`${imie(ust, 'wspolnik')} (${fmtIlosc(podzial.godziny.wspolnik)} h)`}><Kwota v={podzial.kwoty.wspolnik} /></Wiersz>
                <p className="mt-1 text-xs text-przygasz">Wynik przed podatkami i składkami.</p>
              </div>}
            </>}
          </Karta>
        )}
      </div>

      <Karta className="mt-4" tytul="Notatki" akcje={notatki === null ? <Przycisk maly wariant="cichy" onClick={() => setNotatki(z.notatki ?? '')}>Edytuj</Przycisk> : <Przycisk maly wariant="glowny" onClick={async () => { await zmien('zlecenia', id, { notatki }, { etykieta: 'Zapisano notatki' }); setNotatki(null); }}>Zapisz</Przycisk>}>
        {notatki === null ? <p className="whitespace-pre-wrap text-[15px]">{z.notatki || <span className="text-przygasz">Brak notatek.</span>}</p> : <Obszar etykieta="Notatki" value={notatki} onChange={setNotatki} wiersze={4} />}
      </Karta>

      <div className="mt-5 mb-3"><Segmenty etykieta="Sekcja" value={zak} onChange={setZak} opcje={zakladki} /></div>

      {zak === 'koszty' && <>
        <div className="mb-2 flex justify-end"><Przycisk maly wariant="glowny" onClick={() => setKoszt('nowy')}>+ Koszt</Przycisk></div>
        {koszty.length === 0 ? <Pusto tytul="Brak kosztów" opis="Dodaj materiały, narzędzia lub podwykonawców – wynik zlecenia przeliczy się sam." /> : (
          <ul className="space-y-2">{koszty.map((k) => (
            <li key={k.id}><button type="button" onClick={() => (k.dojazd ? setDojazd(k) : setKoszt(k))} className="flex w-full items-center gap-3 rounded-2xl border border-linia bg-karta p-3 text-left hover:border-akcent">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{k.opis || k.kategoria}</div><div className="text-sm text-przygasz">{fmtData(k.data)} · {k.kategoria}{k.dostawca ? ` · ${k.dostawca}` : ''}{k.plikId ? ' · 📎' : ''}</div></div>
              <div className="text-right"><div><Kwota v={k.netto} /></div><div className="text-xs text-przygasz">brutto {zl(k.brutto)}</div></div>
            </button></li>))}
          </ul>)}
      </>}

      {zak === 'godziny' && <>
        <div className="mb-2 flex items-center justify-between"><span className="text-sm text-przygasz">{imie(ust, 'wlasciciel')}: {fmtIlosc(podzial.godziny.wlasciciel)} h · {imie(ust, 'wspolnik')}: {fmtIlosc(podzial.godziny.wspolnik)} h</span><Przycisk maly wariant="glowny" onClick={() => setWpis('nowy')}>+ Godziny</Przycisk></div>
        {godz.length === 0 ? <Pusto tytul="Brak godzin" opis="Wpisy godzin są podstawą rozliczenia w trybie „Sam + pomoc godzinowa”." /> : (
          <ul className="space-y-2">{godz.map((g) => (
            <li key={g.id}><button type="button" onClick={() => setWpis(g)} className="flex w-full items-center gap-3 rounded-2xl border border-linia bg-karta p-3 text-left hover:border-akcent">
              <div className="min-w-0 flex-1"><div className="font-medium">{imie(ust, g.osoba)} · {fmtData(g.data)}</div>{g.opis && <div className="truncate text-sm text-przygasz">{g.opis}</div>}</div>
              <div className="liczby text-lg font-semibold">{fmtIlosc(g.godziny)} h</div>
            </button></li>))}
          </ul>)}
      </>}

      {zak === 'dojazdy' && <>
        <div className="mb-2 flex items-center justify-between"><span className="text-sm text-przygasz">{fmtIlosc(sd.km)} km · {fmtIlosc(sd.litry)} l · {zl(sd.brutto)} brutto</span><Przycisk maly wariant="glowny" onClick={() => setDojazd('nowy')}>+ Dojazd</Przycisk></div>
        {dojazdy.length === 0 ? <Pusto tytul="Brak dojazdów" opis="Kalkulator policzy kilometry, litry i koszt paliwa, a wynik zapisze jako koszt transportu." /> : (
          <ul className="space-y-2">{dojazdy.map((k) => (
            <li key={k.id}><button type="button" onClick={() => setDojazd(k)} className="flex w-full items-center gap-3 rounded-2xl border border-linia bg-karta p-3 text-left hover:border-akcent">
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{k.opis}</div><div className="text-sm text-przygasz">{fmtData(k.data)} · {fmtIlosc(k.dojazd!.km)} km · {fmtIlosc(k.dojazd!.litry)} l</div></div>
              <Kwota v={k.brutto} />
            </button></li>))}
          </ul>)}
      </>}

      {zak === 'zdjecia' && <>
        <label className="mb-3 inline-flex min-h-11 cursor-pointer items-center rounded-xl bg-akcent px-4 font-medium text-na-akcencie">+ Dodaj zdjęcia
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void dodajZdjecia(e.target.files); e.target.value = ''; }} /></label>
        {pliki.length === 0 ? <Pusto tytul="Brak zdjęć" opis="Zdjęcia z budowy zapisują się na urządzeniu i wysyłają do chmury, gdy jest sieć." /> : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{pliki.map((p) => (
            <div key={p.id} className="relative"><Zdjecie id={p.id} alt={p.nazwa} className="aspect-square w-full rounded-xl border border-linia" />
              <button type="button" aria-label="Usuń zdjęcie" onClick={() => usuwanie('zdjęcie', () => usun('pliki', p.id))} className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white">✕</button></div>))}
          </div>)}
      </>}

      {zak === 'materialy' && <div className="grid gap-4 lg:grid-cols-2">
        <Karta tytul={`Zużycie – ${z.system || 'system'}, ${fmtIlosc(z.m2 ?? 0)} m²`}>
          {!z.m2 || !warstwy.length ? <p className="text-sm text-przygasz">Podaj powierzchnię zlecenia i ustaw parametry zużycia dla systemu (Ustawienia → Zużycie materiałów).</p> : <>
            {zuzycie.map((p) => <Wiersz key={p.nazwa} etykieta={p.nazwa}>{fmtIlosc(p.ilosc)} {p.jedn} · {p.opakowania} op. × {fmtIlosc(p.opakowanie)} {p.jedn}</Wiersz>)}
            <Przycisk maly className="mt-3" onClick={() => zmien('zlecenia', id, { listaZakupow: [...lista, ...zuzycie.map((p) => ({ nazwa: p.nazwa, ilosc: p.opakowania * p.opakowanie, jedn: p.jedn, kupione: false }))] }, { etykieta: 'Dodano do listy zakupów' }).then(() => komunikat('Dodano do listy zakupów.', 'ok', true))}>Dodaj do listy zakupów</Przycisk>
            <p className="mt-2 text-xs text-przygasz">Wartości orientacyjne – parametry edytujesz w Ustawieniach.</p>
          </>}
        </Karta>
        <Karta tytul="Lista zakupów" akcje={<Przycisk maly wariant="cichy" onClick={async () => { const n = prompt('Co kupić?'); if (n?.trim()) await zmien('zlecenia', id, { listaZakupow: [...lista, { nazwa: n.trim(), ilosc: 1, jedn: 'szt.', kupione: false }] }); }}>+ Pozycja</Przycisk>}>
          {lista.length === 0 ? <p className="text-sm text-przygasz">Lista jest pusta.</p> : <ul className="divide-y divide-linia">{lista.map((p, i) => (
            <li key={i} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" aria-label={`Kupione: ${p.nazwa}`} className="h-5 w-5 accent-[var(--akcent)]" checked={p.kupione} onChange={(e) => zmien('zlecenia', id, { listaZakupow: lista.map((x, j) => (j === i ? { ...x, kupione: e.target.checked } : x)) })} />
              <span className={p.kupione ? 'flex-1 text-przygasz line-through' : 'flex-1'}>{p.nazwa}</span><span className="liczby text-sm text-przygasz">{fmtIlosc(p.ilosc)} {p.jedn}</span>
              <button type="button" aria-label={`Usuń ${p.nazwa}`} className="grid h-9 w-9 place-items-center text-przygasz" onClick={() => zmien('zlecenia', id, { listaZakupow: lista.filter((_, j) => j !== i) }, { etykieta: 'Usunięto pozycję' }).then(() => komunikat('Usunięto pozycję.', 'ok', true))}>✕</button>
            </li>))}</ul>}
        </Karta>
      </div>}

      {zak === 'dokumenty' && <>
        <div className="mb-3 flex flex-wrap gap-2">{(Object.keys(TYPY_DOKUMENTOW) as (keyof typeof TYPY_DOKUMENTOW)[]).map((t) => <Przycisk key={t} maly onClick={() => nav(`/dokumenty?zlecenie=${id}&typ=${t}`)}>+ {TYPY_DOKUMENTOW[t]}</Przycisk>)}</div>
        {dokumenty.length === 0 ? <Pusto tytul="Brak dokumentów" opis="Umowa, protokół odbioru, instrukcja pielęgnacji, potwierdzenie zaliczki i proforma wypełnią się danymi zlecenia." /> : (
          <ul className="space-y-2">{dokumenty.map((d) => <li key={d.id}><Link to={`/dokumenty?id=${d.id}`} className="flex items-center justify-between rounded-2xl border border-linia bg-karta p-3 hover:border-akcent"><span className="font-medium">{TYPY_DOKUMENTOW[d.typ]} {d.nr}</span><span className="text-sm text-przygasz">{fmtData(d.data)}</span></Link></li>)}</ul>)}
        {z.ofertaId && <p className="mt-3 text-sm"><Link className="text-akcent" to={`/oferty/${z.ofertaId}`}>Otwórz ofertę źródłową ›</Link></p>}
      </>}

      {zak === 'historia' && (os.length === 0 ? <Pusto tytul="Brak historii" /> : (
        <ol className="space-y-2 border-l-2 border-linia pl-4">{os.map((h) => (
          <li key={h.id} className="relative"><span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-akcent" />
            <div className="text-sm"><span className="font-medium">{imie(ust, h.kto)}</span> {h.akcja} {h.tabela === 'zlecenia' ? 'zlecenie' : h.tabela === 'koszty' ? `koszt „${h.etykieta}”` : h.tabela === 'godziny' ? 'godziny' : h.tabela}
              {h.akcja === 'zmieniono' && Object.keys(h.zmiany ?? {}).length > 0 && <span className="text-przygasz">: {Object.keys(h.zmiany).filter((p) => p !== 'zmienil').map((p) => NAZWY_POL[p] ?? p).join(', ')}</span>}</div>
            <div className="text-xs text-przygasz">{fmtCzas(h.kiedy)}</div>
          </li>))}
        </ol>))}

      {edycja && <FormularzZlecenia zlecenie={z} onClose={() => setEdycja(false)} />}
      {koszt && <FormularzKosztu koszt={koszt === 'nowy' ? undefined : koszt} zlecenieId={id} onClose={() => setKoszt(null)} />}
      {wpis && <FormularzGodzin wpis={wpis === 'nowy' ? undefined : wpis} poczatkowe={{ zlecenieId: id }} onClose={() => setWpis(null)} />}
      {dojazd && <KalkulatorDojazdu koszt={dojazd === 'nowy' ? undefined : dojazd} zlecenieId={id} onClose={() => setDojazd(null)} />}
    </>
  );
}
