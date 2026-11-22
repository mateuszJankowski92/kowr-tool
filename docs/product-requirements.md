# Wymagania projektu — KOWR „Zatrzymaj wodę, chroń plony”

**Wersja:** 1.1
**Data opracowania:** 2026-11-21
**Wydarzenie według opisu zadania:** HACKNATION 2026, Bydgoszcz, 21–22 listopada 2026 r.
**Status:** robocza specyfikacja wymagań i propozycja planu; realizację poszczególnych wymagań oraz wyniki walidacji należy potwierdzać osobno.

## 1. Cel i sposób korzystania z dokumentu

Dokument jest kontekstem produktu dla zespołu i agenta programistycznego, w tym Codex. Opisuje oczekiwane zachowanie rozwiązania, zakres konkursowy, kryteria akceptacji, priorytety i nierozstrzygnięte decyzje.

Dokument pozostaje technologicznie neutralnym opisem produktu. W repozytorium wybrano już bazowy stos i utworzono szkielet rozwiązania: monorepo pnpm, frontend React/Vite/TypeScript, API Node.js/Fastify oraz PostgreSQL/PostGIS. Konkretni dostawcy danych, modele i metody obliczeniowe pozostają decyzjami otwartymi, dopóki nie zostaną jawnie zatwierdzone. Samo udostępnienie tego dokumentu nie jest poleceniem rozpoczęcia implementacji; zakres bieżącej pracy wynika z aktualnego zlecenia użytkownika.

### Źródła

- [S1] Przekazany opis zadania konkursowego KOWR „Zatrzymaj wodę, chroń plony – Inteligentne wsparcie gospodarowania wodą w rolnictwie”. Odesłania do paragrafów i rozdziałów poniżej odnoszą się do tego opisu.
- [S2] Ustalenia projektowe zapisane w repozytorium i rozmowie: wybrano bazowy stos oraz strukturę projektu, natomiast dobór konkretnych źródeł, metod analizy i zakresu kolejnych funkcji wymaga osobnych decyzji.
- Publicznie opisane API są kandydatami do późniejszego wyboru źródeł, a nie specyfikacją obowiązkowych integracji.
- W otrzymanej treści [S1] znajduje się odwołanie do załącznika nr 1 „Podstawy naukowe dotyczące Zadania konkursowego”, ale nie ma treści tego załącznika.
- Nie przeanalizowano pełnego regulaminu wydarzenia, dodatkowych FAQ ani instrukcji platformy konkursowej, jeśli nie znalazły się w [S1].

### Oznaczenia

- [K] — wymaganie konkursowe: zapis wynikający wprost z [S1].
- [W] — konsekwencja wymagania: interpretacja niezbędna do realizacji scenariusza lub procedury oceny; nie jest dosłownym cytatem organizatora.
- [P] — propozycja projektowa: zalecenie do planu, które nie ustanawia dodatkowego warunku konkursowego.
- [O] — kwestia otwarta: wymaga doprecyzowania; nie należy przedstawiać jej jako uzgodnionej.
- Wymagania obowiązkowe, preferencje punktowane i funkcje opcjonalne są rozdzielone. Propozycje nie mogą być przedstawiane jako wymagania organizatora, a brak decyzji nie może być przedstawiany jako zaakceptowane rozwiązanie.

## 2. Cel produktu i główny użytkownik

Cel: pomóc rolnikowi ocenić sytuację wodną wskazanej działki oraz wybrać uzasadnione danymi środowiskowymi sposoby ograniczania utraty wilgoci, zwiększania retencji i przeciwdziałania skutkom suszy. Opcjonalnie rozwiązanie wspiera planowanie nawadniania. [K; S1 §2–3]

Głównym użytkownikiem jest rolnik prowadzący gospodarstwo z jedną lub wieloma działkami, bez specjalistycznej wiedzy o GIS, teledetekcji, hydrologii i analizie danych. Wynik ma być prosty, zrozumiały i możliwy do wykorzystania w gospodarstwie. [K; S1 §3.1]

Produkt powinien pomagać odpowiedzieć na pytania:

- Jaka jest sytuacja wodna mojej działki na wskazany dzień?
- Co przemawia za taką oceną i jakie są prawdopodobne przyczyny problemu?
- Jak działka wypada w perspektywie wieloletniej?
- Jakie działania retencyjne i agrotechniczne są uzasadnione w tych warunkach?
- Jak aktualne, dokładne i kompletne są informacje?
- Opcjonalnie: czy, kiedy i w jakim zakresie rozważyć nawadnianie?

### Jednostka scenariusza

Jednostką podstawowego scenariusza jest pojedyncza działka, wybrana uprawa i data analizy. Kontekst gospodarstwa posiadającego wiele działek nie ustanawia obowiązku stworzenia panelu zarządzania całym gospodarstwem. [W; S1 §3.1–3.3]

Rozszerzenie projektowe pozwala zastąpić pojedynczą datę domkniętym zakresem dat. Nie zmienia to
konkursowego minimum dotyczącego analizy na wskazany dzień. [P; decyzja właściciela projektu]

## 3. Zakres obowiązkowy, preferowany i opcjonalny

### 3.1. Obowiązkowy rdzeń

- Działający prototyp aplikacji webowej dostępnej w przeglądarce na komputerze.
- Wskazanie działki; obsługa numeru/identyfikatora potrzebna do testów jury.
- Wybór uprawy i uwzględnienie jej w analizie.
- Obsługa dnia bieżącego i dat historycznych z ostatnich 10 lat.
- Działanie dla dowolnych działek ewidencyjnych w Polsce.
- Wykorzystanie wszystkich wymaganych kategorii danych.
- Ocena sytuacji wodnej dla analizowanej daty i wieloletniej podatności na niedobory.
- Obliczenie wyniku i rekomendacji na podstawie danych źródłowych.
- Rekomendacje retencyjne i agrotechniczne wynikające z wcześniejszej oceny.
- Raport z uzasadnieniem, źródłami, datami, ograniczeniami i informacją o brakach danych.
- Co najmniej jedna możliwość utrwalenia raportu: zapis w systemie, plik albo wydruk.
- Dokumentacja, materiały zgłoszenia i udostępnienie prywatnego repozytorium jury.

> **Podstawa:** [S1 §3–6].

### 3.2. Preferencje i możliwości dodatkowe

| Element                                                                      | Status wynikający z opisu                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Wygenerowanie rekomendacji w czasie nieprzekraczającym 30 sekund dla działki | Preferowany cel jakościowy, nie wskazany jako bezwzględny warunek dyskwalifikacji.    |
| Poprawne działanie na urządzeniach mobilnych                                 | Dodatkowy atut.                                                                       |
| Rekomendacje dotyczące nawadniania                                           | Opcjonalne.                                                                           |
| AI, modele generatywne, uczenie maszynowe                                    | Dopuszczalne, bez obowiązku użycia.                                                   |
| PDF jako format raportu użytkownika                                          | Przykład dopuszczonej formy pliku; nie jedyna wymagana forma utrwalenia.              |
| Publicznie dostępna wersja demonstracyjna                                    | Możliwa forma udostępnienia; opis dopuszcza również instrukcję uruchomienia w README. |
| Zrzuty ekranu i dodatkowe grafiki                                            | Materiały dodatkowe; nie zastępują obowiązkowych elementów.                           |

Podstawa: [S1 §3.2–3.3, §4.1, §4.4, §5.1, §7].

### 3.3. Elementy niewynikające z obowiązkowego minimum

Konta użytkowników, historia konta, powiadomienia, SMS, chatbot, automatyczne rozpoznawanie upraw, prognozowanie plonów, wycena inwestycji, obsługa czujników, analiza wielu działek jednocześnie i dokładne projekty urządzeń retencyjnych są ewentualnymi rozszerzeniami. Nie zakładać ich realizacji bez decyzji o zakresie. [W]

## 4. Podstawowy scenariusz użytkownika

- Rolnik otwiera aplikację w przeglądarce.
- Wskazuje działkę i otrzymuje informację pozwalającą rozpoznać, jaki obszar będzie analizowany.
- Wybiera uprawę.
- Wskazuje datę analizy; możliwa jest data bieżąca albo historyczna.
- Aplikacja pozyskuje lub wykorzystuje wcześniej pozyskane dane źródłowe właściwe dla analizy.
- Aplikacja ocenia sytuację wodną i historyczną podatność na niedobory.
- Na tej podstawie dobiera i uzasadnia rekomendacje retencyjne oraz agrotechniczne.
- Opcjonalnie przedstawia zalecenia dotyczące nawadniania.
- Rolnik otrzymuje raport i może go utrwalić co najmniej jedną obsługiwaną drogą.

### Zasada kolejności

Kolejność rozpoznania warunków i wydania rekomendacji jest obowiązkowa. Przedstawienie ogólnych porad bez analizy działki nie realizuje tego scenariusza. [K; S1 §3.2–3.3]

## 5. Wymagania funkcjonalne

| ID   | Wymaganie                                                                                                                                                                              | Podstawa        |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| F-01 | Podstawowy scenariusz jest dostępny w aplikacji webowej uruchamianej na komputerze bez instalowania dodatkowego oprogramowania przez rolnika.                                          | [K; §3.2, §5.4] |
| F-02 | Użytkownik może wskazać działkę ewidencyjną lub jej lokalizację na mapie. Wskazanie musi pozwolić ustalić analizowany obszar.                                                          | [K/W; §3.2–3.3] |
| F-03 | Obsługiwane jest wskazanie działki przez numer/identyfikator, ponieważ taką ścieżkę przewidziano w testach jury. Format identyfikatora i kontekst numeru należy doprecyzować.          | [K/W; §6]       |
| F-04 | Użytkownik wybiera uprawę, a interpretacja danych i rekomendacje uwzględniają jej rodzaj oraz specyfikę roślinności.                                                                   | [K; §3.2–3.3]   |
| F-05 | Użytkownik lub juror może wybrać dzień bieżący albo datę historyczną mieszczącą się w wymaganym okresie ostatnich 10 lat.                                                              | [K; §6]         |
| F-06 | Rozwiązanie działa dla dowolnych działek ewidencyjnych z obszaru Polski; nie jest ograniczone do przygotowanych przykładów.                                                            | [K; §5.5, §6]   |
| F-07 | Ocena obejmuje sytuację wodną na wybrany dzień oraz historyczną podatność działki na niedobory wody na podstawie danych wieloletnich.                                                  | [K; §3.2–3.3]   |
| F-08 | Wynik i rekomendacje są obliczane przez aplikację na podstawie danych źródłowych. Wyświetlenie wcześniej przygotowanych rekomendacji nie wystarcza.                                    | [K; §3.3 pkt 4] |
| F-09 | Rekomendacje retencyjne wskazują uzasadnione warunkami sposoby i możliwe miejsca zatrzymywania wody w obrębie działki lub gospodarstwa. Uwzględniają m.in. teren, hydrologię i uprawę. | [K; §3.2]       |
| F-10 | Rekomendacje agrotechniczne dotyczą działań ograniczających straty wilgoci i zwiększających retencję glebową, odpowiednich do rozpoznanych warunków i uprawy.                          | [K; §3.2]       |
| F-11 | Każda przedstawiona rekomendacja wynika z wcześniejszej oceny i ma uzasadnienie w danych dotyczących analizowanego obszaru.                                                            | [K; §3.2–3.3]   |
| F-12 | Raport zawiera stan niedoboru wody i jego przyczyny, uzasadnione działania, daty, źródła i ograniczenia. Szczegółowy zakres opisuje sekcja 7.                                          | [K; §3.3 pkt 5] |
| F-13 | Braki danych są komunikowane wprost; prezentacja nie tworzy pozornej precyzji.                                                                                                         | [K; §3.3 pkt 5] |
| F-14 | Raport można utrwalić przez co najmniej jedną drogę: zapis w systemie, plik lub wydruk.                                                                                                | [K; §3.3 pkt 6] |

