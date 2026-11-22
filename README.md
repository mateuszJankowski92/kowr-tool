# HydroPlon

Monorepo prototypu wspierającego ocenę sytuacji wodnej działek rolnych. Projekt składa się
z aplikacji React/Vite, API Fastify oraz bazy PostgreSQL z rozszerzeniem PostGIS.

## Dokumentacja produktu

- [Wymagania projektu](docs/product-requirements.md) — zakres konkursowy, wymagania,
  kryteria akceptacji, materiały zgłoszenia i otwarte pytania.
- [Instrukcje dla agentów](AGENTS.md) — zasady architektury, implementacji i walidacji zmian.

## Wymagania

- Node.js 22+
- pnpm 10+
- Docker z Docker Compose

The pinned PostGIS image is published for `linux/amd64`. Compose selects that platform explicitly;
Docker Desktop on Apple Silicon must support amd64 emulation.

## Pierwsze uruchomienie

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

Po uruchomieniu:

- aplikacja: http://localhost:5173
- API: http://localhost:3000
- dokumentacja OpenAPI: http://localhost:3000/docs
- health check: http://localhost:3000/api/health

Frontend zawiera interaktywną mapę Polski opartą na publicznych usługach GUGiK. Udostępnia
podkład BDOO/BDOT10k, ortofotomapę standardową oraz wybór działki przez kliknięcie na mapie
lub podanie pełnego identyfikatora ewidencyjnego. API pobiera granicę i podstawowe dane
działki z Usługi Lokalizacji Działek Katastralnych (ULDK), z timeoutem 8 sekund i jawną
informacją o źródle danych. Adapter nie podąża za nieprawidłowymi przekierowaniami ULDK. Przy
technicznej awarii usługi odpytuje oficjalny zbiorczy WFS EGiB przez HTTPS, używając dokładnego
identyfikatora albo przestrzennego filtra wskazanego punktu, i oznacza rzeczywiste źródło geometrii.
Both basemaps limit tile retrieval to the Polish map extent: GUGiK may return an empty HTTP 200
image outside coverage. Visible tile failures retain a retryable warning; a late successful load
or a completed viewport without those failures clears it automatically.
Successful parcel lookups are reused by identifier for five minutes in a bounded API-memory cache,
including parcels first selected by map point. This keeps independent report sections from
repeating the same cadastral lookup during a transient GUGiK outage. Errors and not-found results
are not cached; the original source and retrieval time remain unchanged.
Po potwierdzeniu działki użytkownik może wybrać uprawę oraz jeden
dzień albo domknięty zakres dat z ostatnich 10 lat; konfiguracja jest zapisywana w adresie URL.
Invalid links show a recoverable warning in the selection panel. Unknown or repeated settings,
invalid values, conflicting dates and incomplete report links cannot open a report. Recovery
removes invalid settings and the report flag while retaining valid selections; repeated values
are discarded together rather than choosing the first. Empty or repeated parcel identifiers do
not trigger a lookup. The parcel API also rejects empty, non-decimal, repeated or out-of-range
coordinate query values with `400 INVALID_REQUEST` before calling a provider.
Lista wyboru jest przeszukiwalnym comboboxem z ikonami i grupami roślin. Korzysta z lokalnej,
wersjonowanej migawki pól `roslina` i `grupa_roslin` z publicznej warstwy ARiMR „Deklaracje rolne
2025 — uprawy (GSA)”. Aplikacja nie odpytuje ARiMR podczas otwierania formularza. Katalog można
odtworzyć poleceniem `pnpm crops:update`. Po zatwierdzeniu działki API sprawdza rzeczywiste
przecięcie jej granicy z deklaracjami GSA 2025. Jedna dominująca deklaracja uzupełnia sugestię,
a kilka istotnych upraw pozostawia decyzję użytkownikowi. Sugestia nie jest niezależnym
potwierdzeniem faktycznie rosnącej rośliny i zawsze może zostać zmieniona ręcznie.
The Polish interface guides the user through parcel selection, crop/date selection, and the
report. The report shows the water assessment first, practical actions second, and the historical
comparison next. Historical charts, parcel metadata, and crop assumptions are expandable; source
and methodology drawers remain available next to section headings. Missing inputs and assessment
limitations remain visible beside the results.

