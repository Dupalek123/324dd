import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dodaj, nowyId, usun, zmien } from '../db/baza';
import { useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { dzis, fmtData } from '../lib/kwoty';
import { nastepnyNumer } from '../lib/obliczenia';
import { TYPY_DOKUMENTOW, type Dokument, type TypDokumentu } from '../lib/typy';
import { dokumentPdf, domyslnePola, POLA_DOKUMENTOW, trescDokumentu } from '../pdf/dokumenty';
import { pobierzPdf, udostepnijPdf } from '../pdf/pdf';
import { Naglowek, Obszar, Okno, pasuje, PasekListy, Pole, Przycisk, Pusto, useUsuwanie, Wybor, Znaczek, type StanListy } from '../ui/komponenty';
import { Podpis } from '../ui/Podpis';
import { useOpcjeZlecen } from './formularze';

const PREFIKSY: Record<TypDokumentu, string> = { umowa: 'U', protokol: 'PO', pielegnacja: 'IP', zaliczka: 'Z', proforma: 'PF' };
type Szkic = Omit<Dokument, '_ts' | '_zm' | 'utworzono' | 'utworzyl'>;

function Edytor({ poczatek, nowy, onClose }: { poczatek: Szkic; nowy: boolean; onClose: () => void }) {
  const ust = useUst();
  const zlecenia = useTabela('zlecenia');
  const dokumenty = useTabela('dokumenty');
  const opcje = useOpcjeZlecen('— bez zlecenia —');
  const usuwanie = useUsuwanie();
  const [d, setD] = useState<Szkic>(poczatek);
  const z = zlecenia.find((x) => x.id === d.zlecenieId);
  const pola = POLA_DOKUMENTOW[d.typ];
  const zPodpisami = d.typ !== 'pielegnacja' && d.typ !== 'proforma';
  const wybierzZlecenie = (id: string) => {
    const nz = zlecenia.find((x) => x.id === id);
    setD((s) => ({ ...s, zlecenieId: nz?.id ?? null, klient: nz?.klient ?? s.klient, adres: nz?.adres ?? s.adres, pola: nz ? domyslnePola(s.typ, nz, ust, s.data) : s.pola }));
  };
  const zmienTyp = (typ: TypDokumentu) => setD((s) => ({ ...s, typ, nr: nastepnyNumer(dokumenty.filter((x) => x.typ === typ).map((x) => x.nr), new Date().getFullYear(), PREFIKSY[typ]), pola: domyslnePola(typ, z, ust, s.data) }));
  const zapisz = async (): Promise<boolean> => {
    if (!d.klient.trim() && d.typ !== 'pielegnacja') { komunikat('Podaj klienta.', 'blad'); return false; }
    if (nowy && !dokumenty.some((x) => x.id === d.id)) await dodaj('dokumenty', d, { etykieta: 'Dodano dokument' }); else await zmien('dokumenty', d.id, d, { etykieta: 'Zapisano dokument' });
    return true;
  };
  const pdf = async (udostepnij: boolean) => {
    if (!(await zapisz())) return;
    const nazwa = `${TYPY_DOKUMENTOW[d.typ]} ${d.nr} ${d.klient}`;
    try { if (udostepnij) await udostepnijPdf(dokumentPdf(d as Dokument, ust, z), nazwa); else await pobierzPdf(dokumentPdf(d as Dokument, ust, z), nazwa); } catch (e) { komunikat('Nie udało się wygenerować PDF: ' + (e as Error).message, 'blad'); }
  };
  return (
    <Okno szerokie tytul={`${TYPY_DOKUMENTOW[d.typ]} ${d.nr}`} onClose={onClose} stopka={<>
      {!nowy && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('dokument', () => usun('dokumenty', d.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={async () => { if (await zapisz()) { komunikat('Zapisano dokument.', 'ok', true); onClose(); } }}>Zapisz</Przycisk>
      <Przycisk onClick={() => pdf(true)}>Udostępnij…</Przycisk>
      <Przycisk wariant="glowny" onClick={() => pdf(false)}>Pobierz PDF</Przycisk></>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Wybor etykieta="Rodzaj" value={d.typ} opcje={(Object.keys(TYPY_DOKUMENTOW) as TypDokumentu[]).map((t) => ({ w: t, e: TYPY_DOKUMENTOW[t] }))} onChange={zmienTyp} />
        <Pole etykieta="Numer" value={d.nr} onChange={(v) => setD({ ...d, nr: v })} />
        <Pole etykieta="Data" type="date" value={d.data} onChange={(v) => setD({ ...d, data: v })} />
      </div>
      <Wybor etykieta="Zlecenie (dane wstawią się automatycznie)" value={d.zlecenieId ?? '__brak__'} opcje={opcje} onChange={wybierzZlecenie} />
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Klient" value={d.klient} onChange={(v) => setD({ ...d, klient: v })} />
        <Pole etykieta="Adres realizacji" value={d.adres} onChange={(v) => setD({ ...d, adres: v })} />
      </div>
      {pola.length > 0 && <div className="grid gap-2 sm:grid-cols-2">
        {pola.map((p) => p.dlugie
          ? <Obszar key={p.klucz} klasa="sm:col-span-2" etykieta={p.etykieta} wiersze={2} value={d.pola[p.klucz] ?? ''} onChange={(v) => setD({ ...d, pola: { ...d.pola, [p.klucz]: v } })} />
          : <Pole key={p.klucz} etykieta={p.etykieta} value={d.pola[p.klucz] ?? ''} onChange={(v) => setD({ ...d, pola: { ...d.pola, [p.klucz]: v } })} />)}
      </div>}
      {zPodpisami && <div className="grid gap-3 sm:grid-cols-2">
        <Podpis etykieta="Podpis wykonawcy" value={d.podpisWykonawcy} onChange={(v) => setD({ ...d, podpisWykonawcy: v })} />
        <Podpis etykieta={d.typ === 'zaliczka' ? 'Podpis wpłacającego' : 'Podpis zamawiającego'} value={d.podpisKlienta} onChange={(v) => setD({ ...d, podpisKlienta: v })} />
      </div>}
      <details className="rounded-xl border border-linia p-3"><summary className="min-h-8 font-medium">Podgląd treści</summary>
        <p className="mt-2 whitespace-pre-wrap text-sm text-przygasz">{trescDokumentu(d as Dokument, ust, z)}</p>
        <p className="mt-2 text-xs text-przygasz">Szablon zmienisz w Ustawieniach → Szablony dokumentów. Wzór umowy warto raz skonsultować z prawnikiem.</p>
      </details>
    </Okno>
  );
}

export default function Dokumenty() {
  const ust = useUst();
  const [parametry, setParametry] = useSearchParams();
  const dokumenty = useTabela('dokumenty');
  const zlecenia = useTabela('zlecenia');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'wszystkie' });
  const [edytor, setEdytor] = useState<{ szkic: Szkic; nowy: boolean } | null>(null);

  const nowy = (typ: TypDokumentu, zlecenieId: string | null = null) => {
    const z = zlecenia.find((x) => x.id === zlecenieId);
    setEdytor({ nowy: true, szkic: { id: nowyId(), typ, nr: nastepnyNumer(dokumenty.filter((x) => x.typ === typ).map((x) => x.nr), new Date().getFullYear(), PREFIKSY[typ]), data: dzis(), zlecenieId: z?.id ?? null, klient: z?.klient ?? '', adres: z?.adres ?? '', pola: domyslnePola(typ, z, ust, dzis()), podpisKlienta: null, podpisWykonawcy: null } });
  };
  // otwarcie z karty zlecenia: ?zlecenie=…&typ=… albo ?id=…
  useEffect(() => {
    const id = parametry.get('id'), typ = parametry.get('typ') as TypDokumentu | null;
    if (id) { const d = dokumenty.find((x) => x.id === id); if (!d) return; setEdytor({ szkic: structuredClone(d), nowy: false }); setParametry({}, { replace: true }); }
    else if (typ && typ in TYPY_DOKUMENTOW) { if (parametry.get('zlecenie') && !zlecenia.length) return; nowy(typ, parametry.get('zlecenie')); setParametry({}, { replace: true }); }
  }, [parametry, dokumenty.length, zlecenia.length]); // eslint-disable-line

  const lista = dokumenty.filter((d) => stan.filtr === 'wszystkie' || d.typ === stan.filtr).filter((d) => pasuje(stan.szukaj, d.nr, d.klient, d.adres, TYPY_DOKUMENTOW[d.typ]))
    .sort((a, b) => (stan.sort === 'klient' ? a.klient.localeCompare(b.klient, 'pl') : b.data.localeCompare(a.data) || b.utworzono - a.utworzono));
  return (
    <>
      <Naglowek tytul="Dokumenty" />
      <div className="mb-4 flex flex-wrap gap-2">{(Object.keys(TYPY_DOKUMENTOW) as TypDokumentu[]).map((t) => <Przycisk key={t} maly onClick={() => nowy(t)}>+ {TYPY_DOKUMENTOW[t]}</Przycisk>)}</div>
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Rodzaj" filtry={[{ w: 'wszystkie', e: 'Wszystkie rodzaje' }, ...(Object.keys(TYPY_DOKUMENTOW) as TypDokumentu[]).map((t) => ({ w: t, e: TYPY_DOKUMENTOW[t] }))]} sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'klient', e: 'Wg klienta' }]} />
      {lista.length === 0 ? <Pusto tytul={dokumenty.length ? 'Nic nie pasuje do filtrów' : 'Nie ma jeszcze dokumentów'} opis="Umowa, protokół odbioru, instrukcja pielęgnacji, potwierdzenie zaliczki i proforma – w jednym stylu, z danymi firmy i klienta. Oferty znajdziesz w zakładce Oferty." /> : (
        <ul className="space-y-2">{lista.map((d) => (
          <li key={d.id}><button type="button" onClick={() => setEdytor({ szkic: structuredClone(d), nowy: false })} className="flex w-full items-center gap-3 rounded-2xl border border-linia bg-karta p-3 text-left hover:border-akcent">
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{TYPY_DOKUMENTOW[d.typ]} {d.nr}</div><div className="truncate text-sm text-przygasz">{d.klient || '—'} · {fmtData(d.data)}</div></div>
            {(d.podpisKlienta || d.podpisWykonawcy) && <Znaczek ton="dobrze">podpisany</Znaczek>}
          </button></li>))}
        </ul>
      )}
      {edytor && <Edytor key={edytor.szkic.id} poczatek={edytor.szkic} nowy={edytor.nowy} onClose={() => setEdytor(null)} />}
    </>
  );
}