### Interpretacje funkcjonalne

- Błędny lub niejednoznaczny numer nie może prowadzić do cichego wyboru innej działki. Sposób doprecyzowania lokalizacji pozostaje decyzją projektu. [W; F-02, F-03]
- Wybór uprawy i daty musi wpływać na dobór danych lub ich interpretację. Nie wystarczy zmiana etykiety raportu. Jednocześnie różne wejścia mogą zasadnie prowadzić do podobnego wyniku. [W; F-04, F-05, F-08]
- Brak oznak niedoboru jest prawidłowym wynikiem. Aplikacja nie ma obowiązku wykrywać suszy przy każdej analizie. [W; F-07]
- Stan na dany dzień i podatność wieloletnia to różne wnioski. Możliwy jest wynik „obecnie korzystne warunki, historycznie wysoka podatność”. [W; F-07]
- Wskazanie możliwości retencji nie oznacza obowiązku opracowania projektu hydrotechnicznego, gwarancji skuteczności ani dokładnej objętości zatrzymanej wody. [W; F-09]
- Jeżeli dane nie uzasadniają konkretnego działania, należy ujawnić ograniczenie zamiast przedstawiać zalecenie jako potwierdzone. Raport częściowy nie stanowi ogólnego zwolnienia z realizacji wymaganych kategorii danych. [W; F-11, F-13]

## 6. Wymagania dotyczące danych i wiarygodności

### 6.1. Obowiązkowe kategorie

Poniższe siedem pozycji rozwija pięć kategorii wymienionych w opisie: ostatnia kategoria przestrzenna obejmuje lokalizację, użytkowanie i ukształtowanie terenu. [K; S1 §3.3]

| ID   | Informacja            | Oczekiwana rola                                                                              |
| ---- | --------------------- | -------------------------------------------------------------------------------------------- |
| D-01 | Dane meteorologiczne  | Rozpoznanie warunków pogodowych związanych z dostępnością i utratą wody, również w historii. |
| D-02 | Dane satelitarne      | Informacja o obserwowanej powierzchni i roślinności, interpretowana z uwzględnieniem uprawy. |
| D-03 | Dane glebowe          | Rozpoznanie właściwości gleby istotnych dla gospodarki wodnej.                               |
| D-04 | Dane hydrologiczne    | Rozpoznanie kontekstu wodnego potrzebnego do oceny i zaleceń retencyjnych.                   |
| D-05 | Lokalizacja działki   | Jednoznaczne określenie analizowanego obszaru.                                               |
| D-06 | Użytkowanie terenu    | Rozpoznanie sposobu użytkowania obszaru i istotnego otoczenia.                               |
| D-07 | Ukształtowanie terenu | Rozpoznanie warunków terenowych istotnych dla zatrzymywania i odpływu wody.                  |

Opis roli w ostatniej kolumnie jest interpretacją potrzeb produktu [W], a nie wyborem źródła lub metody.

### 6.2. Zasady pozyskiwania i użycia

- Źródła dobiera zespół. Dostawcy wymienieni przez organizatora są przykładami, nie obowiązkowymi integracjami. [K; §5.2]
- Dane muszą być dostępne bezpłatnie i legalnie, a ich wykorzystanie zgodne z licencją lub innymi warunkami dostawcy. [K; §5.2–5.3]
- Zespół sam pozyskuje dane; KOWR nie dostarcza gotowych pakietów. [K; §5.2]
- Dopuszczalne są dane pobrane lub przetworzone wcześniej. Dokumentacja ma rozróżniać je od danych pozyskiwanych na bieżąco i podawać daty pobrania. [K; §4.2 pkt 5]
- Przygotowanie danych wcześniej nie zastępuje obliczania przez aplikację wyniku i doboru rekomendacji dla zadanej analizy. [K/W; §3.3, §4.2]
- Przechowywanie i ponowne otwieranie rzeczywiście wygenerowanego raportu jest zgodne z wymaganiem zapisu. Nie należy utożsamiać tego z demonstracją opartą wyłącznie na gotowych poradach. [W; §3.3 pkt 4–6]
- Każda wymagana kategoria powinna wnosić informację do oceny, rekomendacji lub ich ograniczeń. Sama dekoracyjna warstwa mapowa nie dowodzi wykorzystania danych w analizie. [W; §3.2–3.3, §7]
- Dane i źródła mają różną rozdzielczość i aktualność. Raport ma ujawniać wynikające z tego ograniczenia. [K/W; §3.3 pkt 5]
- Wyświetlenie publicznej mapy lub dokumentacji API nie jest jeszcze potwierdzeniem możliwości wykorzystania właściwego zbioru danych. [W; §5.2–5.3]

### 6.3. Projektowe zasady wiarygodności

Poniższe zasady [P] rozwijają wymagania naukowej poprawności i transparentności z §2, §3 oraz §7. Nie narzucają algorytmu.

- Rozróżniać obserwację, wynik modelu, wskaźnik pośredni i wniosek.
- Nie przedstawiać pośredniego wskaźnika kondycji roślinności jako bezpośredniego pomiaru wilgotności gleby.
- Uwzględniać sezon i stan roślinności; sam brak zielonej roślinności nie powinien stanowić wystarczającej podstawy rozpoznania suszy.
- Nie deklarować większej dokładności czasowej i przestrzennej niż uzasadniają dane.
- Rozróżniać brak danych, niską jakość danych i brak oznak niedoboru.
- Ujawniać sprzeczne przesłanki i ograniczać pewność wniosków, jeżeli nie da się ich rozstrzygnąć.
- Nie gwarantować oszczędności wody, wzrostu plonu ani skuteczności konkretnego zabiegu bez podstaw.
- Porównanie z innym systemem nie powinno być przedstawiane jako wykonany pomiar terenowy.
- Jeżeli użyto AI, nie przypisywać mu roli źródła nieistniejących obserwacji, parametrów działki ani uzasadnień.

## 7. Wymagana zawartość raportu

Ta sekcja określa treść raportu, nie narzuca układu ekranów ani formatu danych.

- Kontekst analizy: działka, analizowana lokalizacja, uprawa i data analizy. [W; §3.3, §6]
- Sytuacja wodna: ocena stanu niedoboru lub braku oznak niedoboru oraz wskazanie przesłanek i możliwych przyczyn. [K/W; §3.3]
- Podatność wieloletnia: wnioski z historii, rzeczywisty okres odniesienia i istotne ograniczenia jego kompletności. [K/W; §3.3]
- Działania retencyjne: zalecane sposoby i możliwe miejsca zatrzymywania wody, w zakresie uzasadnionym danymi. [K; §3.2]
- Działania agrotechniczne: propozycje odpowiednie do rozpoznanych warunków i uprawy. [K; §3.2]
- Uzasadnienia działań: powiązanie każdej rekomendacji z oceną i wykorzystanymi informacjami. [K; §3.2–3.3]
- Daty i źródła: identyfikacja pochodzenia danych oraz ich aktualności. [K; §3.3]
- Ograniczenia: braki, dokładność, niepewność oraz istotne czynniki nieuwzględnione. [K; §3.3]
- Nawadnianie, jeśli wdrożone: zasadność, termin i zakres wynikające z wcześniejszej oceny. [K — warunkowo; §3.2]

### Proponowane doprecyzowania [P]

- Odróżniać datę analizy, daty obserwacji oraz datę sporządzenia raportu.
- Dla działania podawać jego priorytet lub horyzont czasowy, jeśli wynika to z analizy.
- W utrwalonym raporcie zachowywać źródła i ograniczenia razem z wnioskami.
- Nie wymuszać stałej liczby zaleceń, jeżeli dane nie uzasadniają tylu działań.
- Pokazywać, których części oceny nie można było wykonać.

## 8. Zasady analizy historycznej

Obsługa dat historycznych jest obowiązkowa; poniższe doprecyzowania są propozycją spójności produktu [P], dopóki nie rozstrzygnięto pytań z sekcji 15.

- Ocena stanu na wybraną datę powinna odnosić się do danych właściwych dla tego momentu.
- Nie podmieniać daty historycznej na bieżącą bez poinformowania użytkownika.
- Dla rekonstrukcji stanu na dzień T nie wykorzystywać późniejszych obserwacji jako informacji o stanie w tym dniu bez jawnego, merytorycznego uzasadnienia.
- Odróżnić retrospektywną rekonstrukcję z obecnie dostępnych archiwów od odtwarzania decyzji na podstawie wyłącznie informacji dostępnych w przeszłości.
- Jawnie podać okres odniesienia dla oceny wieloletniej.
- Ujawnić użycie współczesnych granic, map gleby, użytkowania terenu lub hydrografii do analizy historycznej, jeśli brak odpowiednich wersji archiwalnych.
- Proponowana interpretacja pola uprawy dla daty historycznej to „uprawa w analizowanym sezonie”; wymaga potwierdzenia.
- Nie zakładać automatycznie, że wszystkie kategorie danych muszą lub mogą mieć identyczną częstotliwość i pełne dziesięcioletnie szeregi. Dokładne oczekiwanie organizatora pozostaje otwarte.

## 9. Wymagania niefunkcjonalne

