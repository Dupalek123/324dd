import { useMemo, useState } from 'react';
import { dodaj, usun, zmien } from '../db/baza';
import { useKto, useTabela, useUst } from '../db/hooki';
import { komunikat } from '../db/sesja';
import { dzis, fmtData, fmtIlosc, zaokr, zl } from '../lib/kwoty';
import { zuzycieMaterialow } from '../lib/obliczenia';
import { SYSTEMY, type Material } from '../lib/typy';
import { Karta, Naglowek, Obszar, Okno, pasuje, PasekListy, Pole, PoleLiczba, Przycisk, Pusto, Segmenty, useForm, useUsuwanie, Wiersz, Wybor, Znaczek, type StanListy } from '../ui/komponenty';
import { useOpcjeZlecen } from './formularze';

function FormularzMaterialu({ material, onClose }: { material?: Material; onClose: () => void }) {
  const usuwanie = useUsuwanie();
  const [w, ustaw] = useForm<Partial<Material>>({ nazwa: '', system: '', jedn: 'kg', minStan: 0, cenaNetto: 0, notatki: '', ...material });
  const [blad, setBlad] = useState<string | null>(null);
  const zapisz = async () => {
    if (!w.nazwa?.trim()) { setBlad('Podaj nazwę materiału.'); return; }
    if (material) await zmien('materialy', material.id, w, { etykieta: 'Zapisano materiał' }); else await dodaj('materialy', w, { etykieta: 'Dodano materiał' });
    onClose();
  };
  return (
    <Okno tytul={material ? 'Edycja materiału' : 'Nowy materiał'} onClose={onClose} stopka={<>
      {material && <Przycisk wariant="grozny" className="mr-auto" onClick={async () => { if (await usuwanie('materiał', () => usun('materialy', material.id))) onClose(); }}>Usuń</Przycisk>}
      <Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <Pole etykieta="Nazwa" value={w.nazwa ?? ''} onChange={(v) => ustaw('nazwa', v)} blad={blad} />
      <div className="grid grid-cols-2 gap-2">
        <Wybor etykieta="System" value={w.system ?? ''} opcje={[{ w: '', e: '— dowolny —' }, ...SYSTEMY.map((s) => ({ w: s as string, e: s as string }))]} onChange={(v) => ustaw('system', v)} />
        <Wybor etykieta="Jednostka" value={w.jedn ?? 'kg'} opcje={['kg', 'l', 'szt.', 'm²', 'mb', 'op.']} onChange={(v) => ustaw('jedn', v)} />
        <PoleLiczba etykieta="Stan minimalny" min={0} value={w.minStan} onChange={(v) => ustaw('minStan', v ?? 0)} podpowiedz="Poniżej – ostrzeżenie" />
        <PoleLiczba etykieta="Cena netto za jedn." jedn="zł" min={0} value={w.cenaNetto} onChange={(v) => ustaw('cenaNetto', v ?? 0)} />
      </div>
      <Obszar etykieta="Notatki" value={w.notatki ?? ''} onChange={(v) => ustaw('notatki', v)} wiersze={2} />
    </Okno>
  );
}

function FormularzRuchu({ material, onClose }: { material: Material; onClose: () => void }) {
  const opcje = useOpcjeZlecen();
  const [w, ustaw] = useForm({ typ: 'zuzycie' as 'przyjecie' | 'zuzycie', data: dzis(), ilosc: 0 as number, zlecenieId: '__brak__', opis: '' });
  const zapisz = async () => {
    if (!w.ilosc || w.ilosc <= 0) { komunikat('Podaj ilość większą od zera.', 'blad'); return; }
    await dodaj('ruchy', { materialId: material.id, data: w.data, ilosc: w.typ === 'zuzycie' ? -w.ilosc : w.ilosc, zlecenieId: w.zlecenieId === '__brak__' ? null : w.zlecenieId, opis: w.opis }, { etykieta: 'Zapisano ruch magazynowy' });
    komunikat('Zapisano.', 'ok', true);
    onClose();
  };
  return (
    <Okno tytul={material.nazwa} onClose={onClose} stopka={<><Przycisk onClick={onClose}>Anuluj</Przycisk><Przycisk wariant="glowny" onClick={zapisz}>Zapisz</Przycisk></>}>
      <Segmenty etykieta="Rodzaj" value={w.typ} onChange={(v) => ustaw('typ', v)} opcje={[{ w: 'zuzycie', e: 'Zużycie' }, { w: 'przyjecie', e: 'Przyjęcie (zakup)' }]} />
      <div className="grid grid-cols-2 gap-2">
        <Pole etykieta="Data" type="date" value={w.data} onChange={(v) => ustaw('data', v)} />
        <PoleLiczba etykieta="Ilość" jedn={material.jedn} min={0} value={w.ilosc || null} onChange={(v) => ustaw('ilosc', v ?? 0)} />
      </div>
      <Wybor etykieta="Zlecenie" value={w.zlecenieId} opcje={opcje} onChange={(v) => ustaw('zlecenieId', v)} />
      <Pole etykieta="Opis" value={w.opis} onChange={(v) => ustaw('opis', v)} />
    </Okno>
  );
}

export default function Materialy() {
  const ust = useUst();
  const kto = useKto();
  const materialy = useTabela('materialy');
  const ruchy = useTabela('ruchy');
  const zlecenia = useTabela('zlecenia');
  const usuwanie = useUsuwanie();
  const [zak, setZak] = useState<'magazyn' | 'kalkulator' | 'ruchy'>('magazyn');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'nazwa', filtr: 'wszystkie' });
  const [edycja, setEdycja] = useState<Material | 'nowy' | null>(null);
  const [ruch, setRuch] = useState<Material | null>(null);
  const [system, setSystem] = useState<string>(SYSTEMY[0]);
  const [m2, setM2] = useState<number | null>(50);
  const [zlecenieId, setZlecenieId] = useState('__brak__');
  const opcje = useOpcjeZlecen('— wybierz zlecenie —');
  const stany = useMemo(() => { const m = new Map<string, number>(); for (const r of ruchy) m.set(r.materialId, (m.get(r.materialId) ?? 0) + r.ilosc); return m; }, [ruchy]);
  const lista = materialy.filter((m) => stan.filtr === 'wszystkie' || (stan.filtr === 'niski' ? (stany.get(m.id) ?? 0) < m.minStan : m.system === stan.filtr)).filter((m) => pasuje(stan.szukaj, m.nazwa, m.system, m.notatki))
    .sort((a, b) => (stan.sort === 'stan' ? (stany.get(a.id) ?? 0) - (stany.get(b.id) ?? 0) : a.nazwa.localeCompare(b.nazwa, 'pl')));
  const wynik = zuzycieMaterialow(m2 ?? 0, ust.zuzycie?.[system] ?? []);
  const wybierzZlecenie = (id: string) => { setZlecenieId(id); const z = zlecenia.find((x) => x.id === id); if (z) { if (z.m2) setM2(z.m2); if (z.system && ust.zuzycie?.[z.system]) setSystem(z.system); } };
  const doListy = async () => {
    const z = zlecenia.find((x) => x.id === zlecenieId);
    if (!z) { komunikat('Wybierz zlecenie, do którego dodać listę zakupów.', 'blad'); return; }
    await zmien('zlecenia', z.id, { listaZakupow: [...(z.listaZakupow ?? []), ...wynik.map((p) => ({ nazwa: p.nazwa, ilosc: p.opakowania * p.opakowanie, jedn: p.jedn, kupione: false }))] }, { etykieta: 'Dodano do listy zakupów' });
    komunikat(`Dodano do listy zakupów zlecenia „${z.klient}”.`, 'ok', true);
  };
  return (
    <>
      <Naglowek tytul="Materiały" akcje={zak === 'magazyn' && <Przycisk wariant="glowny" onClick={() => setEdycja('nowy')}>+ Nowy materiał</Przycisk>} />
      <div className="mb-4"><Segmenty etykieta="Sekcja" value={zak} onChange={setZak} opcje={[{ w: 'magazyn', e: 'Stan magazynu' }, { w: 'kalkulator', e: 'Kalkulator zużycia' }, { w: 'ruchy', e: 'Przyjęcia i zużycia' }]} /></div>
      {zak === 'magazyn' && <>
        <PasekListy stan={stan} onChange={setStan} filtry={[{ w: 'wszystkie', e: 'Wszystkie' }, { w: 'niski', e: 'Niski stan' }, ...SYSTEMY.map((s) => ({ w: s, e: s }))]} sorty={[{ w: 'nazwa', e: 'Alfabetycznie' }, { w: 'stan', e: 'Wg stanu' }]} />
        {lista.length === 0 ? <Pusto tytul={materialy.length ? 'Nic nie pasuje do filtrów' : 'Magazyn jest pusty'} opis="Dodaj materiały, a potem zapisuj przyjęcia (zakupy) i zużycia na zleceniach." /> : (
          <ul className="space-y-2">{lista.map((m) => { const s = zaokr(stany.get(m.id) ?? 0); return (
            <li key={m.id} className="flex items-center gap-3 rounded-2xl border border-linia bg-karta p-3">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEdycja(m)}><div className="truncate font-medium">{m.nazwa}</div><div className="text-sm text-przygasz">{m.system || 'dowolny system'}{m.cenaNetto ? ` · ${zl(m.cenaNetto)}/${m.jedn}` : ''}</div></button>
              <div className="text-right"><div className="liczby text-lg font-semibold">{fmtIlosc(s)} {m.jedn}</div>{s < m.minStan && <Znaczek ton="zle">poniżej {fmtIlosc(m.minStan)}</Znaczek>}</div>
              <Przycisk maly onClick={() => setRuch(m)}>± Ruch</Przycisk>
            </li>); })}
          </ul>)}
      </>}
      {zak === 'kalkulator' && <div className="grid gap-4 lg:grid-cols-2">
        <Karta tytul="Parametry">
          <div className="space-y-3">
            <Wybor etykieta="Zlecenie (opcjonalnie)" value={zlecenieId} opcje={opcje} onChange={wybierzZlecenie} />
            <div className="grid grid-cols-2 gap-2">
              <Wybor etykieta="System Festfloor" value={system} opcje={Object.keys(ust.zuzycie ?? {})} onChange={setSystem} />
              <PoleLiczba etykieta="Powierzchnia" jedn="m²" min={0} value={m2} onChange={setM2} />
            </div>
            <p className="text-xs text-przygasz">Zużycie na m² i liczbę warstw dla każdego systemu ustawisz w Ustawieniach → Zużycie materiałów. Wartości startowe są orientacyjne – sprawdź je z kartami technicznymi.</p>
          </div>
        </Karta>
        <Karta tytul="Zapotrzebowanie">
          {wynik.length === 0 ? <p className="text-sm text-przygasz">Brak parametrów dla tego systemu.</p> : wynik.map((p) => <Wiersz key={p.nazwa} etykieta={p.nazwa}><strong>{fmtIlosc(p.ilosc)} {p.jedn}</strong> · {p.opakowania} op. po {fmtIlosc(p.opakowanie)} {p.jedn}</Wiersz>)}
          <Przycisk className="mt-3" onClick={doListy}>Dodaj do listy zakupów zlecenia</Przycisk>
        </Karta>
      </div>}
      {zak === 'ruchy' && (ruchy.length === 0 ? <Pusto tytul="Brak ruchów magazynowych" /> : (
        <ul className="space-y-2">{[...ruchy].sort((a, b) => b.data.localeCompare(a.data)).map((r) => { const m = materialy.find((x) => x.id === r.materialId); return (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-linia bg-karta p-3">
            <div className="min-w-0 flex-1"><div className="truncate font-medium">{m?.nazwa ?? 'Materiał usunięty'}</div><div className="truncate text-sm text-przygasz">{fmtData(r.data)}{r.zlecenieId ? ` · ${zlecenia.find((z) => z.id === r.zlecenieId)?.klient ?? ''}` : ''}{r.opis ? ` · ${r.opis}` : ''}</div></div>
            <span className={`liczby font-semibold ${r.ilosc < 0 ? 'text-zle' : 'text-dobrze'}`}>{r.ilosc > 0 ? '+' : '−'}{fmtIlosc(Math.abs(r.ilosc))} {m?.jedn}</span>
            {(kto === 'wlasciciel' || r.utworzyl === kto) && <button type="button" aria-label="Usuń ruch" className="grid h-10 w-10 place-items-center text-przygasz" onClick={() => usuwanie('ruch magazynowy', () => usun('ruchy', r.id))}>✕</button>}
          </li>); })}
        </ul>))}
      {edycja && <FormularzMaterialu material={edycja === 'nowy' ? undefined : edycja} onClose={() => setEdycja(null)} />}
      {ruch && <FormularzRuchu material={ruch} onClose={() => setRuch(null)} />}
    </>
  );
}
