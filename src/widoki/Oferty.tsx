import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTabela } from '../db/hooki';
import { dzis, fmtData, zl } from '../lib/kwoty';
import { sumaOferty } from '../lib/obliczenia';
import { STATUSY_OFERT } from '../lib/typy';
import { Naglowek, pasuje, PasekListy, Przycisk, Pusto, tonStatusu, Znaczek, type StanListy } from '../ui/komponenty';

export default function Oferty() {
  const nav = useNavigate();
  const oferty = useTabela('oferty');
  const [stan, setStan] = useState<StanListy>({ szukaj: '', sort: 'data', filtr: 'wszystkie' });
  const lista = oferty.filter((o) => stan.filtr === 'wszystkie' || o.status === stan.filtr || (stan.filtr === 'followup' && o.status === 'wysłana' && !!o.followUp && o.followUp <= dzis()))
    .filter((o) => pasuje(stan.szukaj, o.nr, o.klient, o.adres, o.telefon, o.email, o.system))
    .map((o) => ({ o, s: sumaOferty(o) }))
    .sort((a, b) => stan.sort === 'klient' ? a.o.klient.localeCompare(b.o.klient, 'pl') : stan.sort === 'kwota' ? b.s.netto - a.s.netto : b.o.data.localeCompare(a.o.data) || b.o.nr.localeCompare(a.o.nr));
  return (
    <>
      <Naglowek tytul="Oferty" akcje={<Przycisk wariant="glowny" onClick={() => nav('/oferty/nowa')}>+ Nowa oferta</Przycisk>} />
      <PasekListy stan={stan} onChange={setStan} etykietaFiltra="Status" filtry={[{ w: 'wszystkie', e: 'Wszystkie' }, { w: 'followup', e: 'Do przypomnienia' }, ...STATUSY_OFERT.map((s) => ({ w: s, e: s[0].toUpperCase() + s.slice(1) }))]}
        sorty={[{ w: 'data', e: 'Wg daty' }, { w: 'klient', e: 'Wg klienta' }, { w: 'kwota', e: 'Wg kwoty' }]} />
      {lista.length === 0 ? <Pusto tytul={oferty.length ? 'Nic nie pasuje do filtrów' : 'Nie ma jeszcze ofert'} opis="Wklej maila lub SMS-a od klienta, a formularz wypełni się sam. Gotową ofertę pobierzesz jako PDF." akcja={<Przycisk wariant="glowny" onClick={() => nav('/oferty/nowa')}>+ Nowa oferta</Przycisk>} /> : (
        <ul className="space-y-2">
          {lista.map(({ o, s }) => (
            <li key={o.id}><Link to={`/oferty/${o.id}`} className="block rounded-2xl border border-linia bg-karta p-3.5 hover:border-akcent">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><div className="truncate text-[17px] font-semibold">{o.klient || '(bez klienta)'}</div><div className="truncate text-sm text-przygasz">{o.nr} · {fmtData(o.data)} · {o.system}</div></div>
                <div className="flex flex-col items-end gap-1"><Znaczek ton={tonStatusu(o.status)}>{o.status}</Znaczek>{o.status === 'wysłana' && o.followUp && o.followUp <= dzis() && <Znaczek ton="zle">przypomnij</Znaczek>}</div>
              </div>
              <div className="mt-1.5 flex justify-between text-sm"><span className="truncate text-przygasz">{s.wiersze.length} poz.{s.m2 ? ` · ${String(s.m2).replace('.', ',')} m²` : ''}</span><span className="liczby font-medium">{zl(s.netto)} netto · {zl(s.brutto)} brutto</span></div>
            </Link></li>
          ))}
        </ul>
      )}
    </>
  );
}
