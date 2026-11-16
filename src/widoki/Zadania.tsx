import { useState } from 'react';
import { zmien } from '../db/baza';
import { imie, useKto, useTabela, useUst } from '../db/hooki';
import { dzis, fmtData } from '../lib/kwoty';
import type { Zadanie } from '../lib/typy';
import { kl, Naglowek, pasuje, PasekListy, Przycisk, Pusto, Znaczek, type StanListy } from '../ui/komponenty';
import { FormularzZadania } from './formularze';

export default function Zadania() {
  const ust = useUst();
  const kto = useKto();
  const zadania = useTabela('zadania');
  const zlecenia = useTabela('zlecenia');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'termin', filtr: 'otwarte' });
  const [okno, setOkno] = useState<Zadanie | 'nowe' | null>(null);
  const lista = zadania
    .filter((t) => stan.filtr === 'wszystkie' || (stan.filtr === 'otwarte' && !t.zrobione) || (stan.filtr === 'zrobione' && t.zrobione) || (stan.filtr === 'moje' && !t.zrobione && (t.osoba === kto || !t.osoba)))
    .filter((t) => pasuje(stan.szukaj, t.tytul, t.opis))
    .sort((a, b) => stan.sort === 'nazwa' ? a.tytul.localeCompare(b.tytul, 'pl') : Number(a.zrobione) - Number(b.zrobione) || (a.termin ?? '9999').localeCompare(b.termin ?? '9999'));
  return (
    <>
      <Naglowek tytul="Zadania" akcje={<Przycisk wariant="glowny" onClick={() => setOkno('nowe')}>+ Nowe zadanie</Przycisk>} />
      <PasekListy stan={stan} onChange={setStan} filtry={[{ w: 'otwarte', e: 'Do zrobienia' }, { w: 'moje', e: 'Moje' }, { w: 'zrobione', e: 'Zrobione' }, { w: 'wszystkie', e: 'Wszystkie' }]} sorty={[{ w: 'termin', e: 'Wg terminu' }, { w: 'nazwa', e: 'Alfabetycznie' }]} />
      {lista.length === 0 ? <Pusto tytul={zadania.length ? 'Nic nie pasuje do filtrów' : 'Brak zadań'} opis="Zadania i przypomnienia widzą obie osoby. Możesz przypisać je do zlecenia i ustawić termin." /> : (
        <ul className="space-y-2">
          {lista.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded-2xl border border-linia bg-karta p-2 pl-3">
              <input type="checkbox" aria-label={`Zrobione: ${t.tytul}`} checked={t.zrobione} onChange={(e) => zmien('zadania', t.id, { zrobione: e.target.checked }, { etykieta: 'Zmieniono zadanie' })} className="h-6 w-6 shrink-0 accent-[var(--akcent)]" />
              <button type="button" onClick={() => setOkno(t)} className="min-h-11 min-w-0 flex-1 text-left">
                <div className={kl('truncate font-medium', t.zrobione && 'text-przygasz line-through')}>{t.tytul}</div>
                <div className="truncate text-sm text-przygasz">{[t.osoba && imie(ust, t.osoba), zlecenia.find((z) => z.id === t.zlecenieId)?.klient].filter(Boolean).join(' · ')}</div>
              </button>
              {t.termin && <Znaczek ton={!t.zrobione && t.termin < dzis() ? 'zle' : t.termin === dzis() ? 'uwaga' : 'szary'}>{fmtData(t.termin)}</Znaczek>}
            </li>
          ))}
        </ul>
      )}
      {okno && <FormularzZadania zadanie={okno === 'nowe' ? undefined : okno} onClose={() => setOkno(null)} />}
    </>
  );
}