The top navigation groups icon-only help and print controls. The printer opens a dropdown
with **Raport prosty** and **Raport rozszerzony**. Printing becomes available after a valid
parcel, crop and analysis date are selected and the report is open. Both include the water
assessment, recommendations with their evidence, the historical chart, the weather chart,
and source dates and limitations. The extended version adds scenario comparisons, all annual
details, terrain and water diagrams, satellite and soil results, and an appendix with methods
and data tables. Choosing a version prepares its data in the background and opens the browser's
native print preview directly; there is no additional in-app preview. Choose A4 portrait at
100% scale and use the browser's **Save as PDF** destination when a file is needed.
Independent source failures remain explicit in the printable report and do not block printing.
Page count follows content; the simple report is not guaranteed to fit two pages. Major extended
chapters start on new pages; charts and short recommendation blocks are kept together.
Print preparation can be cancelled from the same dropdown; the printer icon shows its loading state. Closing the native print dialog returns to the original
report without changing its expanded sections. No PDF server or additional dependency is used.
Extended print maps include the existing GUGiK orthophoto beneath the parcel and numbered water
objects or inspection locations. The image and vector overlays share EPSG:2180 bounds; long
features stay within the local context. Tile retrieval has a 12-second budget and at most four
concurrent requests per map. Printing waits for the raster image; a failed source leaves an
explicit warning alongside the available shapes. The caption preserves retrieval time and
explains that image acquisition dates are unavailable and historical reports use current imagery.

Terrain/surroundings, weather charts, satellite history, and the soil profile are available under
“Poznaj dane swojej działki”. These detailed sections mount when first opened and remain mounted
when collapsed. The assessment and recommendations still retrieve the sources they need
independently of these disclosures. The soil section presents the modelled profile to 200 cm. Frontend wykonuje jedno zapytanie
do API dla reprezentatywnego punktu wewnątrz działki. Backend pobiera równolegle z oficjalnego
WMS ISRIC dziewięć właściwości; każde zapytanie obejmuje wszystkie przedziały głębokości oraz
medianę Q0.50 z przedziałem niepewności Q0.05–Q0.95. Oprócz składu i właściwości fizycznych
profil zawiera modelowaną objętościową zawartość wody przy 10, 33 i 1500 kPa. Endpoint jest
dostępny jako
`GET /api/soil-profiles?parcelIdentifier=<identyfikator>`.

Centralna ocena FAO-56 nie blokuje się na właściwościach pomocniczych profilu. Pobiera tylko trzy
warstwy retencji `wv0010`, `wv0033` i `wv1500`, wymagane przez bilans, a brak pH, tekstury lub SOC
nie unieważnia symulacji. Identyczne zapytania właściwości są współdzielone i przechowywane w
pamięci przez 24 godziny. Kompletne właściwości źródłowe są dodatkowo zapisywane bez krótkiego TTL
w PostgreSQL dla dokładnej lokalizacji próbki, razem z produktem, wersją, rozdzielczością,
jednostką, datą pobrania i źródłem. Timeouty, błędy sieciowe, HTTP 429 i 5xx mają najwyżej jedno
ponowienie z ograniczonym uwzględnieniem `Retry-After`.
A WMS service exception or an empty response is a provider failure, not evidence of no soil data.
After a raster-layer exception, or after the bounded retry of an empty response, the adapter
recovers individual depth/quantile layers with at most six concurrent recovery requests and a
12-second recovery budget per property. It prioritizes medians needed by FAO-56, keeps successfully
retrieved quantiles, and leaves unavailable values null. Incomplete properties are not retained in
the memory or PostgreSQL cache, so a later request can recover missing values. A valid GeoJSON
response with no feature or a null pixel remains known absence (`no-data`).

