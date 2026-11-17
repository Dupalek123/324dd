# Beskid Floor Panel

Aplikacja do prowadzenia małej firmy wykonawczej (mikrocement): klienci, zapytania, oferty z PDF, zlecenia, koszty, godziny, dojazdy, materiały, rozliczenie wspólników, dokumenty dla klienta, kalendarz, raporty. W całości po polsku, pod telefon, działa bez internetu.

## Szybki start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 91 testów: obliczenia, rozliczenia, migracja, scalanie, SQL
npm run build      # wersja produkcyjna w dist/
npm run preview    # podgląd wersji produkcyjnej (z service workerem)
```

Bez żadnej konfiguracji aplikacja startuje w **trybie lokalnym**: dane są w przeglądarce (IndexedDB), nie ma kont ani synchronizacji. Na ekranie startowym można włączyć **dane demo** i podejrzeć widok Wspólnika.

## Zmienne środowiskowe

Skopiuj `.env.example` do `.env.local`:

| Zmienna | Do czego |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | konta, synchronizacja, kopie w chmurze |
| `VITE_GOOGLE_CLIENT_ID` | Gmail i Kalendarz Google (opcjonalnie) |

## Supabase (konta i synchronizacja)

1. Załóż projekt na supabase.com (region UE, np. Frankfurt).
2. **Migracje bazy:** w SQL Editor uruchom po kolei pliki z `supabase/migrations/` (`0001_schemat.sql`, potem `0002_pliki.sql`). Albo z CLI: `supabase link --project-ref <ref>` i `supabase db push`.
3. Project Settings → API: przepisz `Project URL` i klucz `anon` do `.env.local`.
4. Authentication → URL Configuration: wpisz adres wdrożonej aplikacji jako Site URL.
5. Pierwsze logowanie: **Załóż konto** → **Załóż firmę** (to konto zostaje Właścicielem).
6. Wspólnik: Ustawienia → Wspólnicy i uprawnienia → **Zaproś** (e-mail). Wspólnik zakłada konto na ten adres i po zalogowaniu trafia do firmy.

Kolejne zmiany schematu dodawaj jako nowe pliki `supabase/migrations/000N_*.sql` (obecne są napisane tak, że można je uruchomić ponownie).

### Wypełnianie ofert modelem językowym (opcjonalnie)

```bash
supabase functions deploy wyciagnij-dane
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Funkcja używa modelu `claude-opus-5-5` (zmiana: sekret `ANTHROPIC_MODEL`). Klucz API zostaje na serwerze. Bez tej funkcji, bez sieci albo przy błędzie działa prostszy parser wbudowany w aplikację. W obu przypadkach dane najpierw pokazują się do akceptacji.

### Odczyt paragonów ze zdjęcia (opcjonalnie)

W formularzu kosztu po wybraniu zdjęcia paragonu dane (data, sprzedawca, pozycje, kwoty, stawki VAT) odczytują się same i pokazują do akceptacji; do formularza trafiają dopiero po kliknięciu „Wstaw do formularza”. Netto liczy się osobno dla każdej stawki VAT, tak jak w podsumowaniu PTU na paragonie. Działa po zalogowaniu kontem i z internetem.

```bash
supabase functions deploy skanuj-paragon
```

Używa tego samego sekretu `ANTHROPIC_API_KEY` co `wyciagnij-dane` i płatnego konta API Anthropic (osobnego od abonamentu na czat). Model domyślny to `claude-opus-5-5`; tańszy model ustawisz sekretem `ANTHROPIC_MODEL` (sprawdź jakość odczytu na kilku własnych paragonach). Zdjęcie nie jest nigdzie zapisywane przez funkcję. Bez funkcji formularz kosztu działa jak dotąd, a dane wpisujesz ręcznie.

## Google OAuth (Gmail i Kalendarz, opcjonalnie)

1. console.cloud.google.com → nowy projekt → włącz **Gmail API** i **Google Calendar API**.
2. OAuth consent screen: typ External, dodaj siebie i wspólnika jako Test users. Zakresy: `gmail.readonly`, `gmail.send`, `calendar.events`.
3. Credentials → Create OAuth client ID → **Web application**. W „Authorized JavaScript origins” wpisz adres aplikacji (i `http://localhost:5173` do pracy lokalnej).
4. Client ID wpisz jako `VITE_GOOGLE_CLIENT_ID` i przebuduj aplikację.
5. W aplikacji: Ustawienia → Integracje → filtr wiadomości (np. `label:zapytania`) i identyfikator kalendarza.

Aplikacja tylko czyta pocztę. Wysyłka oferty i zapis w kalendarzu zawsze pokazują okno z potwierdzeniem.

## Wdrożenie (Vercel albo Netlify)

- Build command: `npm run build`, katalog wyjściowy: `dist`.
- Ustaw zmienne `VITE_*` w panelu hostingu.
- Routing jest oparty na `#`, więc nie trzeba żadnych przekierowań.
- Wymagany HTTPS (oba hostingi dają go domyślnie) – bez niego nie działa instalacja PWA.
- Na telefonie: otwórz adres → menu przeglądarki → **Dodaj do ekranu głównego**.

## Jak to działa