| ID   | Wymaganie                                                                                                                                                                              | Status i źródło                                           |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| N-01 | Obsługa przez rolnika bez wiedzy GIS, programowania i samodzielnego przetwarzania danych przestrzennych.                                                                               | Obowiązkowe [K; §3.1, §5.4]                               |
| N-02 | Podstawowe funkcje bez zakupu płatnej licencji przez rolnika i bez specjalistycznego sprzętu.                                                                                          | Obowiązkowe [K; §5.4]                                     |
| N-03 | Prototyp działa w przeglądarce na komputerze. Opis wymienia Windows oraz Chrome, Firefox, Edge, Safari i Opera. Wersje i dokładna macierz system–przeglądarka wymagają doprecyzowania. | Obowiązkowy zapis źródłowy, otwarte szczegóły [K/O; §3.2] |
| N-04 | Możliwość uruchomienia lub prezentacji rozwiązania na podstawie dokumentacji; poprawność i stabilność działania.                                                                       | Obowiązkowe i oceniane [K; §5.1, §6–7]                    |
| N-05 | Podstawowe cyberbezpieczeństwo odpowiednie do zakresu prototypu oraz unikanie zbędnych danych osobowych.                                                                               | Obowiązkowe [K; §5.6]                                     |
| N-06 | Udokumentowane źródła, licencje i warunki danych, bibliotek, komponentów, modeli, usług oraz narzędzi AI.                                                                              | Obowiązkowe [K; §4.2, §5.3]                               |
| N-07 | Opis rozwoju do większej liczby użytkowników: dostępność i limity źródeł, aktualizacja danych, czas odpowiedzi i możliwe koszty.                                                       | Obowiązkowe w dokumentacji [K; §5.5]                      |
| N-08 | Ujawnienie odpłatnych usług lub infrastruktury, przewidywanych kosztów utrzymania i możliwych alternatyw, jeśli występują.                                                             | Obowiązkowe warunkowo [K; §5.4]                           |
| N-09 | Rekomendacje dla pojedynczej działki w czasie nieprzekraczającym 30 sekund.                                                                                                            | Preferowane [K; §7]                                       |
| N-10 | Poprawne działanie na urządzeniach mobilnych.                                                                                                                                          | Dodatkowy atut [K; §3.2]                                  |

Nie ma wymogu wykazania dużej liczby równoczesnych użytkowników ani pełnej wydajności w skali kraju. Wymóg ogólnopolskiego zasięgu działek pozostaje jednak obowiązkowy. [K; §5.5]

Dopuszczenie płatnej infrastruktury nie znosi wymogu legalnej i bezpłatnej dostępności użytych danych ani wymogu dostępności podstawowych funkcji dla rolnika. [W; §5.2, §5.4]

## 10. Kryteria akceptacji

Poniższe scenariusze [P/W] przekładają wymagania na obserwowalne zachowanie. Są propozycją walidacji, a nie informacją, że testy już wykonano. Początkowy status wszystkich pozycji: niezweryfikowane.

| ID    | Scenariusz                                                             | Oczekiwany rezultat                                                                                                        | Powiązanie        |
| ----- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| AC-01 | Wskazanie poprawnego identyfikatora nowej działki                      | Ustalony jest właściwy obszar; możliwe jest rozpoczęcie analizy.                                                           | F-02, F-03        |
| AC-02 | Błędny albo niejednoznaczny numer                                      | Zrozumiały komunikat lub możliwość doprecyzowania; brak cichej analizy innej działki.                                      | F-02, F-03        |
| AC-03 | Działki z różnych regionów Polski, spoza przykładów                    | Dostępny jest ten sam proces analizy bez ograniczenia do regionu demonstracyjnego.                                         | F-06              |
| AC-04 | Analiza na dzień bieżący                                               | Raport odnosi się do wybranej daty i ujawnia rzeczywistą aktualność danych.                                                | F-05, F-07, F-12  |
| AC-05 | Analiza dla daty historycznej, także blisko początku wymaganego okresu | Dane i wynik dotyczą wybranego momentu; okres odniesienia i braki są jawne. Nie następuje cicha zmiana daty.               | F-05, F-07        |
| AC-06 | Zmiana uprawy                                                          | Wybrana uprawa jest uwzględniona w interpretacji i działaniach; wynik nie musi zawsze zmienić kategorii.                   | F-04              |
| AC-07 | Pełna analiza działki                                                  | Można wskazać rolę wszystkich wymaganych kategorii danych i uzyskane z nich informacje.                                    | F-07, D-01–D-07   |
| AC-08 | Kontrolowana zmiana istotnych danych wejściowych                       | Ocena odpowiada zmianie zgodnie z przyjętą metodą; wynik nie jest tylko odtworzoną kartą demonstracyjną.                   | F-08              |
| AC-09 | Ocena bieżąca i wieloletnia prowadzą do różnych wniosków               | Raport przedstawia obie perspektywy bez wymuszania identycznego rozstrzygnięcia.                                           | F-07              |
| AC-10 | Wydanie rekomendacji                                                   | Każde działanie ma uzasadnienie w rozpoznanych warunkach konkretnej analizy.                                               | F-09–F-11         |
| AC-11 | Dane wskazują brak oznak niedoboru                                     | Aplikacja może zwrócić taki wynik; nie tworzy alarmu wyłącznie dla wypełnienia raportu.                                    | F-07, F-13        |
| AC-12 | Brak lub niska jakość części danych                                    | Widoczne są brak, jego przyczyna w dostępnym zakresie i konsekwencje dla wniosków; brak nie staje się zerem ani pewnością. | F-13              |
| AC-13 | Brak podstaw do konkretnego działania                                  | Działanie nie jest przedstawione jako potwierdzone; ograniczenie jest wyjaśnione.                                          | F-11, F-13        |
| AC-14 | Gotowy raport                                                          | Zawiera wszystkie wymagane części, w tym daty, źródła i ograniczenia.                                                      | F-12              |
| AC-15 | Zapis lub wydruk raportu                                               | Obsługiwana droga zachowuje wynik wraz z uzasadnieniami i ograniczeniami.                                                  | F-14              |
| AC-16 | Użytkownik bez wiedzy GIS wykonuje scenariusz                          | Potrafi wskazać działkę, uprawę i datę oraz zrozumieć główne wnioski.                                                      | N-01              |
| AC-17 | Osoba zewnętrzna uruchamia prototyp według dokumentacji                | Prototyp jest osiągalny i można wykonać podstawowy scenariusz.                                                             | N-03, N-04        |
| AC-18 | Pomiar czasu uzyskania rekomendacji                                    | Czas rzeczywisty zostaje odnotowany, także dla nowej działki; porównanie z celem 30 s nie jest udawane jako spełnione.     | N-09, preferencja |
| AC-19 | Przegląd dokumentacji źródeł i komponentów                             | Można ustalić pochodzenie, zakres, daty i warunki użycia.                                                                  | N-06              |
| AC-20 | Audyt zgłoszenia                                                       | Wszystkie obowiązkowe materiały są dostępne; repozytorium pozostaje prywatne i jest dostępne jury.                         | Sekcja 13         |

Wyniki walidacji należy dokumentować z podaniem działki, daty, uprawy, zakresu danych, oczekiwanego zachowania i obserwacji. Nie ustanowiono liczbowej tolerancji błędu ani gwarantowanej zgodności z nieudostępnionymi danymi referencyjnymi jury.

## 11. Sposób oceny przez organizatora

### Etap 1

Jury ocenia dokumentację, repozytorium, film i działanie prototypu. Samodzielnie wybiera działki z całej Polski, podaje ich numer oraz datę bieżącą lub historyczną. Porównuje wyniki z danymi referencyjnymi dostępnymi tylko jury. [K; S1 §6]

### Finał

Finaliści prezentują rozwiązanie i pokazują je na żywo dla 1–3 działek wskazanych przez jury, z numerem działki i datą analizy. [K; S1 §6]

### Wagi

| Kryterium                                        | Waga |
| ------------------------------------------------ | ---- |
| Wartość praktyczna dla użytkownika               | 25%  |
| Wykorzystanie danych i wiarygodność rekomendacji | 25%  |
| Innowacyjność i potencjał rozwojowy              | 20%  |
| Prostota obsługi                                 | 15%  |
| Działający prototyp i jakość techniczna          | 15%  |

Podstawa: [S1 §7].

Konsekwencja dla priorytetów [P]: najpierw zapewnić poprawny, użyteczny i uzasadniony przebieg analizy. Dodatkowe funkcje powinny wzmacniać wartość w tych kryteriach i nie wypierać obowiązkowego zakresu.

## 12. Proponowany plan prac

Plan [P] opisuje rezultaty kolejnych etapów. Nie narzuca technologii, dostawców ani podziału kodu.

| Etap                                 | Cel                                                                                      | Rezultat pozwalający ocenić postęp                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Uporządkowanie zakresu            | Potwierdzić obowiązki, opcje i kluczowe niejasności.                                     | Lista wymagań, rejestr decyzji, uzyskany lub zgłoszony brak załącznika naukowego.       |
| 2. Ustalenie potrzeb informacyjnych  | Określić, jakiej informacji wymaga każdy typ wniosku i działania.                        | Powiązanie kategorii danych z oceną, rekomendacjami i ograniczeniami.                   |
| 3. Potwierdzenie wykonalności danych | Sprawdzić zasięg, historię, jakość i legalną dostępność potrzebnych zbiorów.             | Udokumentowane możliwości i luki; decyzje o źródłach dopiero na podstawie tych ustaleń. |
| 4. Uzgodnienie zasad oceny           | Określić znaczenie wyników, zależności od uprawy, zasady niepewności i podstawy naukowe. | Opis metody i warunków wydawania rekomendacji, możliwy do omówienia z mentorem.         |
| 5. Pełny scenariusz produktu         | Zapewnić drogę od wskazania działki, daty i uprawy do utrwalonego raportu.               | Działający przebieg obejmujący wymagane dane i treści.                                  |
| 6. Walidacja i użyteczność           | Sprawdzić daty, nowe lokalizacje, braki, uzasadnienia i zrozumiałość.                    | Wyniki scenariuszy akceptacji, lista ograniczeń, pomiar czasu.                          |
| 7. Zgłoszenie i demonstracja         | Zapewnić kompletność formalną i gotowość do użycia przez jury.                           | Dokumentacja, prywatne repozytorium z dostępem, film, prezentacja i raporty.            |

### Kolejność ograniczania zakresu przy braku czasu

Najpierw odłożyć funkcje opcjonalne i nieuzgodnione rozszerzenia. Nie usuwać po cichu obowiązkowej daty historycznej, ogólnopolskiego zasięgu, kategorii danych, uzasadnień ani materiałów zgłoszenia. Każdą świadomą rezygnację z wymogu należy odnotować jako lukę zgodności, a nie zmianę treści konkursu. [P]

## 13. Materiały zgłoszenia

### 13.1. Lista obowiązkowa

- Nazwa zespołu i tytuł rozwiązania.
- Zwięzły opis: problem, główne funkcje, wykorzystanie danych i korzyści.
- Link do prywatnego repozytorium.
- README lub równoważna dokumentacja.
- Prezentacja w formacie PDF, maksymalnie 10 slajdów.
- Działający prototyp z linkiem do wersji działającej lub instrukcją uruchomienia w README.
- Film prezentujący działanie, maksymalnie 3 minuty.
- Raport lub raporty rzeczywiście wygenerowane przez prototyp.
- Zapewniony dostęp jury do repozytorium zgodnie z instrukcją organizatora.
- Repozytorium prywatne co najmniej do zakończenia wydarzenia.

> **Podstawa:** [K; S1 §4.1–4.3].

### 13.2. Obowiązkowa zawartość dokumentacji

README lub równoważny dokument ma obejmować:

