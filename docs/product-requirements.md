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

- Wymagania mają być zapisane przenośnie, tak aby agent programistyczny mógł używać ich jako kontekstu projektu. [S2]
- Obowiązkowy zakres i elementy opcjonalne należy rozróżniać zgodnie z [S1].
- Wybrano bazowy stos i strukturę techniczną: monorepo pnpm, React/Vite/TypeScript, Node.js/Fastify oraz PostgreSQL/PostGIS. Szczegóły i reguły pracy z repozytorium opisuje `AGENTS.md`.
- Utworzony szkielet techniczny nie potwierdza realizacji funkcji produktu opisanych w sekcji 5 ani przeprowadzenia ich walidacji.
- Wyniki domenowe i decyzje mają pozostać deterministyczne; ewentualny LLM może wspierać prezentację wcześniej obliczonego wyniku, ale nie stanowić źródła oceny bez osobnej decyzji.

### Decyzje jeszcze niepodjęte

Nie wybrano ostatecznie: listy upraw, metody oceny, progów, prezentacji niepewności, dostawców danych, sposobu utrwalenia raportu, hostingu ani zakresu funkcji opcjonalnych.

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