The persistent cache requires PostgreSQL to be running (`pnpm db:up`) and migrations to be applied
(`pnpm db:migrate`). If the database is unavailable, live retrieval still works, but source values
are not preserved across API restarts. Previously retrieved source data may be restored to the
cache only after validating the payload, exact sample location, product, and original retrieval
time; test fixtures must never be imported into a production cache.

SoilGrids250m 2.0 ma nominalną rozdzielczość 250 m i licencję CC BY 4.0. Wynik opisuje jedną
komórkę modelu, nie średnią z całej działki ani pomiar terenowy. Nie przedstawia aktualnej
wilgotności i nie zależy od daty analizy. Publiczne REST API SoilGrids jest obecnie oficjalnie
wstrzymane, dlatego domyślna integracja korzysta z WMS `GetFeatureInfo` z timeoutem 12 sekund na
próbę. Awaria jednej właściwości daje jawny wynik częściowy, a awaria wszystkich — stan
niedostępności. Aplikacja nigdy nie zastępuje odpowiedzi danymi demonstracyjnymi. WCS pozostaje
planowaną ścieżką dla przyszłego wycinka przestrzennego i agregacji wielu komórek.

API zachowuje dwa jawne warianty pojemności potencjalnie dostępnej: dla 33 i 10 kPa, po odjęciu
zawartości przy 1500 kPa. Uproszczony widok porównuje warstwy za pomocą wariantu 33 kPa
odniesionego do jednostki objętości, dzięki czemu grubsze warstwy nie otrzymują wyższej oceny tylko
ze względu na swoją grubość. Jedna stała skala kolorów obowiązuje dla wszystkich profili, a krótki
wniosek opisuje wyłącznie wyraźną różnicę między górną i głębszą częścią profilu. Wynik nie jest
bieżącym zapasem wody ani ilością dostępną dla konkretnej uprawy bez informacji o jej korzeniach.

Raport zawiera kompaktową kartę „Obserwacje satelitarne” opartą na Sentinel-2 L2A. Dla daty
analizy backend przeszukuje 60 wcześniejszych dni, nie dopuszcza obserwacji z przyszłości i wybiera
najnowszą obserwację, dla której mediana NDMI i lokalna jakość pikseli działki spełniają kryteria
aplikacji. Karta pokazuje jeden z trzech stanów: dane dostępne, dane ograniczone albo brak
wystarczających danych. Trend NDMI jest liczony metodą Manna-Kendalla i Theila-Sena przy co
najmniej czterech użytecznych obserwacjach. Do porównania z FAO-56 kwalifikuje się wyłącznie świeża
obserwacja (do 14 dni), a cały użyty szereg musi mieścić się w środkowej fazie wszystkich aktywnych
scenariuszy uprawy. Sygnał jest raportowany jako zgodny, sprzeczny, neutralny albo niekwalifikowany;
nigdy samodzielnie nie zmienia klasy bilansu wodnego.

### Konfiguracja Copernicus Data Space Ecosystem

Po utworzeniu klienta OAuth w CDSE uzupełnij w lokalnym `.env`:

```dotenv
CDSE_CLIENT_ID=...
CDSE_CLIENT_SECRET=...
```

Następnie uruchom API ponownie. Użytkownik aplikacji nie loguje się do CDSE. Bez konfiguracji
aplikacja nadal pobiera daty z publicznego katalogu, ale jawnie oznacza wynik jako częściowy i nie
udostępnia obrazów ani statystyk. Sekret pozostaje w API i nie jest wysyłany do przeglądarki.

