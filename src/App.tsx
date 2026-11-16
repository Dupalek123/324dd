import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { naCofniecie, otworzBaze } from './db/baza';
import { useUst } from './db/hooki';
import { ustawSesje, useSesja, useSync } from './db/sesja';
import { supabase, synchronizuj, uruchomSync, wyloguj } from './db/sync';
import { fmtCzas } from './lib/kwoty';
import { widoczneSekcje } from './lib/uprawnienia';
import { Ikona } from './ui/ikony';
import { DostawcaPytan, kl, Komunikaty } from './ui/komponenty';
import Logowanie from './widoki/Logowanie';
import Pulpit from './widoki/Pulpit';

const L = (f: () => Promise<{ default: React.ComponentType }>) => lazy(f);
const Zlecenia = L(() => import('./widoki/Zlecenia'));
const KartaZlecenia = L(() => import('./widoki/KartaZlecenia'));
const Oferty = L(() => import('./widoki/Oferty'));
const FormularzOferty = L(() => import('./widoki/FormularzOferty'));
const Klienci = L(() => import('./widoki/Klienci'));
const Koszty = L(() => import('./widoki/Koszty'));
const Dojazdy = L(() => import('./widoki/Dojazdy'));
const Godziny = L(() => import('./widoki/Godziny'));
const Materialy = L(() => import('./widoki/Materialy'));
const Rozliczenie = L(() => import('./widoki/Rozliczenie'));
const Dokumenty = L(() => import('./widoki/Dokumenty'));
const Kalendarz = L(() => import('./widoki/Kalendarz'));
const Poczta = L(() => import('./widoki/Poczta'));
const Raporty = L(() => import('./widoki/Raporty'));
const Zadania = L(() => import('./widoki/Zadania'));
const Ustawienia = L(() => import('./widoki/Ustawienia'));

const MENU: { do: string; n: string; e: string }[] = [
  { do: '/', n: 'pulpit', e: 'Pulpit' }, { do: '/zlecenia', n: 'zlecenia', e: 'Zlecenia' }, { do: '/oferty', n: 'oferty', e: 'Oferty' },
  { do: '/godziny', n: 'godziny', e: 'Godziny' }, { do: '/klienci', n: 'klienci', e: 'Klienci' }, { do: '/koszty', n: 'koszty', e: 'Koszty' },
  { do: '/dojazdy', n: 'dojazdy', e: 'Dojazdy' }, { do: '/materialy', n: 'materialy', e: 'Materiały' }, { do: '/rozliczenie', n: 'rozliczenie', e: 'Rozliczenie' },
  { do: '/zadania', n: 'zadania', e: 'Zadania' }, { do: '/dokumenty', n: 'dokumenty', e: 'Dokumenty' }, { do: '/kalendarz', n: 'kalendarz', e: 'Kalendarz' },
  { do: '/poczta', n: 'poczta', e: 'Poczta' }, { do: '/raporty', n: 'raporty', e: 'Raporty' }, { do: '/ustawienia', n: 'ustawienia', e: 'Ustawienia' },
];

function StanSynchronizacji() {
  const s = useSync();
  const sesja = useSesja()!;
  if (sesja.tryb === 'lokalny') return <span className="text-xs text-przygasz" title="Dane tylko na tym urządzeniu">● Tryb lokalny</span>;
  const opis = { wylaczona: 'Synchronizacja wyłączona', offline: `Offline${s.oczekuje ? ` · ${s.oczekuje} do wysłania` : ''}`, trwa: 'Synchronizuję…', ok: 'Zsynchronizowano', blad: 'Błąd synchronizacji' }[s.status];
  const kolor = { wylaczona: 'text-przygasz', offline: 'text-uwaga', trwa: 'text-przygasz', ok: 'text-dobrze', blad: 'text-zle' }[s.status];
  return (
    <button type="button" onClick={() => void synchronizuj()} className={kl('min-h-9 rounded-lg px-2 text-xs', kolor)}
      title={s.blad && s.status === 'blad' ? s.blad : s.ostatnia ? `Ostatnio: ${fmtCzas(s.ostatnia)}` : 'Synchronizuj teraz'}>● {opis}</button>
  );
}