- Instrukcję uruchomienia.
- Opis podstawowych funkcji.
- Skrócony opis architektury faktycznie przygotowanego rozwiązania.
- Źródła i zakres wykorzystanych danych.
- Rozróżnienie danych pobieranych na bieżąco i przygotowanych wcześniej, wraz z datami.
- Biblioteki, komponenty, modele, usługi i narzędzia AI oraz sposób ich użycia.
- Licencje i inne warunki korzystania.
- Znane ograniczenia techniczne.
- Sposób weryfikacji wyników i rekomendacji.

> **Uwaga:** dokumentacja powinna dodatkowo zawierać wymagane informacje o skalowaniu oraz ewentualnych kosztach i alternatywach. [K; S1 §4.2, §5.4–5.5]

## 14. Decyzje i status ustaleń

### Ustalenia obowiązujące w kontekście tego dokumentu

- **2026-11-22 — owner decision:** the application is named **HydroPlon**. This is a project
  branding choice; the KOWR competition title and organizer requirements remain unchanged. [P]
- Wymagania mają być zapisane przenośnie, tak aby agent programistyczny mógł używać ich jako kontekstu projektu. [S2]
- Obowiązkowy zakres i elementy opcjonalne należy rozróżniać zgodnie z [S1].
- Wybrano bazowy stos i strukturę techniczną: monorepo pnpm, React/Vite/TypeScript, Node.js/Fastify oraz PostgreSQL/PostGIS. Szczegóły i reguły pracy z repozytorium opisuje `AGENTS.md`.
- Utworzony szkielet techniczny nie potwierdza realizacji funkcji produktu opisanych w sekcji 5 ani przeprowadzenia ich walidacji.
- Wyniki domenowe i decyzje mają pozostać deterministyczne; ewentualny LLM może wspierać prezentację wcześniej obliczonego wyniku, ale nie stanowić źródła oceny bez osobnej decyzji.
- **2026-11-21 — decyzja właściciela projektu:** do lokalizacji działki w prototypie wybrano
  GUGiK ULDK. Aplikacja obsługuje wskazanie punktu na mapie oraz pełny identyfikator
  ewidencyjny, zachowuje źródło geometrii zwrócone przez usługę i nie wybiera innej działki po
  błędzie. Przy technicznej awarii ULDK aplikacja korzysta z oficjalnego zbiorczego WFS EGiB,
  filtrując po tym samym pełnym identyfikatorze albo wskazanym punkcie i jawnie zmieniając nazwę
  źródła w metadanych; prawidłowa odpowiedź ULDK o braku działki nie uruchamia fallbacku. Decyzja
  realizuje roboczy zakres F-02/F-03, ale nie rozstrzyga Q-07, ponieważ format danych wejściowych
  przekazywanych przez jury pozostaje nieznany. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** wejście analizy obsługuje jeden dzień albo
  domknięty zakres dat. Dla zakresu źródła czasowe mają być pobierane i interpretowane w całym
  okresie, a użycie bieżących warstw bez wersji historycznej ma być ujawnione. Interfejs stosuje
  robocze, kroczące okno 10 lat kalendarzowych względem dnia użycia. Rozszerzenie nie wybiera
  dostawców danych i nie rozstrzyga oficjalnej interpretacji Q-01. [P; decyzja właściciela]
- **2026-11-22 — earlier owner decision, superseded by the audit follow-up below:** the selector
  previously ended at yesterday. The owner subsequently requested addressing audit findings 2,
  3 and 4. Today's date is now selectable; the ongoing day remains explicitly incomplete.
  This restores the F-05 input path without claiming that unpublished daily observations exist. [P]
- **2026-11-21 — decyzja właściciela projektu:** lista wyboru upraw jest lokalną, wersjonowaną
  migawką unikalnych wartości pola `roslina` i odpowiadających im wartości `grupa_roslin` z
  publicznej warstwy ARiMR „Deklaracje rolne 2025 — uprawy (GSA)”. Wartości są prezentowane w
  przeszukiwalnym comboboxie, pogrupowane według głównej kategorii ARiMR i oznaczone ikoną grupy.
  Katalog nie jest pobierany podczas korzystania z formularza. Obecność pozycji w katalogu oznacza
  możliwość wybrania deklaracji, ale nie potwierdza jeszcze odrębnego modelu agronomicznego ani
  automatycznego rozpoznania uprawy. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** po zatwierdzeniu działki aplikacja sprawdza
  przestrzenne przecięcie jej granicy z publiczną warstwą ARiMR GSA 2025. Obszary zajmujące mniej
  niż 1% działki są pomijane jako nieistotne dla sugestii. Jeśli jedna uprawa stanowi co najmniej
  80% łącznej powierzchni istotnych przecięć, może zostać automatycznie zaproponowana w formularzu;
  kilka upraw bez wyraźnej dominacji wymaga wyboru ręcznego. Sugestia nigdy nie zastępuje wyboru
  dokonanego już przez użytkownika i jest opisana jako deklaracja, a nie niezależne potwierdzenie
  faktycznie rosnącej rośliny. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** po zatwierdzeniu działki, uprawy i okresu
  interaktywny widok konfiguracji przechodzi w kompozycję raportu. Formularz staje się statycznym
  podsumowaniem parametrów po lewej, a pełnoekranowa mapa — nieinteraktywnym podglądem działki na
  ortofotomapie po prawej, z niebieskim obrysem i wypełnieniem wybranej działki, ale bez punktowego
  znacznika i kontrolek mapowych. Obie części stanowią początek raportu; użytkownik może wrócić do
  edycji danych. Sam widok raportowy nie oznacza, że obliczenia i wymagane źródła danych zostały
  już wdrożone. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** do modelowanego profilu właściwości gleby wybrano
  ISRIC SoilGrids250m 2.0. Pierwszy adapter REST potwierdził możliwość zagregowania wartości
  Q0.05, Q0.50 i Q0.95 dla sześciu standardowych głębokości oraz właściwości `sand`, `silt`,
  `clay`, `soc`, `phh2o` i `bdod`, lecz oficjalna dokumentacja oznacza tę usługę jako czasowo
  wstrzymaną, a próby dla polskich działek wielokrotnie przekraczały timeout 20 sekund. Domyślny
  adapter korzysta więc z oficjalnego WMS `GetFeatureInfo`: frontend wysyła jedno zapytanie do API,
  a API równolegle pobiera dziewięć właściwości, każdą wraz ze wszystkimi głębokościami i
  kwantylami. Oprócz właściwości fizycznych pobierane są `wv0010`, `wv0033` i `wv1500`.
  Awaria pojedynczej właściwości tworzy wynik częściowy; dopiero niedostępność wszystkich kończy
  żądanie błędem. Wynik opisuje jedną komórkę modelu o nominalnej rozdzielczości 250 m; nie jest
  pomiarem terenowym, agregacją całej powierzchni, aktualną wilgotnością ani informacją właściwą
  dla wybranej daty historycznej. Zweryfikowany WCS pozostaje ścieżką rozwoju dla przestrzennego
  wycinka i agregacji wielu komórek. Pojemność potencjalnie dostępna jest obliczana jako dwa
  jawne warianty: różnica między wodą przy 33 albo 10 kPa i wodą przy 1500 kPa, przeliczona na
  grubość danej warstwy. Warianty nie są przedstawiane jako przedział statystyczny, aktualny zapas
  ani ilość dostępna konkretnej uprawie bez założeń o korzeniach. Decyzja realizuje glebową część
  D-03, ale nie potwierdza kompletności całej analizy wodnej. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** główny widok profilu gleby został uproszczony do
  izometrycznej bryły, stałej legendy i jednego wniosku. Kolor warstwy wynika z mediany różnicy
  `wv0033 - wv1500` odniesionej do jednostki objętości, na wspólnej skali 0–40 punktów
  procentowych. Skala została sprawdzona na rozproszonych punktach w Polsce; wartości poza jej
  zakresem są ograniczane wyłącznie przy przypisaniu koloru. Wariant 10 kPa, wartości w mm i
  kwantyle pozostają w API, ale nie dominują w interfejsie. Widok nie przedstawia bieżącej
  wilgotności ani oceny suszy. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** obserwacje kondycji roślinności są pobierane z
  Sentinel-2 L2A w Copernicus Data Space Ecosystem. Publiczny katalog STAC dostarcza rzeczywiste
  daty obserwacji, a Statistical API oblicza mediany NDMI i NDVI oraz lokalną jakość pikseli dla
  geometrii działki. Maska SCL odrzuca brak danych, chmury, cienie chmur, śnieg i klasy o
  niepewnej jakości. Raport automatycznie wybiera najbliższą wcześniejszą obserwację NDMI z
  wartością i co najmniej 70% poprawnych pikseli działki. Wyszukiwanie obejmuje maksymalnie 60 dni
  przed datą analizy; obserwacja starsza niż 14 dni otrzymuje jawne ostrzeżenie o aktualności.
  Kompaktowy wykres pokazuje wyłącznie użyteczne obserwacje NDMI, nie interpoluje braków i przerywa
  linię przy odstępie ponad 14 dni. Kierunek zmiany jest obliczany z całej użytecznej serii metodą
  Manna–Kendalla przy poziomie istotności 0,05, a nachylenie metodą Theila–Sena. Mniej niż cztery
  obserwacje nie daje wniosku o trendzie. Brak istotnego trendu oznacza brak wyraźnej zmiany, a nie
  potwierdzoną stabilność. NDVI pozostaje dostępne po stronie backendu, ale nie jest dodatkową serią
  wykresu ani warunkiem pokazania wiarygodnego punktu NDMI. Karta nie pokazuje mapy, suwaka ani
  ręcznej nawigacji i nie wywołuje Process API. Brak danych OAuth daje jawny wynik częściowy bez
  zastępowania statystyk fikcyjnymi wartościami. NDMI i NDVI pozostają wskaźnikami bezwymiarowymi,
  nie pomiarem wilgotności gleby ani samodzielnym dowodem suszy. [P; decyzja właściciela]
- **2026-11-22 — owner-requested satellite section clarification:** the chart explicitly names
  NDMI as the vegetation moisture index and explains its dimensionless −1 to 1 scale. The trend
  describes the index rather than crop condition and uses neutral presentation. Season and
  water-balance comparison context appears before the trend. Coverage remains distinct from
  assessment certainty, and the visible explanation distinguishes vegetation moisture from soil
  moisture and crop condition. This presentation change does not change providers, calculations,
  quality thresholds, or the qualification of satellite evidence. [P; project choice]