- **Offline:** aplikacja czyta i zapisuje wyłącznie w lokalnej bazie. Service worker trzyma w pamięci całą aplikację (także generator PDF i eksport XLSX).
- **Synchronizacja bez nadpisywania:** każdy rekord (zlecenie, koszt, wpis godzin…) jest osobnym wierszem, a każde pole ma własny znacznik czasu. Serwer scala zmiany pole po polu (`sync_push`), więc dwie osoby mogą jednocześnie zmienić różne pola tego samego zlecenia. Przy zmianie tego samego pola wygrywa późniejsza. Usunięcie to też pole, więc da się je cofnąć.
- **Uprawnienia Wspólnika** egzekwuje baza: tabela `rekordy` nie ma polityk zapisu, a funkcja `sync_pull` wycina kwoty, koszty, klientów i rozliczenie właściciela, zanim dane trafią na telefon wspólnika. Uprawnienia włącza się w Ustawieniach.
- **Historia zmian** (kto, kiedy, co) i **Cofnij** po każdej akcji.
- **Kopie:** Ustawienia → Kopie zapasowe: JSON (całość ze zdjęciami), XLSX, CSV, import. W trybie z kontem raz na dobę powstaje kopia JSON w magazynie Supabase.
- **RODO:** w kartotece klienta eksport jego danych do pliku oraz trwałe usunięcie danych osobowych (także z ofert, zleceń, dokumentów i historii).

## Migracja ze starego prototypu

Ustawienia → Kopie zapasowe i eksport → **Wczytaj kopię (JSON)**. Plik ze starego prototypu (`set`, `zl`, `gd`, `ko`, `of`) jest rozpoznawany automatycznie. Import niczego nie kasuje, a ponowne wczytanie tego samego pliku nie tworzy duplikatów. Po imporcie pojawia się podsumowanie z listą rzeczy do sprawdzenia.

## Struktura

```
src/lib/        czyste funkcje: kwoty, obliczenia, raporty, migracja, scalanie, uprawnienia
src/db/         IndexedDB (Dexie), synchronizacja, kopie, dane demo
src/pdf/        definicje dokumentów PDF (pdfmake)
src/google/     Gmail i Kalendarz
src/widoki/     ekrany aplikacji
supabase/       migracje SQL i funkcja Edge
tests/          testy (Vitest; SQL na Postgresie w WASM)
```

## Założenia

- Repozytorium: projekt jest w `324dd` (drugie repozytorium z sesji zostało puste).
- Są dokładnie dwie osoby o stałych rolach: Właściciel i Wspólnik.
- Dojazd zapisuje się jako Koszt z kategorią Transport i polami km/litry (nie jako osobna tabela). Wynik kalkulatora jest kwotą **brutto** (cena na stacji), netto liczy się ze stawki VAT.
- Koszt ogólny firmy obniża wynik zlecenia dopiero po rozksięgowaniu. Nierozksięgowana część jest widoczna w raportach okresowych.
- Rozliczenie i raporty liczą zlecenia wg daty zakończenia (gdy jej brak – daty startu). Saldo do wypłaty = należne z zakończonych zleceń − wypłaty.
- Strata w trybie RAZEM dzieli się tym samym procentem; w trybie godzinowym pomocnik dostaje stawkę także przy stracie.
- Wspólnik bez dodatkowych uprawnień widzi w Rozliczeniu tylko swoje godziny × stawka i swoje wypłaty.
- Stary format: `pan` = przełącznik „niestandardowe”, `term` = start prac w dniach (tekst trafia do uwag), `od`/`os` = imię lub indeks osoby, nieznana kategoria kosztu → „Inne” z dopiskiem. Koszt lub godziny z nieistniejącym zleceniem są importowane bez przypisania.
- Wartości startowe do zmiany w Ustawieniach: stawka pomocnika 40 zł/h, spalanie 8 l/100 km, paliwo 6,50 zł/l. Zużycia materiałów są **orientacyjne** – nie pochodzą z kart technicznych.
- Parametry podatku i ZUS są puste; moduł jest wyłączony, dopóki ich nie wpiszesz.
- Teksty oferty, umowy, protokołu i instrukcji pielęgnacji są napisane od zera. Umowę warto raz pokazać prawnikowi.
- Odległość z mapy korzysta z publicznych serwerów OpenStreetMap (Nominatim, OSRM) i wysyła tam oba adresy – tylko po naciśnięciu przycisku.

## Do zrobienia po wdrożeniu

1. Założyć projekt Supabase, uruchomić migracje, wpisać zmienne, wdrożyć na Vercel/Netlify.
2. **Sprawdzić na dwóch telefonach** synchronizację i widok Wspólnika. Logika jest przetestowana automatycznie (także SQL), ale nie była uruchamiana na prawdziwym projekcie Supabase.
3. Skonfigurować Google OAuth i sprawdzić Gmail oraz Kalendarz – ta część nie mogła być przetestowana bez konta.
4. Wdrożyć funkcję `wyciagnij-dane` i dodać klucz API (również nietestowana na żywo).
5. Uzupełnić dane firmy, logo, rachunek, cennik i zużycia materiałów z kart technicznych.
6. Wczytać kopię JSON ze starego prototypu i przejrzeć ostrzeżenia importu.
7. W Supabase włączyć potwierdzanie e-maila i ustawić własny SMTP, jeśli limity wbudowanej poczty okażą się za małe.
8. Podpisać z Supabase umowę powierzenia danych (DPA) – dostępna w panelu.

Znane ograniczenia: znaczniki czasu pochodzą z zegarów telefonów (mocno przestawiony zegar może wygrywać konflikty); wydarzenia z Kalendarza Google są pobierane na żądanie i nie są zapisywane offline; proforma jest dokumentem pomocniczym, a nie fakturą (fakturowanie i KSeF są poza zakresem).