function Powloka() {
  const sesja = useSesja()!;
  const ust = useUst();
  const sekcje = widoczneSekcje(sesja.osoba, ust.uprawnienia);
  const menu = MENU.filter((m) => sekcje[m.n] !== false);
  const [wiecej, setWiecej] = useState(false);
  const lok = useLocation();
  useEffect(() => { setWiecej(false); window.scrollTo(0, 0); }, [lok.pathname]);
  const dol = menu.slice(0, 4);
  const link = ({ isActive }: { isActive: boolean }) => kl('flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium', isActive ? 'bg-akcent-tlo text-akcent-mocny' : 'text-przygasz hover:bg-wglebienie hover:text-tekst');
  const wyjdz = async () => { if (sesja.tryb === 'chmura') await wyloguj(); ustawSesje(null); };
  return (
    <div className="min-h-full lg:flex">
      <a href="#tresc" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-karta focus:p-3">Przejdź do treści</a>
      <aside className="bez-druku hidden w-60 shrink-0 flex-col border-r border-linia bg-karta p-3 lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="mb-3 flex items-center gap-2 px-2 py-2"><img src="./ikona.svg" alt="" className="h-9 w-9 rounded-lg" /><div><div className="font-semibold leading-tight">{ust.firma.nazwa || 'Beskid Floor'}</div><div className="text-xs text-przygasz">{ust.ludzie[sesja.osoba].imie} · {sesja.osoba === 'wlasciciel' ? 'Właściciel' : 'Wspólnik'}</div></div></div>
        <nav aria-label="Menu główne" className="flex-1 space-y-0.5 overflow-y-auto">{menu.map((m) => <NavLink key={m.do} to={m.do} end={m.do === '/'} className={link}><Ikona n={m.n} className="h-5 w-5" />{m.e}</NavLink>)}</nav>
        <div className="mt-2 flex items-center justify-between border-t border-linia pt-2"><StanSynchronizacji /><button type="button" onClick={wyjdz} className="min-h-9 rounded-lg px-2 text-xs text-przygasz hover:text-tekst">Wyloguj</button></div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="bez-druku sticky top-0 z-30 flex items-center justify-between border-b border-linia bg-tlo/95 px-4 py-1.5 backdrop-blur lg:hidden">
          <span className="text-sm font-semibold">{ust.firma.nazwa || 'Beskid Floor'} <span className="font-normal text-przygasz">· {ust.ludzie[sesja.osoba].imie}</span></span>
          <StanSynchronizacji />
        </div>
        <main id="tresc" className="mx-auto max-w-5xl px-4 pb-28 pt-4 lg:px-8 lg:pb-12 lg:pt-8">
          <Suspense fallback={<div className="py-16 text-center text-przygasz">Wczytywanie…</div>}>
            <Routes>
              <Route path="/" element={<Pulpit />} />
              <Route path="/zlecenia" element={<Zlecenia />} />
              <Route path="/zlecenia/:id" element={<KartaZlecenia />} />
              <Route path="/oferty" element={<Oferty />} />
              <Route path="/oferty/:id" element={<FormularzOferty />} />
              <Route path="/klienci" element={<Klienci />} />
              <Route path="/koszty" element={<Koszty />} />
              <Route path="/dojazdy" element={<Dojazdy />} />
              <Route path="/godziny" element={<Godziny />} />
              <Route path="/materialy" element={<Materialy />} />
              <Route path="/rozliczenie" element={<Rozliczenie />} />
              <Route path="/dokumenty" element={<Dokumenty />} />
              <Route path="/kalendarz" element={<Kalendarz />} />
              <Route path="/poczta" element={<Poczta />} />
              <Route path="/raporty" element={<Raporty />} />
              <Route path="/zadania" element={<Zadania />} />
              <Route path="/ustawienia" element={<Ustawienia />} />
              <Route path="*" element={<Pulpit />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav aria-label="Menu dolne" className="bez-druku fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-linia bg-karta pb-[env(safe-area-inset-bottom)] lg:hidden">
        {dol.map((m) => <NavLink key={m.do} to={m.do} end={m.do === '/'} className={({ isActive }) => kl('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-akcent-mocny' : 'text-przygasz')}><Ikona n={m.n} />{m.e}</NavLink>)}
        <button type="button" onClick={() => setWiecej(true)} aria-expanded={wiecej} className={kl('flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium', wiecej ? 'text-akcent-mocny' : 'text-przygasz')}><Ikona n="wiecej" />Więcej</button>
      </nav>
      {wiecej && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/45 lg:hidden" onClick={() => setWiecej(false)}>
          <div role="dialog" aria-label="Więcej" className="w-full rounded-t-3xl bg-tlo p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-3 gap-2">
              {menu.slice(4).map((m) => <NavLink key={m.do} to={m.do} className="flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border border-linia bg-karta text-xs font-medium text-tekst"><Ikona n={m.n} className="h-6 w-6 text-akcent" />{m.e}</NavLink>)}
            </div>
            <button type="button" onClick={wyjdz} className="mt-3 min-h-11 w-full rounded-xl text-sm text-przygasz">Wyloguj ({sesja.tryb === 'chmura' ? sesja.email : 'tryb lokalny'})</button>
          </div>
        </div>
      )}
      <Komunikaty />
    </div>
  );
}

export default function App() {
  const sesja = useSesja();
  const klucz = sesja ? `${sesja.tryb}:${sesja.orgId ?? 'lokalna'}:${sesja.osoba}` : '';
  // baza musi być otwarta, zanim widoki zaczną czytać dane
  useMemo(() => { if (sesja) otworzBaze(`bf-${sesja.orgId ?? 'lokalna'}`, sesja.osoba); }, [klucz]); // eslint-disable-line
  useEffect(() => {
    if (!sesja) return;
    if (sesja.tryb === 'chmura') {
      uruchomSync();
      // sesja wygasła lub wylogowano w innej karcie
      void supabase?.auth.getSession().then(({ data }) => { if (!data.session && navigator.onLine) ustawSesje(null); });
    }
    return naCofniecie(() => undefined);
  }, [klucz]); // eslint-disable-line
  if (!sesja) return <><Logowanie /><Komunikaty /></>;
  return <DostawcaPytan key={klucz}><Powloka /></DostawcaPytan>;
}