- **2026-11-21 — decyzja właściciela projektu:** dla sekcji „Opady i dostępność wody” źródłem
  głównym jest Open-Meteo Historical Weather API z modelem ERA5-Land, a NASA POWER Daily API
  stanowi jawny fallback po błędzie dostawcy, w tym po wyczerpaniu limitu. Jedno żądanie raportu
  nie miesza dostawców między okresem analizowanym i porównaniami historycznymi. Analiza używa
  punktu reprezentatywnego wewnątrz działki, sum opadów i referencyjnej ewapotranspiracji dla
  trawy. Dla NASA POWER ET₀ jest obliczane deterministycznie metodą FAO-56 z dostępnych zmiennych
  meteorologicznych. Różnica P − ET₀ pozostaje uproszczonym wskaźnikiem meteorologicznym: nie jest
  bilansem wody w glebie, diagnozą suszy ani dawką nawadniania. Widok porównuje identyczne zakresy
  z dziesięciu lat i nazywa wartość odniesienia medianą dostępnych okresów, nie normą klimatyczną.
  Braki pozostają `null`, sumy częściowe są opisane liczbą dostępnych dni, a P − ET₀ nie jest
  obliczane bez kompletu obu szeregów. Rozdzielczość, model, czas danych i ograniczenia są widoczne
  w raporcie. Decyzja realizuje meteorologiczną część D-01, ale sama nie stanowi kompletnej oceny
  sytuacji wodnej ani profilu analitycznego uprawy. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** główną prezentację sekcji meteorologicznej
  uproszczono i przemianowano na „Opady i warunki pogodowe”. Domyślny widok odpowiada wyłącznie
  na pytania o sumę opadów, jej położenie na tle analogicznych okresów oraz rozkład opadów w
  czasie. Klasyfikacja „mniej”, „w typowym zakresie” lub „więcej” używa pierwszego i trzeciego
  kwartyla z co najmniej pięciu kompletnych poprzednich okresów; nie stosuje stałego progu w mm i
  nie stanowi diagnozy suszy. Kompletność opadów jest oceniana niezależnie od ET₀. Wykres używa
  danych dziennych do 31 dni, kolejnych siedmiodniowych przedziałów do 180 dni i miesięcy dla
  dłuższych zakresów; niepełny przedział nie jest sumowany ani zastępowany zerem. Porównanie lat
  oraz metodologia są domyślnie zwinięte. ET₀, P − ET₀, historia, metadane i ograniczenia
  pozostają w API oraz szczegółach raportu. Ta decyzja zastępuje wcześniejszy układ prezentacji,
  ale nie zmienia doboru dostawców ani naukowego znaczenia wskaźników. [P; decyzja właściciela]
- **2026-11-21 — decyzja właściciela projektu:** główny wykres opadów bezpośrednio zestawia każdy
  bieżący przedział z medianą kompletnych, analogicznych przedziałów z 10 lat poprzedzających rok
  analizy. Przedziały historyczne zachowują tę samą pozycję i liczbę dni, także dla niepełnego
  ostatniego przedziału, przełomu roku i lat przestępnych. Mediana punktu wymaga co najmniej pięciu
  kompletnych lat; braki nie są zerami, a wartość odniesienia nie jest normą klimatyczną. Osobny
  panel porównania lat usunięto jako redundantny. Zakresy, kompletność, liczba użytych lat,
  historia, ET₀, P − ET₀, źródła i ograniczenia pozostają w odpowiedzi API lub szczegółach
  metodologii. Ustalenie ruchomego okresu odniesienia rozstrzyga projektowo Q-01 na potrzeby tej
  funkcji, bez przypisywania tej interpretacji organizatorowi. [P; decyzja właściciela]

- **2026-11-21 — decyzja właściciela projektu:** dla centralnej oceny sytuacji wodnej przyjęto
  scenariuszowy, dzienny bilans strefy korzeniowej FAO-56. Rdzeń ma uwzględniać ciągłą historię
  od początku scenariusza uprawowego do daty analizy, współczynnik stresu `Ks` oraz skorygowaną
  ewapotranspirację uprawy `ETc,adj = Ks × Kc × ET0`. IUNG pozostaje zewnętrzną referencją do
  walidacji i nie dostarcza progów kopiowanych do inaczej obliczonego wskaźnika. Obserwacje
  satelitarne są raportowane jako odrębny status zgodności z bilansem. Nie zmieniają samej klasy
  FAO-56, a sygnał odmienny ogranicza interpretację zamiast automatycznie nadawać wynik
  niejednoznaczny. Klasa `strong-shortage-indications` pozostaje tymczasowo w typie dla zgodności,
  ale Etap 2 jej nie emituje: samo `Ks = 0` jest skrajnym stanem modelu, a nie uzasadnionym progiem
  osobnej klasy dotkliwości. Zgodne `Ks < 1` daje `elevated-shortage-risk`, a silnik zachowuje
  rzeczywiste wartości, czas trwania epizodów i deficyt ET bez arbitralnego podziału stresu.
  Pojemność
  polowa z SoilGrids jest zachowana w dwóch jawnych wariantach 10 i 33 kPa, ponieważ nie istnieje
  jedno uniwersalne napięcie odpowiadające pojemności polowej wszystkich gleb. Rozbieżność
  wiarygodnych scenariuszy oznacza wynik niejednoznaczny, a nie podwyższone ryzyko; brak elementu
  koniecznego dla rdzenia oznacza niewystarczające dane. Pilotażowe, źródłowo zweryfikowane
  profile obejmują pszenicę ozimą i jarą, kukurydzę na ziarno, ziemniaka, buraka cukrowego oraz
  rzepak. Przykładowe długości faz FAO-56 nie są kalibracją fenologii dla Polski. Dzienny krok
  rozróżnia opad lub nawodnienie wczesne i późne, obsługuje drenaż nadmiaru oraz zmianę głębokości
  korzeni; dzienne dane pogodowe bez informacji o porze wymagają jawnego scenariusza. Etap 2
  implementuje czysty, deterministyczny silnik pełnego sezonu i dokładne mapowanie sześciu
  identyfikatorów ARiMR. Nie oznacza to wdrożenia pobierania pełnej historii, orkiestracji analizy,
  endpointu ani sekcji raportu. [P; decyzja właściciela]

- **2026-11-21 — decyzja właściciela projektu:** Etap 3 udostępnia centralną ocenę przez
  `POST /api/analyses`. Klient wskazuje działkę, uprawę, datę końcową i jawne założenie fenologii;
  API nie wyznacza daty siewu z kalendarza. Ta część decyzji została zastąpiona decyzją z
  2026-11-22 o standardowym początku sezonu. Open-Meteo ERA5-Land i NASA POWER są alternatywnymi
  źródłami całej ciągłej serii i nie są łączone w jednym bilansie. Brak dnia lub ET₀ pozostaje
  brakiem. Sześć warstw SoilGrids Q0.50 jest przeliczanych na ułamki objętościowe i przekazywanych
  do obu wariantów pojemności polowej. Centralny bilans pobiera wyłącznie trzy wymagane
  właściwości retencji, współdzieli identyczne żądania, przechowuje je w pamięci przez 24 godziny i
  w trwałym cache PostgreSQL bez krótkiego TTL oraz wykonuje najwyżej jedno ponowienie błędu
  przejściowego; właściwości pomocnicze pełnego profilu nie blokują FAO-56. Trwały cache jest
  kluczowany dokładną lokalizacją próbki i właściwością oraz zachowuje produkt, wersję,
  rozdzielczość, jednostkę, datę pobrania i źródło. Brak głębokiej warstwy nie blokuje scenariusza,
  jeżeli modelowana strefa korzeniowa jej nie przecina. Niedostępność źródła daje jawny wynik
  `insufficient-data`; opcjonalny satelita nie blokuje FAO-56 ani nie zmienia jego klasy. Uprawy
  nieobsługiwane, brak fenologii i dzień poza aktywnym scenariuszem zwracają wyłącznie ograniczony
  kontekst pogodowo-glebowy. Odpowiedź zawiera kody przyczyn, ograniczenia, źródła, daty pobrania,
  rozrzut scenariuszy i czasy wykonania. Decyzja nie oznacza wdrożenia frontendowej sekcji wyniku,
  historii dziesięcioletniej, rekomendacji ani eksportu. [P; decyzja właściciela]

- **2026-11-21 — decyzja właściciela projektu:** backendowa podatność historyczna jest
  kontrfaktyczną symulacją aktualnie wybranego profilu uprawy i jawnej fenologii w dziesięciu
  sezonach poprzedzających rok analizy (`Y-1`…`Y-10`). Ta robocza reguła rozstrzyga Q-01 i Q-05
  wyłącznie na potrzeby tej funkcji; nie jest przypisywana organizatorowi. Początek sezonu i data
  analizy są przesuwane o tę samą liczbę pełnych lat; 29 lutego jest w roku nieprzestępnym
  ograniczany do 28 lutego. Każdy sezon ma jeden ciągły szereg pogodowy z Open-Meteo albo NASA
  POWER, bez sklejania dostawców. Jeden aktualny profil SoilGrids i aktualna geometria działki są
  jawnie ponownie używane dla wszystkich lat, co jest projektową odpowiedzią na Q-04, a nie
  potwierdzeniem historycznych granic lub stanu gleby. Brakujące lata nie są liczone jako brak
  stresu; każdy udział ma mianownik kompletnych sezonów. Wynik zachowuje niejednoznaczność
  scenariuszy, epizody i rozkład po fazach bez arbitralnej klasy podatności. Funkcja jest dostępna
  przez osobny `POST /api/historical-analyses`; nie zmienia centralnego kontraktu. Frontend
  wywołuje ją niezależnie od oceny bieżącej po podaniu daty siewu lub sadzenia i umieszcza wynik
  bezpośrednio po centralnej ocenie. Pokazuje jawny mianownik kompletnych sezonów, rozbieżności,
  lata niekompletne oraz nawrót według faz wzrostu bez wyznaczania arbitralnej klasy podatności.
  Brak daty nie uruchamia zapytania i nie blokuje pozostałych części raportu. Zachowanie dotyczące
  ręcznej daty zostało zastąpione decyzją z 2026-11-22 o standardowym początku sezonu. [P; decyzja
właściciela]

- **2026-11-21 — decyzja właściciela projektu:** ukształtowanie terenu jest pobierane z GUGiK NMT
  przez WCS w układzie EPSG:2180 i odniesieniu wysokościowym PL-EVRF2007-NH. Analiza obejmuje
  rzeczywiste wysokości komórek w granicy działki, bez sztucznego zwiększania skali pionowej, i
  oblicza minimum, maksimum, różnicę wysokości, typowy spadek, 90. percentyl spadku oraz dominujący
  kierunek spadku. Interaktywny model Three.js używa oddzielnie pobieranej ortofotomapy GUGiK WMS;
  awaria tekstury nie unieważnia obliczeń NMT. Odpowiedzi użytych usług nie podają daty pozyskania
  konkretnego arkusza, więc data źródłowa pozostaje jawnie nieznana. Na tym etapie hydrologia i
  klasy pokrycia terenu nie miały jeszcze zatwierdzonego źródła produkcyjnego, dlatego moduł
  pokazywał je jako niedostępne. Ta część decyzji została zastąpiona decyzją z 2026-11-22 poniżej.
  [P; decyzja właściciela]

