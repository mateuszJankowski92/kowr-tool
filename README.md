# HydroPlon

Hackathon prototype by **Iteracja7**, helping farmers assess water conditions on Polish cadastral
parcels and choose retention and agronomic actions backed by environmental data.

## Features

- Select a parcel on the map or by cadastral identifier; receive a crop suggestion from ARiMR declarations.
- Analyse a crop for a selected date or period, including the previous ten years.
- Explore water-balance scenarios, weather, satellite observations, soil profiles and 3D terrain.
- Get recommendations with evidence, source dates and explicit limitations.
- Print a simple or extended A4 report, or save it as PDF through the browser.

Data comes from GUGiK, ARiMR, SoilGrids, Open-Meteo/NASA POWER, Copernicus and OpenStreetMap.
Model results are estimates, not field measurements; missing data remains explicitly marked.

## Run locally

Requires **Node.js 22+**, **pnpm 10+** and **Docker Compose**. The PostGIS image uses `linux/amd64`;
Apple Silicon requires Docker's amd64 emulation.

```bash
corepack enable
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:migrate
pnpm dev
```

- Application: http://localhost:5173
- API and OpenAPI documentation: http://localhost:3000/docs

For satellite statistics and imagery, set `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` in your local
`.env`, then restart the API. Without them, public observation dates remain available, but satellite
results are limited. Provider secrets stay in the API.

<<<<<<< Updated upstream
## Wdrożenie produkcyjne

Wdrożenie `https://hydroplon.aixir.pl` używa PostgreSQL/PostGIS w Dockerze, API zarządzanego przez
PM2 oraz hostowego Nginx do serwowania frontendu i reverse proxy. Baza jest dostępna wyłącznie na
`127.0.0.1:5433`, a API na `127.0.0.1:3100`.

Wymagania dla hosta:

- rekord DNS `A` `hydroplon.aixir.pl` wskazujący na publiczny adres IPv4 serwera;
- dostępne z internetu porty TCP 80 i 443;
- Docker z wtyczką Docker Compose, PM2, Nginx i Certbot.

Na serwerze utwórz konfigurację poza kontrolą wersji i uruchom stos:

```bash
cp .env.production.example .env.production
# Ustaw zgodne hasło w POSTGRES_PASSWORD, DATABASE_URL i PM2_DATABASE_URL.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

Compose uruchamia bazę i idempotentne migracje. Zbudowane API wraz z zależnościami należy umieścić
w `/opt/hydroplon/api`, migracje w `/opt/hydroplon/infra/migrations`, a wynik builda frontendu w
`/var/www/hydroplon`. Konfiguracje procesu i virtual hosta znajdują się odpowiednio w
`deploy/ecosystem.config.cjs` oraz `deploy/nginx.hydroplon.aixir.pl.conf`. Sekrety z
`.env.production` należy przekazać do środowiska procesu przy `pm2 start` i zachować przez
`pm2 save`; nie wpisywać ich do pliku ecosystem.

Po włączeniu konfiguracji Nginx certyfikat można wystawić poleceniem
`certbot --nginx -d hydroplon.aixir.pl`. Stan wdrożenia sprawdzają:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
pm2 show hydroplon-api
curl --fail https://hydroplon.aixir.pl/api/health
```

Dane bazy są zachowywane w nazwanym wolumenie. Przed operacją usuwającą wolumeny należy wykonać
kopię bazy; zwykłe `docker compose down` ich nie usuwa.

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
=======
## Commands
>>>>>>> Stashed changes

```bash
pnpm dev          # Run frontend and API in watch mode
pnpm check        # Lint, typecheck, tests and production build
pnpm db:up        # Start PostGIS
pnpm db:migrate   # Apply database migrations
pnpm db:down      # Stop Docker services
pnpm crops:update # Refresh the ARiMR crop catalogue
```

## Repository

```text
apps/web             React, Vite, Tailwind CSS and shadcn/ui
apps/api             Fastify, external integrations and persistence
packages/contracts   Shared Zod HTTP contracts
packages/analysis    Deterministic domain calculations
infra/migrations     PostgreSQL/PostGIS migrations
```

## Documentation

- [Sample parcel report (PDF)](docs/examples/hydroplon-raport-prosty.pdf)
- [Product requirements and decisions](docs/product-requirements.md)
- [Analysis methodology and limitations](docs/water-situation-methodology.md)
- [Crop model coverage](docs/crop-catalog-review.md)
- [Architecture and contribution rules](AGENTS.md)
