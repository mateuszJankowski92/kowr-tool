---
target: widok Historia kondycji uprawy
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-11-21T17-28-56Z
slug: ures-satellite-history-satellitehistorysection-tsx
---
# Ocena widoku „Historia kondycji uprawy”

## Design Health Score

| # | Heurystyka | Wynik | Główny problem |
|---|---|---:|---|
| 1 | Widoczność stanu systemu | 3/4 | Data, jakość i stan są widoczne, ale brakuje wartości wybranego NDMI/NDVI. |
| 2 | Zgodność z językiem użytkownika | 2/4 | NDMI, NDVI, scena i poprawne piksele wymagają wiedzy GIS. |
| 3 | Kontrola użytkownika | 3/4 | Kontrole są kompletne, lecz brakuje szybkiego przejścia do dobrej obserwacji. |
| 4 | Spójność i standardy | 3/4 | Warstwa wizualna jest spójna, ale wynik, data i jakość są od siebie oddalone. |
| 5 | Zapobieganie błędom | 2/4 | Słaba obserwacja może być domyślna i nie ma filtra jakości. |
| 6 | Rozpoznawanie zamiast pamiętania | 3/4 | Opcje są widoczne, lecz użytkownik musi pamiętać znaczenie wskaźników i skali. |
| 7 | Elastyczność i wydajność | 2/4 | 154 obserwacje bez filtrów, skoku po miesiącach i klikania wykresu są uciążliwe. |
| 8 | Estetyka i minimalizm | 3/4 | Widok jest spokojny i wiarygodny, ale wykres zajmuje dużo miejsca przy małej precyzji odczytu. |
| 9 | Rozpoznanie i naprawa błędu | 3/4 | Problem jakości jest opisany, lecz brakuje działania naprawczego. |
| 10 | Pomoc i dokumentacja | 2/4 | Ograniczenia naukowe są opisane, ale brakuje objaśnień terminów przy kontrolkach. |
| **Razem** | | **26/40** | **Akceptowalna, solidna baza; potrzebna istotna poprawa UX.** |

## Design Specificity Verdict

Widok jest wyraźnie zaprojektowany dla analizy działki: Sentinel-2, prawdziwe daty, udział
poprawnych pikseli, zachmurzenie, źródło i ostrożne zastrzeżenia naukowe budują wiarygodność.
Nie wygląda jak generyczny dashboard. Nadal jednak odpowiada na pytanie „jak wyglądają dane
teledetekcyjne?”, a nie na pytanie rolnika „która obserwacja jest wiarygodna i co właściwie widzę?”.

Detektor nie znalazł problemów automatycznych (0 wyników). Inspekcja przeglądarkowa była
niedostępna z powodu zajętego profilu Chrome DevTools, dlatego dowodem wizualnym była dostarczona
makieta oraz statyczna inspekcja komponentu. Nie utworzono nakładki w przeglądarce.

## Ogólne wrażenie

Wizualnie jest to dobry, spokojny i profesjonalny widok. Największa szansa na poprawę polega na
zbudowaniu wyraźnego „wyniku wybranej obserwacji” oraz poprowadzeniu użytkownika od słabego zdjęcia
do najbliższej użytecznej obserwacji.

## Co działa

1. Uczciwość naukowa: NDMI nie jest przedstawiane jako wilgotność gleby ani dowód suszy.
2. Kontrole są logicznie zebrane: rok, warstwa, suwak, poprzednia/następna data i przezroczystość.
3. Jakość danych nie jest ukrywana: widoczne są poprawne piksele, chmury, ocena i ostrzeżenie.

## Priorytety

### P1 — Brak głównego wyniku wybranej obserwacji

Użytkownik widzi datę i jakość, ale nie widzi liczbowej wartości NDMI/NDVI. Należy dodać blok
`NDMI 0,12`, jakość i neutralny opis wiarygodności, bez automatycznej diagnozy agronomicznej.

### P1 — Słaba jakość bez ścieżki naprawy

Ostrzeżenie jest poprawne, lecz użytkownik musi ręcznie przeglądać 154 daty. Należy domyślnie
wybrać najbliższą obserwację spełniającą próg albo dodać akcję „Pokaż najbliższą dobrą obserwację”
oraz filtr „Użyteczne obserwacje / Wszystkie”. Trzeba objaśnić, dlaczego 0% chmur w scenie może
współistnieć z 30,7% poprawnych pikseli na działce.

### P1 — Wykres słabo komunikuje zmianę sezonową

Gęste, odłączone punkty, tylko dwie etykiety osi czasu i brak wartości wybranego punktu sprawiają,
że wykres wygląda jak rozrzut, nie historia sezonu. Należy dodać miesięczne znaczniki osi,
pionową linię wybranej daty, etykietę wartości i rozróżnienie obserwacji odrzuconych jakościowo.

### P2 — Terminologia jest zbyt techniczna

`Krycie warstwy` należy zmienić na `Przezroczystość warstwy`. NDMI/NDVI powinny dostać krótkie,
ostrożne objaśnienia w zwykłym języku. W nagłówku warto powtórzyć kontekst działki i uprawy.

## Persona Red Flags

**Doświadczony użytkownik:** brak klikania punktów wykresu, filtrów jakości, skoku po miesiącach i
widocznej wartości wybranego punktu utrudnia pracę na 154 obserwacjach.

**Użytkownik klawiatury lub czytnika ekranu:** wykres ma opis całości, ale punkty nie są
fokusowalne i nie mają alternatywy tabelarycznej. Przyciski warstw mają ok. 32 px wysokości, czyli
mniej niż solidny cel dotykowy 44 px. Znaczenie legendy nadal mocno opiera się na kolorze.

**Rolnik bez wiedzy GIS:** skróty pojawiają się przed prostym wyjaśnieniem, 0% chmur i 30,7%
poprawnych pikseli wygląda sprzecznie, a ostrzeżenie nie mówi, jak znaleźć lepszą datę.

## Drobniejsze uwagi

- Data jest zbyt daleko od uchwytu suwaka na szerokim ekranie.
- `53 z 154` warto uzupełnić o liczbę obserwacji użytecznych.
- Próg 70% wymaga krótkiego uzasadnienia.
- „Stan katalogu” może trafić do spokojniejszej sekcji szczegółów.
- Wykres ma zbyt dużą wysokość względem ilości przekazywanej informacji.
- Dla odcinka z jednym poprawnym punktem polilinia jest niewidoczna; uczciwe luki sprawiają, że
  całość wizualnie staje się wykresem punktowym mimo tytułu sugerującego linię.

## Pytania do decyzji

- Czy podstawowym zadaniem jest oglądanie danych, czy szybkie znalezienie wiarygodnej obserwacji?
- Czy słabe obserwacje powinny być widoczne domyślnie, czy dopiero po wybraniu „Pokaż wszystkie”? 
- Jakie jedno zdanie użytkownik powinien umieć powiedzieć po obejrzeniu tego widoku?