- **2026-11-21 — decyzja właściciela projektu:** pierwsza sekcja raportu prezentuje centralną
  ocenę z `POST /api/analyses`. Opcjonalne pole „Data siewu lub sadzenia” jest synchronizowane z
  URL i mapowane na jawny początek referencyjnego sezonu FAO-56; nie jest przedstawiane jako
  potwierdzona data wschodów. Brak daty, brak zweryfikowanego profilu uprawy, niepełne źródła,
  rozbieżność scenariuszy i błąd techniczny mają odrębne komunikaty, a pozostałe sekcje raportu
  działają niezależnie. Początkowa efektywna głębokość korzeni 0,20 m jest jawnym założeniem
  projektu dla początku sezonu upraw jednorocznych, a nie pomiarem polowym; początkowy zapas wody
  nadal jest ograniczany scenariuszami mokrym i suchym. Walidacja dopuszcza datę do 400 dni przed
  analizą, aby obsłużyć uprawy ozime, lecz nie oznacza 400-dniowego profilu uprawy. Etap nie
  implementuje historii dziesięcioletniej, rekomendacji, eksportu ani zmian modelu 3D. Pole ręcznej
  daty i jego semantyka zostały zastąpione decyzją z 2026-11-22 poniżej. [P; decyzja właściciela]