Integracja zachowuje publiczne [STAC API](https://stac.dataspace.copernicus.eu/v1/),
[Process API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Process.html) oraz
[Statistical API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html).
Kompaktowa karta używa STAC i Statistical API; Process API pozostaje dostępne w zachowanym
endpoincie obrazów, ale karta go nie wywołuje.
Wyniki są opisane jako „Contains modified Copernicus Sentinel data”. Korzystanie podlega warunkom
i limitom bezpłatnego konta CDSE. NDVI i NDMI są bezwymiarowymi wskaźnikami odbicia spektralnego,
nie procentową wilgotnością gleby ani samodzielnym dowodem suszy. Maska SCL usuwa brak danych,
chmury, cienie chmur, śnieg i piksele o niepewnej klasyfikacji. Szczegóły jakości wybranej
obserwacji są dostępne w rozwijanej sekcji karty. Awaria statystyk NDVI nie usuwa dostępnych
statystyk NDMI; brak obliczeń NDMI jest odróżniony od niewystarczającej jakości zdjęć. Karta
wyjaśnia rzeczywistą przyczynę braku porównania z bilansem, w tym odrębny okres zakończonej
uprawy, i nie przypisuje późniejszej roślinności automatycznie do wybranej uprawy. Procent
pokrycia użytecznymi danymi nie oznacza pewności oceny. Szczegóły źródła zawierają rozdzielczość
NDMI 20 m i atrybucję Copernicus.

Raport zawiera sekcję „Opady i warunki pogodowe”. API pobiera dla reprezentatywnego punktu działki
dzienne opady, temperaturę i referencyjną ewapotranspirację z Open-Meteo ERA5. Jeżeli
Open-Meteo odrzuci lub przerwie żądanie, cały zestaw porównawczy jest pobierany z NASA POWER,
bez mieszania źródeł pomiędzy latami. Dla NASA POWER aplikacja oblicza ET₀ dla trawy metodą
FAO-56. Wyniki obejmują analizowany okres i odpowiadające mu okresy z dziesięciu lat. Endpoint:
`POST /api/weather-conditions`.

Główny widok pokazuje sumę opadów i jeden grupowany wykres: dla każdego przedziału zestawia
wybrany okres z medianą kompletnych, analogicznych przedziałów z 10 lat poprzedzających rok
analizy. Mediana wymaga co najmniej pięciu kompletnych lat i nie jest przedstawiana jako norma
klimatyczna. Porównanie „mniej”, „w typowym zakresie” albo „więcej” dla całego okresu nadal wynika
z empirycznych kwartyli, a nie ze stałego progu w mm. Dla okresów do 31 dni wykres pozostaje
dzienny, do 180 dni używa kolejnych tygodni, a dla dłuższych zakresów miesięcy. Niepełny przedział
pozostaje luką. ET₀, P − ET₀, tabela dzienna i pełna metodologia są zachowane w rozwijanych
szczegółach.

The weather timeline also shows solar radiation as a yellow line on a separate MJ/m² axis.
It sums daily incident shortwave energy over the same displayed daily, weekly or monthly buckets;
it is neither a UV index nor sunshine duration. Open-Meteo supplies `shortwave_radiation_sum`,
and NASA POWER supplies the already-requested `ALLSKY_SFC_SW_DWN`. A bucket with any missing
radiation day remains a gap, with explicit coverage information; radiation is also included in
the daily source table. Sources and their time standards stay separate, as before.

P − ET₀ jest prezentowane jako uproszczony wskaźnik meteorologiczny, a nie ilość wody w glebie,
diagnoza suszy lub dawka nawadniania. Open-Meteo ERA5 ma rozdzielczość około 25 km, a
NASA POWER około 0,5° × 0,625° dla meteorologii i 1° dla promieniowania. Oba wyniki opisują punkt
i komórkę modelu, nie pomiar ani średnią z całej działki. Brakujące dni pozostają jawnie oznaczone;
aplikacja nie zamienia ich na zero i nie oblicza P − ET₀ z niepełnych szeregów.
Adapter NASA sprawdza jednostki odpowiedzi; `ALLSKY_SFC_SW_DWN` jest przyjmowane bez dodatkowej
konwersji jako `MJ/m²/day`. Najnowsze dane słoneczne mogą pojawiać się później niż opady i
temperatura, dlatego ET₀ może pozostać niedostępne mimo dostępnej sumy opadów.

For the central and historical FAO-56 assessments, an incomplete ERA5 season may be replaced
by one complete ECMWF IFS operational-analysis series (about 9 km, from 2017). NASA POWER is the
next alternative. The selected model and resolution remain explicit; daily records are never
spliced between models. The precipitation-comparison section continues to use a single
ERA5/NASA provider across its comparison years.

Winter rapeseed now uses two transparent project calendars: INRAE CropWat `SB2023-colza` phase
proportions rescaled to the published NE Poland 317–335 day season envelope. These calendars are
screening assumptions, not locally calibrated phase dates. Sources, derivation, and validation
are documented in [the methodology](docs/water-situation-methodology.md).

### Centralna ocena FAO-56

Endpoint `POST /api/analyses` łączy działkę z ULDK, pełną dzienną serię pogodową, sześć warstw
SoilGrids i profil uprawy z deterministycznym silnikiem FAO-56.

The selector includes today. API dates follow the Europe/Warsaw calendar, and the ongoing day's
daily totals remain missing until the day is complete. The primary `analysisDate` and
`evaluation.evaluatedThroughDate` always retain the requested date. When a crop's modelled season
has ended, the primary result exposes weather context with `insufficient-data` for crop stress;
`completedSeason` separately preserves the computed crop-season balance. Its own `evaluation`
identifies the earlier period. `requestedDateConditions` supplies rainfall and ET0 for the
requested day and a trailing 30-day comparison, with source and coverage. P minus ET0 is not soil
moisture or a drought diagnosis. No crop water demand is extrapolated beyond its modelled season.

When the client omits phenology, the API selects a project reference season start for the
supported crop profile. These dates represent central-Polish periods published by Centrum
Doradztwa Rolniczego; they are assumptions, not confirmed sowing dates on the parcel. The web
form asks for the crop and analysis date or range, and uses this automatic start throughout
the report. It has no additional planting settings or URL override. The report discloses the
assumed start and its limitations. Direct API clients can still supply explicit phenology scenarios.

```bash
curl -X POST http://localhost:3000/api/analyses \
  -H 'content-type: application/json' \
  -d '{
    "parcel": { "type": "identifier", "identifier": "141201_1.0001.6509" },
    "crop": "pszenica-zwyczajna-jara",
    "analysisDate": "2025-06-30",
    "wettingTiming": "unknown",
    "includeSatellite": true
  }'
```

Odpowiedź rozdziela kompletność źródeł od klasyfikacji bilansu i zawiera konfiguracje scenariuszy,
zakres `Ks`, epizody modelowanego ograniczenia ET, kody przyczyn, ograniczenia, źródła oraz czasy.
Pole `assessmentLevel` rozróżnia pełny FAO-56, wynik zależny od założeń, ocenę ograniczoną, sam
kontekst meteorologiczny i brak możliwości oceny. Częściowo ukończone rodziny scenariuszy pozostają
widoczne i nie są przedstawiane jako pełny wynik.
Open-Meteo i NASA POWER są alternatywami dla całego szeregu — nie są sklejane dzień po dniu.
Przy częściowym szeregu API wskazuje konkretne brakujące daty i pola (`precipitation` lub `et0`)
oraz ostatni dzień kompletnego, ciągłego szeregu, który interfejs może zaproponować użytkownikowi.
Nieobsługiwana uprawa, brak referencyjnych długości faz lub data przed modelowanym sezonem daje
ograniczony kontekst jednego dnia i `insufficient-data`. Po zakończeniu sezonu raport pokazuje
bilans zakończonego okresu i odpowiadającą mu historię, z jawnym zastrzeżeniem, że nie jest to
pomiar bieżącej wilgotności. Rekomendacje planowania kolejnego sezonu korzystają wtedy z liczby
dni ograniczenia w całym okresie, nie tylko z wyniku ostatniego dnia. Przedziały wyników są rozrzutem
scenariuszy, a nie przedziałem ufności; ograniczenie ET nie jest prognozą straty plonu.

The crop engine contains 61 reference profiles plus nine project estimation profiles and 678
explicit ARiMR mappings, including dry-seed
faba bean (`bobik`), fresh broad bean, pulses, cereals, vegetables, orchards and berries. Parameters
come from FAO-56 (1998), with twelve added profiles using the revised 2025 coefficient/root/depletion
tables. The additional calendar starts are prototype assumptions;
related-crop phase proxies and established-perennial assumptions are disclosed. This is not local
phenology calibration. When species parameters are absent, an explicit crop-group estimate supplies
canopy, root-zone and production-calendar assumptions, including forage, seed and cover-crop
variants. Existing reviewed mappings take precedence. Both assessment responses require
`crop.modelKind`; approximate models are identified beside current and historical results, with
parameter sources and assumptions in their details and printed reports. Weather/soil gaps remain
explicit and can still prevent calculation. The sole environmental-only catalog entry is
`pieczarka`: mushrooms have no plant root zone and outdoor FAO-56 does not apply. See
[methodology](docs/water-situation-methodology.md#crop-profiles) and the
[679-entry catalog review](docs/crop-catalog-review.md).

`GET /api/crops` exposes model availability from the calculation engine. The picker labels every
entry as a species reference, an approximate model (borrowed parameters/use or phase calendar),
or environmental context only. Metadata loading/failure is distinct from lack of a crop model.
The latest extension covers spring/winter rye, winter barley, spring rape, common buckwheat,
strawberry and spring/winter triticale proxies; see the review for reference limitations.

### Rekomendacje dla działki

Endpoint `POST /api/recommendations` jest deterministycznym etapem kompozycji wyników, które
frontend uzyskał już z centralnej oceny, SoilGrids oraz kontekstu terenu. Nie pobiera ponownie
zewnętrznych danych. Reguły wybierają do czterech działań retencyjnych lub agrotechnicznych i dla
każdego zachowują priorytet, przesłanki liczbowe, brakujące wejścia oraz wymaganą weryfikację.
Interfejs współdzieli zapytania TanStack Query z pozostałymi sekcjami raportu.

Okrywa gleby i zachowanie resztek są proponowane tylko przy rozpoznanym użytkowaniu rolniczym;
FAO opisuje ich rolę w ograniczaniu parowania i zwiększaniu infiltracji. Praktyki konturowe są
wyłącznie tematem do sprawdzenia przy co najmniej 1° typowego spadku albo 2 m różnicy wysokości;
to projektowy próg przesiewowy, a nie kryterium techniczne. Bliskość obiektu wodnego do 100 m
uruchamia zalecenie oględzin, nie przebudowy. Każdy zbiornik, rów, zmiana odpływu lub inne urządzenie
wodne wymaga rozpoznania terenowego, projektu i sprawdzenia wymogów Wód Polskich. Aplikacja nie
wyznacza automatycznie lokalizacji urządzeń i nie obiecuje wzrostu plonu ani oszczędności wody.

The recommendation request includes `crop` and `cropPeriod`. Actions distinguish a standing
annual crop, post-season planning, perennial interrows and perennial ground cover. Unsupported
profiles keep uncertainty visible. Retention actions include `locations`: actual mapped water
geometry or valid NMT inspection cells inside the parcel, with source and cell size. The numbered
locations can be opened on a map below the actions. They identify places to inspect, not confirmed
water-storage sites. Missing location evidence leaves the result partial.

### Historyczna podatność na niedobory wody

Addytywny endpoint `POST /api/historical-analyses` uruchamia ten sam silnik FAO-56 dla dziesięciu
sezonów poprzedzających rok analizy. Domyślnie używa tego samego automatycznie przyjętego początku
sezonu co `POST /api/analyses`; jawna fenologia pozostaje opcjonalnym nadpisaniem dla klientów API.

```bash
curl -X POST http://localhost:3000/api/historical-analyses \
  -H 'content-type: application/json' \
  -d '{
    "parcel": { "type": "identifier", "identifier": "141211_2.0038.102" },
    "crop": "pszenica-zwyczajna-jara",
    "analysisDate": "2025-06-30",
    "wettingTiming": "unknown"
  }'
```

Odpowiedź zachowuje kompletność, źródło i próby dostawców osobno dla każdego roku. Open-Meteo i
NASA POWER są alternatywami dla całego sezonu; braków nie zastępuje się zerem ani danymi drugiego
dostawcy. Jeden profil SoilGrids jest używany we wszystkich sezonach. Udziały mają jawny mianownik
kompletnych lat, a rozrzut scenariuszy nie jest przedziałem ufności. Wynik jest kontrfaktyczną
symulacją obecnie wybranej uprawy, nie potwierdzeniem historycznej rotacji ani strat na polu.
Frontend wywołuje endpoint niezależnie od bieżącej oceny i pokazuje wynik bezpośrednio pod sekcją
„Sytuacja wodna Twojej działki”. Widok rozdziela sezony ze zgodnym wskazaniem ograniczenia,
sezony bez zgodnego wskazania, wyniki zależne od założeń oraz lata niekompletne. Sekcja „Uprawa na
tle poprzednich lat” pokazuje jeden wykres zakresu dni ograniczenia. Po wybraniu roku podaje zakres
deficytu ET i najdłuższego epizodu, kompletność oraz wpływ początkowego uwilgotnienia. Skrajnie
suchy stan początkowy jest testem wrażliwości, nie odtworzeniem historycznej wilgotności; model
sprawdza także, czy warianty mokrego i suchego początku zbiegają się w trakcie symulacji.
Scenariusze nie mają wag prawdopodobieństwa, więc zakres nie jest przedziałem ufności, a mediana
scenariuszy nie wskazuje najbardziej prawdopodobnego roku. Rzeczywisty okres danych, źródła i
pełne ograniczenia pozostają w rozwijanych szczegółach. Frontend domyślnie korzysta z
orientacyjnego terminu, a opcjonalną znaną datę użytkownika przesuwa o pełne lata dla okresów
historycznych.

Raport zawiera także sekcję „Teren, woda i użytkowanie działki”. API pobiera rzeczywiste wysokości z
GUGiK NMT przez WCS, w układzie EPSG:2180 i odniesieniu wysokościowym PL-EVRF2007-NH. Czysta
warstwa analityczna oblicza minimum, maksimum, różnicę wysokości, medianę i 90. percentyl spadku
oraz dominujący kierunek spadku wyłącznie dla komórek leżących w granicy działki. Endpoint
`GET /api/terrain-contexts?parcelIdentifier=<identyfikator>` zwraca ograniczoną siatkę wysokości,
geometrię działki, hydrologię w promieniu 1 km, szacowane udziały klas użytkowania powierzchni
w granicy działki oraz jawne metadane źródeł.

Frontend buduje z tej siatki interaktywną powierzchnię Three.js bez sztucznego zwiększania skali
pionowej. Teksturę pobiera oddzielnie z GUGiK WMS jako ortofotomapę przez endpoint
`GET /api/terrain-textures?parcelIdentifier=<identyfikator>`, dzięki czemu jej awaria nie usuwa
wyników NMT. Model jest ładowany dopiero w pobliżu widoku. Obiekty wodne i poligony użytkowania
terenu pochodzą z bieżącego zrzutu OpenStreetMap pobieranego przez Overpass API. Odległości są
liczone od granicy działki, a udziały powierzchni są deterministycznym oszacowaniem z ograniczonej
siatki próbek. Nieoznaczona część działki pozostaje nierozpoznana; brak obiektu w OpenStreetMap nie
jest interpretowany jako potwierdzony brak w terenie. Awaria GUGiK albo OpenStreetMap pozostawia
wyniki drugiego źródła dostępne i daje jawny stan częściowy. Dane OpenStreetMap są udostępniane na
licencji ODbL i mogą być niekompletne. Dla dat historycznych używany jest bieżący stan mapy, co
raport pokazuje jako ograniczenie. Data pozyskania konkretnego arkusza NMT i ortofotomapy nie jest
udostępniana przez użyte odpowiedzi usług, dlatego pozostaje jawnie nieznana.

The NMT adapter retries a transient connection failure, empty response, HTTP 408 or server error
once within the original 15-second deadline. It does not retry invalid grids, confirmed no-data,
rate limits or caller cancellation. Complete terrain-context responses remain fresh for 30 minutes;
partial responses are immediately stale and can be retried from the section without reloading the
page. Previously fetched results stay visible during a retry and after a refresh request fails.
An ongoing GUGiK outage still produces an explicit partial result.

The terrain section also offers a **Woda na mapie** view using the existing OpenLayers map stack.
The Polish view switch sits over the map in place of the former oblique-view and reset controls.
It shows the four nearest listed water objects as source lines or polygons, with matching numbers
and the parcel boundary. The view fits these objects automatically; selecting a list row or map
object highlights it and fits it together with the parcel. Hovering either representation highlights
its counterpart; keyboard focus on list rows does the same, without refitting the view. Long features are displayed within the
local search bounds. The API includes water geometry as WGS84 GeoJSON. Water geometry remains
available independently of NMT and aerial imagery; imagery failures are reported with a retry.

## Struktura

```text
apps/api               Fastify, integracje i dostęp do PostGIS
apps/web               React, Vite i interfejs użytkownika
packages/contracts     współdzielone kontrakty Zod
packages/analysis      czyste, deterministyczne obliczenia domenowe
packages/typescript-config  wspólna konfiguracja TypeScript
infra/migrations       migracje PostgreSQL/PostGIS
```

## Polecenia

```bash
pnpm dev          # frontend i backend w trybie watch
pnpm check        # lint, typy, testy i build
pnpm crops:update # odśwież lokalny katalog upraw z publicznej warstwy ARiMR GSA 2025
pnpm db:up        # uruchom PostGIS
pnpm db:migrate   # wykonaj migracje
pnpm db:down      # zatrzymaj usługi Dockera
```

## Zasady architektury

- Sekrety dostawców danych pozostają wyłącznie w API.
- Schematy wejścia i odpowiedzi są współdzielone przez `@kowr/contracts`.
- Obliczenia domenowe trafiają do `@kowr/analysis` i nie wykonują operacji sieciowych.
- Każde zewnętrzne źródło danych otrzyma osobny adapter w `apps/api/src/integrations`.
- Brak pojedynczego źródła nie powinien unieważniać całego raportu; wynik może mieć status
  `partial` i jawnie wymieniać ograniczenia.

## Następny krok

Centralna ocena FAO-56 i historyczna podatność są podłączone jako dwie niezależne sekcje raportu.
The form uses the API's automatic, disclosed reference crop-season start.
Brak profilu uprawy lub danych źródłowych daje informację o
niewystarczających danych, nie awarię pozostałych sekcji. Trwały cache PostGIS dla geometrii i
wyników zewnętrznych pozostaje do wdrożenia przed zwiększeniem ruchu do usług publicznych.
