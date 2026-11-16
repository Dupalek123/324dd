import { useState } from 'react';
import { otworzBaze } from '../db/baza';
import { wczytajDemo } from '../db/demo';
import { ustawSesje } from '../db/sesja';
import { chmuraSkonfigurowana, mojaOrg, resetHasla, supabase, utworzOrg, zaloguj, zarejestruj } from '../db/sync';
import type { OsobaId } from '../lib/typy';
import { Karta, Pole, Przelacznik, Przycisk } from '../ui/komponenty';

export default function Logowanie() {
  const [email, setEmail] = useState('');
  const [haslo, setHaslo] = useState('');
  const [firma, setFirma] = useState('Beskid Floor');
  const [krok, setKrok] = useState<'logowanie' | 'firma'>('logowanie');
  const [blad, setBlad] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [czeka, setCzeka] = useState(false);
  const [demo, setDemo] = useState(false);

  const wejdz = async () => {
    const org = await mojaOrg();
    if (!org) { setKrok('firma'); return; }
    ustawSesje({ tryb: 'chmura', osoba: org.rola, orgId: org.org_id, email: org.email || email });
  };
  const wykonaj = async (f: () => Promise<void>) => {
    setBlad(null); setInfo(null); setCzeka(true);
    try { await f(); } catch (e) { setBlad((e as Error).message); } finally { setCzeka(false); }
  };
  const waliduj = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Wpisz poprawny adres e-mail.');
    if (haslo.length < 6) throw new Error('Hasło musi mieć co najmniej 6 znaków.');
  };
  const lokalnie = async (osoba: OsobaId) => {
    if (demo) {
      const d = otworzBaze('bf-lokalna', 'wlasciciel');
      if ((await d.tab('zlecenia').count()) === 0) await wczytajDemo();
    }
    ustawSesje({ tryb: 'lokalny', osoba });
  };

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <div className="text-center">
        <img src="./ikona.svg" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Beskid Floor Panel</h1>
        <p className="mt-1 text-sm text-przygasz">Zlecenia, oferty, koszty, godziny i rozliczenia w jednym miejscu.</p>
      </div>

      {chmuraSkonfigurowana && krok === 'logowanie' && (
        <Karta tytul="Logowanie">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void wykonaj(async () => { waliduj(); await zaloguj(email, haslo); await wejdz(); }); }}>
            <Pole etykieta="E-mail" type="email" autoComplete="email" value={email} onChange={setEmail} />
            <Pole etykieta="Hasło" type="password" autoComplete="current-password" value={haslo} onChange={setHaslo} />
            {blad && <p role="alert" className="text-sm text-zle">{blad}</p>}
            {info && <p className="text-sm text-dobrze">{info}</p>}
            <div className="flex flex-wrap gap-2">
              <Przycisk type="submit" wariant="glowny" disabled={czeka} className="flex-1">Zaloguj</Przycisk>
              <Przycisk disabled={czeka} className="flex-1" onClick={() => wykonaj(async () => {
                waliduj();
                if (await zarejestruj(email, haslo)) await wejdz(); else setInfo('Konto utworzone. Potwierdź adres e-mail (link w wiadomości), a potem zaloguj się.');
              })}>Załóż konto</Przycisk>
            </div>
            <button type="button" className="text-sm text-akcent underline-offset-2 hover:underline" onClick={() => wykonaj(async () => {
              if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Wpisz adres e-mail, na który wysłać link.');
              await resetHasla(email); setInfo('Wysłano link do ustawienia nowego hasła.');
            })}>Nie pamiętam hasła</button>
          </form>
        </Karta>
      )}

      {chmuraSkonfigurowana && krok === 'firma' && (
        <Karta tytul="Nowa firma">
          <p className="mb-3 text-sm text-przygasz">To konto nie należy jeszcze do żadnej firmy. Jeśli jesteś właścicielem – załóż ją. Jeśli jesteś wspólnikiem, poproś właściciela o zaproszenie na adres {email} (Ustawienia → Wspólnicy) i zaloguj się ponownie.</p>
          <div className="space-y-3">
            <Pole etykieta="Nazwa firmy" value={firma} onChange={setFirma} />
            {blad && <p role="alert" className="text-sm text-zle">{blad}</p>}
            <div className="flex gap-2">
              <Przycisk wariant="glowny" disabled={czeka} onClick={() => wykonaj(async () => { await utworzOrg(firma); await wejdz(); })}>Załóż firmę</Przycisk>
              <Przycisk disabled={czeka} onClick={() => wykonaj(wejdz)}>Sprawdź zaproszenie</Przycisk>
              <Przycisk wariant="cichy" onClick={async () => { await supabase?.auth.signOut(); setKrok('logowanie'); }}>Wróć</Przycisk>
            </div>
          </div>
        </Karta>
      )}

      <Karta tytul={chmuraSkonfigurowana ? 'Bez konta (tylko to urządzenie)' : 'Tryb lokalny'}>
        <p className="mb-2 text-sm text-przygasz">
          {chmuraSkonfigurowana ? 'Dane zostają w tej przeglądarce i nie są synchronizowane.' : 'Synchronizacja nie jest skonfigurowana (brak zmiennych VITE_SUPABASE_* – patrz README). Aplikacja działa w pełni lokalnie: dane zostają w tej przeglądarce.'}
        </p>
        <Przelacznik etykieta="Wczytaj przykładowe dane demo" value={demo} onChange={setDemo} opis="Tylko gdy baza jest pusta." />
        <div className="mt-2 flex flex-wrap gap-2">
          <Przycisk wariant={chmuraSkonfigurowana ? 'zwykly' : 'glowny'} className="flex-1" onClick={() => lokalnie('wlasciciel')}>Wejdź jako Właściciel</Przycisk>
          <Przycisk className="flex-1" onClick={() => lokalnie('wspolnik')}>Podgląd: Wspólnik</Przycisk>
        </div>
      </Karta>
    </div>
  );
}