- **2026-11-22 — decyzja właściciela projektu:** formularz domyślnie nie wymaga daty siewu lub
  sadzenia. Pokazuje informację o przyjęciu orientacyjnego terminu, a w rozwijanej sekcji „Zmień
  założenia uprawy” pozwala opcjonalnie podać znaną datę. Podana data jest jawnym założeniem
  użytkownika i nie jest utożsamiana z datą wschodów.
  Jeżeli klient API nie przekazuje jawnej fenologii, centralna i historyczna analiza automatycznie
  przyjmują projektowy standardowy początek sezonu dla obsługiwanego profilu: 25 września dla
  pszenicy ozimej, 25 marca dla pszenicy jarej, 27 kwietnia dla kukurydzy na ziarno, 20 kwietnia
  dla ziemniaka, 30 kwietnia dla buraka cukrowego i 20 sierpnia dla rzepaku ozimego. Rok jest
  dobierany jako ostatnie wystąpienie tej daty niepóźniejsze niż dzień analizy. Daty są
  reprezentatywnymi punktami centralnopolskich terminów publikowanych w „Normatywach Produkcji
  Rolniczej” Centrum Doradztwa Rolniczego w Brwinowie i stanowią jawne założenie prototypu, nie
  obserwację działki ani regionalną rekomendację. Jawna fenologia w API może nadpisać domyślne
  założenie. Decyzja usuwa `PHENOLOGY_REQUIRED` jako normalny skutek użycia formularza, ale nie
  zastępuje brakujących długości faz, profilu uprawy, pogody ani gleby. Rzepak pozostaje bez wyniku
  referencyjnego, dopóki nie zostaną przyjęte długości faz. Ten brak został zastąpiony opisaną
  niżej poprawką projektową z 2026-11-22, z zachowaniem ograniczeń kalibracji. [P; decyzja właściciela projektu;
źródło terminów: https://poznan.cdr.gov.pl/normatywy/]

  The optional form control and URL override in this decision are superseded by
  “Removal of additional crop settings” below; the standard-season calculation remains in use.

- **2026-11-22 — decyzja właściciela projektu:** publiczna odpowiedź centralnej analizy zachowuje
  dotychczasowy status silnika dla zgodności, ale osobno podaje poziom możliwej interpretacji:
  pełna ocena FAO-56, ocena zależna od założeń, ocena ograniczona do części scenariuszy, sam kontekst
  meteorologiczny albo brak możliwości oceny. Częściowo obliczone rodziny scenariuszy pozostają w
  odpowiedzi i nie są automatycznie przedstawiane jako reprezentatywne dla brakujących wariantów.
  HTTP 429, timeout, błędne mapowanie, brak dnia, brak zmiennej i dane jeszcze nieobecne w odpowiedzi
  dostawcy mają odrębną diagnostykę. Data sugerowana użytkownikowi wynika z ciągłego kompletnego
  prefiksu całego wymaganego szeregu i zmienia analizę wyłącznie po świadomym wyborze. Historia
  zachowuje niezależne zapytanie i status. [P; decyzja właściciela projektu]

- **2026-11-22 — decyzja właściciela projektu:** historyczne porównanie FAO-56 rozdziela stan w
  końcowym dniu od przebiegu całego analizowanego okresu. Wniosek okresowy jest zgodny tylko wtedy,
  gdy wszystkie kompletne scenariusze wskazują co najmniej jeden dzień ograniczenia albo wszystkie
  wskazują jego brak; pozostałe wyniki są zależne od założeń, bez głosowania większościowego.
  Identyczna reguła obowiązuje w fazach rozwoju. Scenariusze różniące się wyłącznie początkowym
  `Dr` są parowane, a ograniczenie występujące tylko dla `Dr = TAW` jest prezentowane jako wpływ
  skrajnie suchego założenia początkowego. Pary są dodatkowo sprawdzane pod kątem dnia, w którym
  dochodzą do tego samego stanu modelu, albo utrzymują rozbieżność do końca okresu. Historia nosi
  nazwę „Uprawa na tle poprzednich lat” i używa jednego wykresu zakresu modelowanej liczby dni
  ograniczenia. Kliknięcie roku pokazuje zakres dni, deficytu ET i najdłuższego epizodu, zgodność
  wariantów, kompletność oraz wpływ warunków początkowych. Brakujący rok zachowuje miejsce i nie
  jest prezentowany jako zero. Scenariusze nie mają wag prawdopodobieństwa; minimum i maksimum nie
  jest przedziałem ufności, a mediana scenariuszy nie służy do wskazywania najbardziej
  prawdopodobnego ani najbardziej obciążonego roku. Szczegóły FAO-56, źródła i ograniczenia
  pozostają dostępne progresywnie. Niepełna pogoda wskazuje brakujące daty i pola oraz może
  zaproponować ostatni wcześniejszy dzień ciągłego kompletnego szeregu, ale data zmienia się
  wyłącznie po świadomym działaniu użytkownika. [P; decyzja właściciela projektu]

- **2026-11-22 — project decision (owner request):** the terrain section supports a 2D water
  map alongside its existing 3D terrain view. Per the owner's follow-up, the Polish controls
  “Teren 3D” and “Woda na mapie” replace the former oblique-view/reset controls in their overlay
  position; the new map messages, legend and accessible labels also use Polish.
  The map displays the four nearest listed water
  objects using their source geometry, numbered consistently with the list, and the parcel
  boundary. It automatically fits the parcel and local object extents; selecting an object from
  the list or map highlights it and fits it together with the parcel. Hovering a list row or map
  object highlights both representations without changing the camera or persistent selection;
  keyboard focus on a row provides the same preview. Object type labels start with a capital letter.
  Numbered map markers are separated in screen space when they collide, including at viewport
  edges, with leader lines to their original source locations. Their list numbers and source
  geometries stay unchanged; spacing reserves room for the highlighted marker size.
  Long features are limited
  visually to the local search bounds. Geometry is transported as WGS84 GeoJSON. Missing terrain
  or aerial imagery does not suppress available water geometry. This is a presentation extension
  of the existing OSM context, not a new hydrological calculation or confirmed flow connection.
  [P; accepted for this implementation, not an organizer requirement]

- **2026-11-22 — decyzja właściciela projektu:** kontekst hydrologiczny i użytkowanie terenu są
  pobierane z bieżącego zrzutu OpenStreetMap przez publiczne instancje Overpass API. Analiza
  hydrologii obejmuje oznaczone cieki, rowy, zbiorniki i mokradła do 1 km od granicy działki oraz
  podaje relację przestrzenną i odległość w metrach. Udziały klas użytkowania są deterministycznym
  oszacowaniem z ograniczonej siatki punktów wewnątrz działki; pokrycie nierozpoznane pozostaje
  jawnie nieznane. Brak oznaczenia w OpenStreetMap nie potwierdza braku obiektu w terenie, a klasy
  nie są danymi katastralnymi, prawnymi ani deklaracją ARiMR. Raport podaje stan zrzutu, czas
  pobrania, atrybucję OpenStreetMap i licencję ODbL. Dla dat historycznych używany jest bieżący
  stan mapy i ograniczenie to jest ujawniane. NMT, hydrologia i użytkowanie powierzchni mają
  niezależne stany dostępności; awaria jednego źródła nie usuwa wyników pozostałych. Decyzja
  realizuje pierwszą wersję D-04 i D-06, ale nie ustanawia warstwy jako podstawy prawnej ani
  walidacji terenowej. [P; decyzja właściciela projektu]

- **2026-11-22 — decyzja właściciela projektu:** Sentinel-2 uczestniczy w centralnej ocenie
  wyłącznie jako odrębna przesłanka zgodności. Kwalifikacja wymaga obserwacji NDMI nie starszej niż
  14 dni, wystarczającej jakości, co najmniej czterech punktów trendu Manna-Kendalla/Theila-Sena i
  umieszczenia całego szeregu w środkowej fazie wszystkich aktywnych scenariuszy fenologicznych.
  Spadek może być tylko wzorcem zgodnym z ograniczeniem, wzrost — wzorcem niezgodnym, a brak
  istotnego kierunku — sygnałem neutralnym. Satelita nie zmienia klasy FAO-56. Raport pokazuje
  przyczynę braku kwalifikacji i ewentualną sprzeczność. [P; decyzja właściciela projektu]

- **2026-11-22 — decyzja właściciela projektu:** pierwszy silnik rekomendacji jest
  deterministycznym etapem po centralnej ocenie i analizie przestrzennej. Wybiera najwyżej cztery
  działania retencyjne lub agrotechniczne na podstawie bilansu FAO-56, modelu gleby, NMT,
  hydrologii, użytkowania terenu i kwalifikowanego sygnału satelitarnego. Każde działanie zachowuje
  przesłanki, braki oraz wymaganą weryfikację. Progi 1° typowego spadku, 2 m różnicy wysokości i
  100 m od obiektu wodnego są jawnymi progami przesiewowymi projektu, nie kryteriami budowlanymi.
  Aplikacja nie lokalizuje automatycznie urządzeń wodnych, nie zaleca samodzielnej przebudowy rowów
  i wymaga sprawdzenia terenowego oraz formalnoprawnego przed działaniami wpływającymi na przepływ
  lub retencję. Nie obiecuje wzrostu plonu ani ilości zaoszczędzonej wody. [P; decyzja właściciela
projektu]

### Corrective project choices from the requested functionality repair (2026-11-22)

These are prototype choices [P] made while repairing missing results for parcel
`280903_2.0009.1/25`; they are not organizer requirements or scientific field validation.

- Standalone Open-Meteo ERA5-Land returned temperatures but `null` precipitation and ET0 for
  archived dates. The archive adapter now requests the complete ERA5 product (0.25°, about 25 km).
  If an entire requested season is incomplete, central and historical FAO-56 may use a complete
  ECMWF IFS operational-analysis series from the same provider, available from 2017 onward.
  NASA POWER remains the next whole-series alternative. No days are spliced between models.
  IFS is identified separately with its resolution and changing operational model versions.
  The precipitation-comparison endpoint keeps one ERA5/NASA provider across all comparison years.
- Winter rapeseed now has two explicit project reference calendars instead of an empty phase list.
  Their phase proportions come from INRAE CropWat 0.3.0 `SB2023-colza` (15/165/61/37 days in
  Aveyron, France). The complete calendar is proportionally rescaled to 317 and 335 days,
  bracketing the seasons observed in NE Poland by Jankowski et al. (2024), Table 2. This produces
  17/188/70/42 and 18/199/74/44 days. Proportional adaptation is a screening assumption, not a
  locally validated estimate of individual phase dates, crop emergence, or winter dormancy.
  Crop coefficients and rooting-depth ranges remain the documented FAO-56 rapeseed parameters.
  API responses and report details identify both sources and this adaptation explicitly.
- The Overpass adapter first uses the Europe instance at `ovp.dresel.systems`, whose coverage
  includes Poland; the existing global instances remain alternatives. A response with an
  Overpass error remark is rejected as incomplete instead of interpreted as an empty map.

- Successful NMT grids are retained in an application-level, bounded 30-minute memory cache
  keyed by exact bounds and grid resolution (at most 128 samples), preserving retrieval timestamps.
  Retrying a missing map source therefore reuses an already successful terrain sample instead of
  losing it to a separate transient outage. Failed requests are not cached.
- Following the user's explicit request to extend FAO-56 beyond the pilot crops, the engine now
  initially received 48 reference profiles and 132 explicit catalog mappings, including dry-seed faba bean
  (`bobik`). FAO Tables 11, 12 and 22 supply crop parameters; additional starts and documented
  related-crop phase proxies are project assumptions, not calibrated Polish calendars.
  Established perennials retain mature roots. The remaining catalog entries are not silently
  mapped to a generic crop; mixtures, green-manure uses, ornamentals and unspecified categories
  may lack a supported calendar or species/management information.
- **Project decision, 2026-11-22; implemented following the user's request to review and extend
  crop mappings:** coverage is now 55 reference profiles and 148 explicit ARiMR mappings.
  Seven additional species/use profiles take Kc, root depth and depletion from FAO-56 revised
  edition (2025); calendars retain disclosed 1998 references or project proxies. Six ancient-wheat
  identifiers use spring/winter common-wheat group proxies with the basis exposed in central
  and historical report assumptions. This is prototype model availability, not agronomic
  validation or an organizer requirement. The [679-entry catalog triage](crop-catalog-review.md)
  records the remaining 531 entries and missing references or management inputs. Universal
  nearest-name mapping is not adopted; mixtures and unidentified uses remain explicit gaps.
- **Project decision, 2026-11-22; implemented following user approval of priority crops and
  selection labels:** coverage now reaches 61 profiles and 156 ARiMR identifiers. Spring/winter
  rye, winter barley, spring rape, common buckwheat and strawberry receive explicit reference
  profiles; spring/winter triticale use disclosed common-wheat group proxies. New calendars
  identify the borrowed or adapted references, including COBORU anchors for spring rape.
  The API exposes model availability for the full catalog at `GET /api/crops`. Selection labels
  distinguish species references, approximate models and environmental context only; lookup
  failures remain unknown availability. These labels do not establish local validation. Mixtures,
  grass cutting/grazing inputs and universal catalog coverage remain outside this extension.
- **Project decision, 2026-11-22; owner-authorized estimates for missing crop profiles:** keep
  one selected crop per parcel. Missing species FAO references must no longer block a plant's
  calculation by themselves. Preserve the 156 earlier mappings and add 522 explicit group
  estimates, for 678 catalog identifiers and 70 profiles (61 reference, nine estimated).
  Estimate canopy coefficients, root-zone parameters and a production calendar from identified
  FAO crop families; distinguish seed, forage, summer cover and overwintering cover assumptions.
  Unknown management is an explicit project assumption rather than an observed input. The sole
  environmental-only entry is mushroom (`pieczarka`), for which a plant root-zone model does not
  apply. The API requires `crop.modelKind` in both current and historical responses; approximate
  models are visible beside results and retained in print. No legacy response compatibility is
  required because the prototype has not been deployed. This supersedes the previous policy of
  withholding all calculations for missing species/management references; it does not establish
  scientific validation, actual crop composition or a new organizer requirement. Missing source
  weather/soil, scenario disagreement and unsupported management remain reported limitations.
- When the requested date is after every modelled variant ends, the report now explicitly shows
  the last common completed crop period, its ten analogous earlier periods, and planning advice
  derived from that period. `analysisDate` remains unchanged and `evaluation` identifies the
  actual cutoff. This supersedes the earlier blanket analysis-day-only treatment after harvest.
  It does not claim current soil moisture, confirm a harvest date, or discard an ended alternative
  while another remains active. Partially calculated historical ensembles retain useful ranges
  with explicit scenario counts, excluded from full-season frequencies.

Sources: [Open-Meteo model availability](https://open-meteo.com/en/docs/historical-weather-api),
[INRAE CropWat](https://inrae.r-universe.dev/CropWat),
[INRAE parameter provenance](https://umr-g-eau.pages-forge.inrae.fr/cropwat/reference/crop_params.html),
[NE Poland winter-rape study](https://doi.org/10.3390/agronomy14030437),
[public Overpass instances and coverage](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).

### Interface simplification (2026-11-22)

Project presentation choice [P], authorized by the owner’s request to simplify the interface for
farmers: keep the UI in Polish, use a three-step parcel/crop/report flow, and present the assessment
and practical actions before the historical comparison. Technical charts, parcel provenance, and
crop assumptions remain visible through report details and existing source drawers.
Terrain, weather, satellite, and soil detail views load on first opening; data needed for the
assessment and recommendations still load independently. Missing sources, partial results,
uncertainty, and the actual evaluated period remain visible with the conclusions. This changes
presentation only; it does not change analytical methods, provider choices, or resolve reporting
persistence and scientific-validation questions.

### Historical year details without a picker (2026-11-22)

Project presentation choice [P], authorized by the owner: remove the historical year selector.
Below the unchanged ten-year chart, each year has a native expandable summary with its conclusion.
Its details preserve the evaluated period, weather completeness, calculated ranges, scenario
counts, sensitivity caveat, and missing-data reasons. These summaries work with the keyboard
without selecting chart bars or fetching the analysis again. This changes presentation only;
historical calculations, completeness rules, and API requests remain unchanged.

### Removal of additional crop settings (2026-11-22)

Project decision [P], authorized by the owner's request: remove the optional sowing/planting-date
section from the web form and stop reading `seasonStartDate` from the URL. The organizer requires
crop and analysis-date selection, not a separate planting-date control. The web report uses the
existing automatic reference season start consistently for the central assessment, historical
comparison, recommendations, and satellite interpretation. The report continues to disclose the
assumed start and its limitations. No migration or compatibility handling for the removed URL
setting is required. This supersedes the earlier form-control choices, without changing domain
calculations, crop calendars, or the API's explicit-phenology capability.

### Scenario comparison presentation (2026-11-22)

Project presentation choice [P], authorized by the owner: replace the expanded scenario prose
with vertically stacked range charts for initial water, soil capacity, root depth, rainfall timing,
and crop development when those inputs vary. Every chart uses the same day-count scale and
shows exact minimum/maximum stress-day results from completed scenarios. Missing calculations
remain distinct from zero. Keep the caveat that other assumptions also vary within each group;
these ranges are neither probabilities nor confidence intervals or moisture measurements.
Full variant labels, final-day outcomes, technical parameters, and completion counts remain in
expandable details. This changes presentation only, not the scenario calculations or conclusions.

### Satellite observation interpretation repair (2026-11-22)

Project correction [P], authorized by the owner's request following the satellite-section review:
show the actual reason a satellite comparison was skipped, including its separate completed-season
end date, without reporting a missing trend when observations are available. Distinguish modelled
crop development from confirmed vegetation on the parcel. Pixel coverage describes usable spatial
coverage, not assessment certainty. Failed NDVI statistics must preserve available NDMI statistics;
failed NDMI statistics are reported as unavailable calculations rather than poor image coverage.
These corrections do not change trend thresholds or the role of satellite evidence in the balance.

### Solar radiation in the weather timeline (2026-11-22)

Project presentation choice [P], authorized by the owner's request to show the available solar
signal alongside rainfall: expose daily incident shortwave radiation from the existing weather
provider, using Open-Meteo `shortwave_radiation_sum` (MJ/m² per day) or NASA POWER
`ALLSKY_SFC_SW_DWN` (MJ/m²/day). The chart sums it over the same displayed precipitation buckets
and uses a separate energy axis. It is not a UV index, sunshine duration, or an additional drought
classification. Missing radiation keeps its own coverage count and a gap in the line; rainfall
comparison remains available independently. No new provider or analytical recommendation rule
is introduced. [P; accepted for this implementation, not an organizer requirement]

### Soil-source availability repair (2026-11-22)

Project reliability correction [P] from diagnosing parcel `280803_2.0024.149/4`: the ISRIC WMS
returned HTTP 200 with XML raster-read exceptions or whitespace-only bodies. These responses are
provider failures, not proof of absent soil. A failed multi-layer property request may recover
individual depth/quantile layers from the same ISRIC product, prioritizing medians, with at most
six concurrent recovery requests and the existing 12-second timeout as a separate recovery budget.
Unavailable values remain null, partially recovered properties are not cached, and the existing
complete-property cache retains its product, location, and retrieval-time provenance. This does
not substitute another provider or change FAO-56 assumptions. Full analysis still requires the
water-retention medians for the actual root zone; partial recovery does not establish completion.

The same diagnosis found an inactive local PostgreSQL service and a JSONB write bug in the source
cache: node-postgres serialized a JavaScript prediction array as a PostgreSQL array. Cache writes
now bind explicit JSON. The pinned PostGIS image uses its published amd64 platform on Apple Silicon.
For this parcel, a complete, real ISRIC response captured earlier at `2026-11-22T02:14:01.607Z`
was validated against the HTTP schema and exact sample point before restoring its nine properties
to PostgreSQL with the original retrieval time. It is previously retrieved source data, not a
fixture or a replacement model.

Successful cadastral lookups are reused by identifier for five minutes in a bounded 512-entry
API-memory cache, also populated after point selection. This project reliability choice [P] avoids
losing independent report sections when a repeated lookup of the already selected parcel times
out. Failures and not-found responses are not cached, and source provenance is retained.

### Audit follow-up: current date, crop applicability and retention places (2026-11-22)

Owner request: address findings 2, 3 and 4 in the implementation audit. These are project choices
[P], not new organizer requirements or official answers to Q-01/Q-09.

- The date selector and URL validation include today. API future-date validation uses the
  Europe/Warsaw calendar. A daily precipitation/ET0 total for the ongoing day is never treated
  as complete, even if a provider returns a number. The requested date is retained, with missing
  inputs and any explicitly offered earlier complete assessment date visible.
- The primary central response always uses the requested date in `evaluation`. If all crop
  variants have ended, it reports meteorological context ending on that date and leaves crop
  stress unassessed. The former crop balance is preserved separately as `completedSeason`.
  `requestedDateConditions` exposes requested-day precipitation/ET0, a trailing inclusive 30-day
  window, source metadata and independent coverage. P minus ET0 is atmospheric context, not a
  soil-moisture estimate or drought diagnosis. Thirty days is a project presentation window.
  Current cover, irrigation and measured moisture remain unknown; there is no extrapolation of
  an inactive crop or silent replacement of the requested date by the harvest-period result.
- The recommendation request includes the selected ARiMR crop and whether its evidence concerns
  an active or completed season. Domain mappings select annual-standing, annual-post-season,
  perennial-interrow or perennial-sward applicability. Unsupported profiles retain explicit
  uncertainty. FAO soil-cover guidance supports distinguishing in-crop cover competition from
  practices between crops; orchard interrow management is informed by the NRCS cover-crop guide.
- Retention actions reference actual OSM water-object geometry within the existing 100 m screening
  distance, or NMT sample-cell centers within the parcel and outside holes. The lowest valid
  parcel sample and a maximum-slope sample can identify places to inspect. They are not confirmed
  depressions, runoff routes, engineering sites or legal approvals. Flat/no-data grids produce
  no invented candidate. Returned cell size, source and geometry accompany numbered locations,
  which can be viewed on the parcel map. Missing location evidence leaves recommendations partial.

### Printable reports (2026-11-22)

Project decision [P], authorized by the owner's implementation request and follow-ups: the first
report-persistence path is browser printing, including the native Save as PDF destination.
The simple version includes basic historical and weather charts alongside the assessment,
actions, evidence, source dates, missing inputs and limitations. The extended version adds
scenario comparisons, annual details, terrain/water diagrams, satellite and soil results,
and full methodology and data tables. Content may extend the simple version beyond two pages;
readability and preservation of uncertainty take precedence over a fixed page count.

Choosing a variant prepares its required data and charts in the background and opens the native
print preview directly, without an in-app preview step. Failed independent sources remain
explicit, and preparation can be cancelled. The print document uses A4 layout, logical chapter
breaks and non-splitting charts and short action blocks, while long sections flow across pages.
It reuses application DTOs, calculations and presentation rules; it does not introduce new
analysis methods, providers or an additional PDF dependency. This resolves the prototype's
report-persistence format choice, not scientific validation or the browser compatibility question.

Owner clarification: application-authored print controls, status and error messages, report
headings, explanatory copy and map captions use Polish, consistently with the rest of the UI.

Owner correction: extended print maps include the already selected GUGiK orthophoto, fitted in
EPSG:2180 beneath the parcel and the same four numbered water objects as the screen list, or
the numbered recommendation locations. Raster and vector bounds match; labels use nearby source
geometry and are separated without relocating source features. Printing waits for map-image
retrieval, with an explicit unavailable-background message on failure. Retrieval time, attribution,
unknown image acquisition date and reuse of current imagery for history remain in the caption.
This corrects the print presentation and does not change analytical data or recommendations.

Owner navigation choice: group an icon-only help action with a printer icon in the top
navigation. The printer opens a dropdown with simple and extended variants, replacing the
print controls in the report body. It is disabled until a valid report context is available.
Preparation status, cancellation and recovery from print errors stay in the same control.

### Invalid-link recovery (2026-11-22)

Project validation choice [P], authorized by the owner's request to handle invalid query
parameters: show an accessible warning for unknown, repeated, invalid or conflicting workspace
settings and incomplete report links. A report requires an unambiguous valid selection. Recovery
explicitly discards invalid settings and returns to setup while preserving valid selections;
no first value is chosen from repeated settings. Invalid or repeated parcel identifiers do not
trigger an automatic lookup. API coordinate query values must be finite decimal numbers within
the existing bounds, with empty values rejected rather than interpreted as zero. This does not
establish a new cadastral identifier format or change the open questions about parcel selection.

### Decyzje jeszcze niepodjęte

Poza GUGiK ULDK dla lokalizacji działek, GUGiK NMT i ortofotomapą dla ukształtowania terenu,
katalogiem wyboru upraw opartym na ARiMR GSA 2025, ISRIC SoilGrids250m 2.0 dla punktowego profilu
gleby, CDSE Sentinel-2 L2A dla historii NDMI/NDVI, Open-Meteo z NASA POWER jako fallbackiem dla
danych meteorologicznych, OpenStreetMap przez Overpass API dla hydrologii i użytkowania terenu
oraz metodą centralnej oceny opisaną wyżej nie wybrano ostatecznie: regionalnie kalibrowanych
polskich długości faz rozwoju, profili dla pozostałych upraw z katalogu ARiMR, reguły
kwalifikowania anomalii satelitarnych jako przesłanki,
hostingu ani zakresu funkcji opcjonalnych. Przyjęta metodologia rozstrzyga
interpretację rozbieżnych scenariuszy, lecz jej walidacja naukowa i operacyjne kryteria jakości
danych nadal wymagają wykonania.

Wcześniejsza rozmowa o potencjalnych źródłach danych nie oznacza akceptacji obowiązkowych integracji.

### Zasada aktualizacji

Przy rozstrzygnięciu otwartej kwestii odnotować datę, treść decyzji, jej źródło i wpływ na wymagania. Rozróżniać odpowiedź organizatora, decyzję właściciela projektu oraz robocze założenie. Nie oznaczać wymagania jako spełnionego bez odpowiedniego dowodu.

## 15. Pytania otwarte

| ID   | Pytanie                                                                                                              | Dlaczego wpływa na zakres                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Q-01 | Czy „ostatnie 10 lat” oznacza okres względem wydarzenia, czy względem każdej wybranej daty? Jakie są daty graniczne? | Określa wymagany zasięg archiwów i ocenę najstarszych dat.                                  |
| Q-02 | Jaki zakres historii jest oczekiwany dla każdej kategorii danych?                                                    | Rozróżnia szeregi dynamiczne i datowane mapy względnie trwałych cech.                       |
| Q-03 | Czy tryb historyczny ma rekonstruować warunki, czy odtwarzać decyzję z informacjami dostępnymi wówczas?              | Określa dopuszczalny kontekst czasowy danych i wniosków.                                    |
| Q-04 | Czy do historii można użyć aktualnych granic i warstw przestrzennych?                                                | Wpływa na dostępność analizy dla przekształconych działek.                                  |
| Q-05 | Jaką uprawę podaje się dla dawnej daty: faktyczną z sezonu czy hipotetyczną?                                         | Zmienia znaczenie wyniku i opis wejścia.                                                    |
| Q-06 | Jakie uprawy powinien obejmować prototyp?                                                                            | Brief nie podaje zamkniętej listy ani minimalnej liczby.                                    |
| Q-07 | W jakim formacie jury poda numer działki i kontekst lokalizacji?                                                     | Zapobiega niejednoznacznemu wyszukiwaniu.                                                   |
| Q-08 | Jaki wiek danych jest dopuszczalny w ocenie bieżącej i kiedy raport częściowy jest akceptowalny?                     | Wpływa na granice wiarygodnej oceny i zachowanie przy brakach.                              |
| Q-09 | Jak szczegółowe mają być wskazania miejsc retencji?                                                                  | Rozróżnia opis potencjału, obszar do oględzin i szczegółową lokalizację działania.          |
| Q-10 | Jak interpretować zapis Windows oraz Safari i pozostałe przeglądarki? Jakie wersje będą oceniane?                    | Wyznacza rzeczywistą macierz zgodności.                                                     |
| Q-11 | Jaka jest treść brakującego załącznika naukowego?                                                                    | Bez niego nie można deklarować spełnienia zawartych w nim wytycznych.                       |
| Q-12 | Jak długo prototyp ma być dostępny, jaki jest termin zgłoszenia i dokładna procedura dostępu jury?                   | Dane organizacyjne muszą pochodzić z platformy lub od organizatora.                         |
| Q-13 | Jakie typy wyników będą porównywane z referencjami jury?                                                             | Pomaga zaplanować walidację; nie uprawnia do wymyślania nieznanych wartości ani tolerancji. |

Brak odpowiedzi należy ujawniać w planie. Jeżeli potrzebne jest robocze założenie, opisać jego zakres i konsekwencje; nie przedstawiać go jako oficjalnej interpretacji.

## 16. Kryterium gotowości do zgłoszenia

Gotowość należy oceniać oddzielnie dla produktu i materiałów. Lista poniżej nie potwierdza, że prace zostały wykonane.

- [ ] Można przeprowadzić analizę nowej działki z Polski po identyfikatorze.
- [ ] Można wskazać uprawę i datę bieżącą albo historyczną.
- [ ] W analizie rzeczywiście uczestniczą wszystkie wymagane kategorie danych.
- [ ] Aplikacja wylicza ocenę stanu na datę analizy i podatność wieloletnią.
- [ ] Rekomendacje retencyjne i agrotechniczne mają uzasadnienia w danych.
- [ ] Raport zawiera źródła, daty, ograniczenia i jawne braki.
- [ ] Działa co najmniej jedna forma utrwalenia raportu.
- [ ] Zapisano wyniki walidacji oraz nierozwiązane ograniczenia.
- [ ] Uruchomienie przez osobę zewnętrzną jest możliwe zgodnie z dokumentacją.
- [ ] Uporządkowano prawa użycia danych i komponentów.
- [ ] Przygotowano wszystkie obowiązkowe materiały zgłoszenia i dostęp jury.
- [ ] Zmierzono czas odpowiedzi; stopień realizacji preferencji 30 sekund jest opisany zgodnie z wynikiem pomiaru.
- [ ] Otwarte pytania rozstrzygnięto albo jawnie opisano przyjęte założenia i ich wpływ.

## 17. Najważniejsze pułapki interpretacyjne

- Dane z ostatnich 10 lat i możliwość podania historycznej daty to wymagania, które trzeba uwzględnić łącznie.
- Sposób oceny jury wymaga obsługi numeru działki, mimo alternatywnego wejścia mapowego w opisie scenariusza.
- „Dane przestrzenne” obejmują także użytkowanie i ukształtowanie terenu, nie tylko granicę działki.
- Nawadnianie, mobilność i AI nie są obowiązkowym minimum.
- 30 sekund to preferencja oceny, nie opisany w briefie automatyczny próg odrzucenia.
- Utrwalenie raportu wymaga co najmniej jednej dopuszczonej drogi, a prezentacja konkursowa odrębnie wymaga PDF.
- Dane przygotowane wcześniej są dopuszczalne; gotowe porady odtwarzane zamiast analizy nie spełniają wymagań.
- Raport o braku danych nie zastępuje realizacji obowiązkowych kategorii danych w produkcie.
- Dostawcy wymienieni przez organizatora są przykładami.
- Nie należy deklarować znajomości brakującego załącznika naukowego ani zgodności z nieznanymi referencjami jury.
