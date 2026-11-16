import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { widoczneZleceniaWspolnika, widokRekordu } from '../lib/uprawnienia';
import type { OsobaId, Tabela, TypyTabel, Ustawienia, Zlecenie } from '../lib/typy';
import { db, ID_USTAWIEN, zDomyslnymi } from './baza';
import { useSesja } from './sesja';

export function useKto(): OsobaId {
  return useSesja()?.osoba ?? 'wlasciciel';
}

export function useUst(): Ustawienia {
  const kto = useKto();
  const surowe = useLiveQuery(() => db().tab('ustawienia').get(ID_USTAWIEN), []);
  return useMemo(() => {
    const pelne = zDomyslnymi(surowe);
    return kto === 'wlasciciel' ? pelne : zDomyslnymi(widokRekordu('ustawienia', surowe ?? ({} as Ustawienia), kto, pelne.uprawnienia) as Ustawienia);
  }, [surowe, kto]);
}

/** Żywa lista rekordów tabeli: bez usuniętych i tylko to, co wolno zobaczyć zalogowanej osobie. */
export function useTabela<T extends Tabela>(tabela: T): TypyTabel[T][] {
  const kto = useKto();
  const ust = useUst();
  const wiersze = useLiveQuery(() => db().tab(tabela).toArray(), [tabela]);
  const zlecenia = useLiveQuery<Zlecenie[]>(async () => (kto === 'wspolnik' && tabela === 'pliki' ? await db().tab('zlecenia').toArray() : []), [kto, tabela]);
  return useMemo(() => {
    const zywe = (wiersze ?? []).filter((r) => !r.usuniety);
    if (kto === 'wlasciciel') return zywe;
    const widoczne = widoczneZleceniaWspolnika(zlecenia ?? [], ust.uprawnienia);
    return zywe.map((r) => widokRekordu(tabela, r, kto, ust.uprawnienia, widoczne)).filter((r): r is TypyTabel[T] => r !== null);
  }, [wiersze, kto, ust.uprawnienia, tabela, zlecenia]);
}

export const imie = (ust: Ustawienia, o: OsobaId | null | undefined): string => (o ? ust.ludzie[o]?.imie ?? o : '–');
