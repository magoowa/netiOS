# Historia zmian netiOS

## 0.7.2

### Odtwarzacz

- Start kanału nie wisi już bez końca. Po 20 s aplikacja wraca do listy i mówi, gdzie utknęła: moduł DRM (Widevine) telewizora nie odpowiada, serwer licencji Netii nie odpowiada albo Netia nie dostarczyła obrazu.
- Błędy platformy Netia mają czytelne komunikaty: odpowiedź usługi (kod RPC, błąd HTTP, nieprawidłowa odpowiedź), licencja, błędy HTTP i brak połączenia z serwerem strumienia, nieprawidłowy opis strumienia. Długie buforowanie w trakcie oglądania pokazuje na ekranie, że strumień Netii nie dostarcza danych.
- Zamknięcie odtwarzacza z zawieszonym modułem DRM trwa najwyżej 3 s.
- OLED Saver tylko zasłania ekran: obraz i dźwięk grają dalej, a pierwsze naciśnięcie pilota zdejmuje wygaszacz i nic więcej nie robi. Na webOS 4 i 5 wygaszacz zasłania cały ekran (wcześniej był niewidoczny, a obraz stawał).

### Komunikaty

- Każde zdanie komunikatu, i każda część po średniku, zaczyna się od nowej linii.

## 0.7.0

### Seriale i Programy

- Kategorie pochodzą z panelu Filtruj Netii (Gatunki): 22 dla seriali i 13 dla programów. Tytuł należący do kilku gatunków pojawia się w każdym z nich.
- Przycisk **Filtruj** obok sortowania otwiera okno „Filtruj po gatunkach”: przełączniki w czterech kolumnach, widoczne bez przewijania. Przycisk pokazuje liczbę włączonych filtrów.
- Tytuły bez gatunku trafiają do kategorii Pozostałe. Bez włączonych filtrów są widoczne zawsze; w oknie Filtruj Pozostałe jest ostatnim przełącznikiem.
- Sortowanie: Alfabetycznie albo Kategorie.
- **Postęp oglądania i wznawianie**: odcinek przerwany po co najmniej 30 s startuje od miejsca zatrzymania (o ile do końca zostaje ponad minuta). Kafle odcinków mają pasek postępu, widoczny od razu po wyjściu z odtwarzacza. Każdy profil ma własną pamięć.
- Nazwy odcinków bez powtórzonego tytułu serialu także przy oznaczeniu sezonu, np. „Policjanci S2 - Odcinek 5” → „Odcinek 5”.
- Pole wyszukiwania ma ikonę i miejsce na cały tekst.

### Autoodtwarzanie

- Wybór, kiedy pokazać następny odcinek: 10, 30, 45 lub 75 s przed końcem. Odliczanie do startu trwa zawsze 5 s.
- Ustawienie w Opcjach i w ustawieniach odtwarzacza wygląda tak samo jak OLED Saver.

### Opcje

- Nagłówek „Opcje”; „Ukryj” i „Pokaż” podają nazwę zaznaczonego kanału. Usunięta pozycja „Dodaj do ulubionych” (żółty przycisk działa nadal).
- Pełna obsługa pilotem: d-pad nie przeskakuje OLED Saver, a w prawo przechodzi na wybór czasu OLED Saver i autoodtwarzania (z własną ramką); OK otwiera listę.
- Własne rozwijane listy: wspólny zaokrąglony obrys z polem, wartości w linii z tekstem pola, sterowanie strzałkami i OK. Działa też na webOS 4.

### Odtwarzacz i Program TV

- Ścieżka dźwiękowa bez języka („und”) nazywa się „Oryginalna”.
- Pasek postępu audycji w Programie TV mieści się w ramce; zaokrąglony znacznik „na żywo”.
- Kulka osi czasu jest zawsze na wierzchu: pasek i znaczniki audycji nie przechodzą przez nią.
- W ustawieniach odtwarzacza OLED Saver i autoodtwarzanie mają wszystkie opcje w jednej linii.
- webOS 4: okno ustawień odtwarzacza ma pełną szerokość i układ jak na webOS 5 (bez uciętych kolumn, OLED Saver w jednej linii).

### Przewijanie

- Suwak listy nie zmienia długości przy dojściu do końca listy.
- Kółko Magic Remote nie odbija i nie zacina się: krótkie drgnięcie w przeciwną stronę (do 150 ms) jest pomijane, a każdy ruch przesuwa zaznaczenie o jeden rząd.

### Logowanie

- Formularz Netii jest większy i wyśrodkowany. „Przerwij” w formularzu nie psuje logowania: aplikacja wraca do formularza.
- Odrzucone hasło: komunikat i ponowne wpisanie hasła (login zostaje). Aplikacja nie próbuje logować się w tle starym hasłem.
- Sesja jest zapamiętywana w zaszyfrowanym magazynie konta (AES-256-GCM), więc telewizor nie musi logować się od nowa przy każdym uruchomieniu. Sesja przeniesiona z komputera (webOS 4) trafia do tego samego magazynu, a jawny plik jest usuwany.
- Ekran profili „Kto ogląda?”. Przy polu widać „Domyślny profil: [nazwa]”, a profil domyślny ma ikonę autorenew na awatarze.
- Profil domyślny ustawia się w dwóch krokach. Po zaznaczeniu pola ikona podąża za fokusem, a naciśnięcie profilu go zatwierdza. Dopiero następne naciśnięcie wybiera profil do oglądania. Wstecz anuluje ustawianie, a odznaczenie pola usuwa profil domyślny. Podpis pod polem podpowiada, co dalej („Wybierz swój profil.”).
- Pola wyboru w całej aplikacji mają styl interfejsu: zaokrąglony kwadrat w linii z tekstem i odstęp od liter. OK na pilocie zaznacza i odznacza pole.
- Pilot i wskaźnik: w dół z każdego profilu prowadzi do pola, w górę wraca do tego profilu. Wskaźnik Magic Remote przenosi fokus i podświetlony jest zawsze jeden profil.
- Po wybraniu profilu ekran jest zablokowany do wczytania kanałów.
- Wskaźnik ładowania w całej aplikacji pokazuje postęp: pierścień zapełnia się etapami ładowania, a w środku jest procent.
- Przycisk „Wyloguj się z netiOS”. Teksty pomocnicze mają jedną wielkość. Pod przyciskiem są kolejno: opis, adres i kod QR z odstępem.
- Domyślny profil jest pamiętany także na webOS 4, a pole „Domyślny profil” w Opcjach nie odznacza się samo.
- Adres Netii do zmiany ustawień profilu jest tylko wyświetlany (podświetla się, nie otwiera pustej strony).
- Na webOS 4 bez przeniesionej sesji aplikacja od razu wskazuje Import-Session zamiast formularza, którego ta przeglądarka nie uruchamia.

### Instalator i bezpieczeństwo

- Instalator sprawdza sumę SHA-256 paczki po przesłaniu na telewizor i przerywa przy niezgodności.
- `tv-setup.sh` nie używa `eval`: manifest wydania sprawdza Node.js, a skrypt czyta tylko gotowe wartości.
- Paczki nie zawierają lokalnych adresów IP ani danych konta.

## 0.6.4

### Pilot i lista kanałów

- CH+ i CH- znów przełączają kanały: pilot LG wysyła je jako PageUp/PageDown. Działają tylko w odtwarzaczu; na liście kanałów nie uruchamiają odtwarzania.
- CH+/CH- w trakcie łączenia przerywa bieżący start zamiast czekać, a dostęp do DRM ma limit 10 s.
- Długie przytrzymanie OK otwiera Opcje kanału także przy wskaźniku Magic Remote. Przytrzymanie działa jak hamulec: ruch wskaźnika nie przesuwa zaznaczenia.
- Lista mieści dokładnie trzy pełne rzędy kafli, bez ucinania od góry i od dołu.
- Opis audycji w górnym panelu ma trzy wyjustowane linie i kończy się pełnym słowem z wielokropkiem (także na webOS 4).
- Panel wydajności przeniesiony z Opcji do Diagnostyki.

### Logowanie

- Przy zapamiętanym koncie oficjalny formularz Netii loguje w tle, za ekranem startowym. Formularz pojawia się tylko, gdy potrzebny jest użytkownik: przy weryfikacji (captcha), po odrzuconej próbie albo gdy sesja nie przyszła w ciągu 20 s od wysłania.
- Po restarcie usługi przy otwartej aplikacji (zdarza się na webOS 4) aplikacja sama loguje się ponownie i wybiera profil.

### Program TV i logotypy (wszystkie wersje webOS)

- Kanały i bieżący program TV pobierają się już przy wyborze profilu, zanim pojawi się lista kanałów; pierwsze zapytanie aplikacji czeka na to pobieranie zamiast dostać pusty wynik.
- Logotypy kanałów są przycinane i zapamiętywane we wspólnej pamięci dla wszystkich profili, także na webOS 4 (Chromium 53 nie ma `AbortController`, przez co logo były tam mniejsze i pobierane za każdym razem). W pamięci operacyjnej mieści się 256 obrazów.

### Ukryte kanały

- Folder Ukryte można zabezpieczyć 4-cyfrowym PIN-em (Opcje). PIN obowiązuje dla profilu i jest wymagany także przy „Pokaż wszystkie ukryte kanały”; folder zamyka się po wyjściu z niego, zmianie profilu i zejściu aplikacji w tło.
- Ukrytych kanałów nie da się włączyć klawiszami numerycznymi, CH± ani z Programu TV.

## 0.6.0

### webOS 4

- netiOS działa na webOS 4 (sprawdzone na OLED55C9, webOS 4.10). Usługa jest zgodna z Node.js 0.12: bez nowszej składni i API, z polskim sortowaniem bez `Intl` i z certyfikatami z systemu telewizora (wbudowana lista Node.js 0.12 nie zna certyfikatu API Netii).
- Logowanie przez komputer: `Import-Session.cmd` otwiera oficjalny formularz Netia GO w przeglądarce, a po zalogowaniu przenosi sesję na telewizor przez telnet lub SSH. Przeglądarka webOS 4 nie uruchamia formularza Netii. Sesja działa przy każdym uruchomieniu, aż wygaśnie, Netia ją odrzuci albo nastąpi wylogowanie.
- Układ dla starszej przeglądarki (Chromium 53, bez CSS Grid): kafle kanałów i VOD, okna Opcji, Diagnostyki i ustawień odtwarzacza.
- Dziennik logowania na telewizorze (`login.log`): nazwy wywołań, wyniki i kody błędów, bez danych poufnych.

### Instalator

- Pakiet `netiOS-0.6.0-installer.zip` z dołączoną paczką: instalator używa lokalnego IPK (obok, z `dist/` lub z podanej ścieżki), a dopiero bez niego pobiera wydanie z GitHuba.
- SSH albo telnet Homebrew Channel; instalator czeka na faktyczny wynik instalacji zgłoszony przez system.
- Repozytorium Homebrew Channel także jako `homebrew/repo.json`.
- [Poradnik instalacji](docs/INSTALL.md) ze zrzutami ekranu.
- Eksperymentalnie: przeniesienie sesji z macOS (`Import-Session.command`), bez instalowania dodatkowych programów.

### Interfejs

- Duże kółko ładowania na środku ekranu przy starcie odtwarzania i wczytywaniu listy; animowane kropki przy etapach logowania.
- Seriale i programy wczytują kolejno opis, kafle odcinków, tło i miniatury.
- Postęp pierwszego pobierania programu TV („X z Y kanałów”).
- Ustawienia odtwarzacza mniejsze o 15%, z OLED Saver w jednym rzędzie; gradient w oknach.
- Płynne przewijanie domyślnie włączone.

## 0.5.5

### Odtwarzacz

- Przyciski **|◂** i **▸|**: w serialach i programach przełączają poprzedni i następny odcinek, w telewizji przeskakują między audycjami w buforze. Audycja zaczęta przed buforem startuje od najwcześniejszego dostępnego momentu, a następna audycja, której jeszcze nie ma w buforze, przełącza na żywo.
- **Autoodtwarzanie odcinków** (Opcje oraz zębatka w odtwarzaczu przy serialach i programach): 10 sekund przed końcem karta w prawym dolnym rogu pokazuje odliczanie, miniaturę i tytuł następnego odcinka. „Anuluj” lub Wstecz wraca do listy odcinków.
- Przycisk „na żywo” ma własną ikonę.

## 0.5.0

### Przewijanie i nawigacja

- Opcja **Płynne przewijanie** dla kanałów, Programu TV, Seriali, Programów, sezonów i odcinków. Listy przesuwa kompozytor z ograniczoną prędkością; bez opcji lista przeskakuje o rząd.
- Wspólna obsługa kółka Magic Remote: jeden rząd na ząbek, poprawne liczenie szybkich obrotów, zaznaczenie przesuwa się o rząd i nie przeskakuje na końcach listy. Drgający kursor nie przejmuje zaznaczenia po przewinięciu.
- Scrollbar w każdym panelu.
- Odświeżanie list w tle i przebudowa siatki nie przesuwają już widoku.

### Program TV

- Granice dni z datą i dniem tygodnia, np. „27 października, wtorek”.
- Licznik audycji obok wyszukiwarki, nagłówek i przycisk zamknięcia spójne z resztą interfejsu.
- Wybranie trwającej audycji, której początek jest już poza buforem, cofa odtwarzanie do najwcześniejszego dostępnego momentu.
- Brak zacięć przy doczytywaniu kolejnego dnia.

### Seriale i Programy

- Zapamiętane listy seriali i programów (24 h) oraz miniatury pojawiają się od razu.
- Naprawiono otwieranie części tytułów po uruchomieniu z zapamiętanej listy oraz zastępcze miniatury z najnowszego odcinka.
- Miniatury mają dokładne proporcje 16:9.

### Interfejs

- Logotypy kanałów przycinane z marginesów i wyświetlane w podobnej wielkości.
- Opcje: przycisk zamknięcia, jedno podświetlenie, Płynne przewijanie, Panel wydajności (FPS, CPU, RAM).
- Diagnostyka mieści się bez przewijania i pokazuje pamięć RAM oraz zajęte miejsce.
- Interfejs odtwarzacza pojawia się i znika płynnie.
- Usunięto sortowanie „Domyślnie”; dawne ustawienie działa jak „Alfabetycznie”.

### Działanie

- Aplikacja pamięta kanały i logotypy; zapamiętana lista pojawia się od razu, a aktualna dochodzi w tle. Wylogowanie usuwa zapamiętane listy.
- Logowanie: automatyczne wysłanie formularza czeka na gotowość zabezpieczeń strony i nie jest powtarzane; po odrzuceniu użytkownik zatwierdza formularz sam. Ramka logowania nie przewija się.
- Wyszukiwarka nie zamyka klawiatury LG podczas pisania.
- Konfiguracja wczytywana przy starcie i po Odśwież; sesja podtrzymywana co kilka–kilkanaście minut.
- Program TV i odtwarzanie działają także tuż po starcie aplikacji.

## 0.4.0–0.4.19

- Seriale i Programy: osobne katalogi z pełną paginacją, gatunkami, sezonami, opisami, tłami i wyszukiwaniem; odtwarzanie VOD (DASH/Widevine i autoryzowane MP4).
- Pilot: krótki OK ogląda, przytrzymanie otwiera Opcje; CH+/CH−, numery kanałów i kolorowe skróty.
- Sortowanie kanałów alfabetyczne, tematyczne i z ulubionymi na początku; osobne ustawienia dla list.
- Opcje i Diagnostyka, OLED Saver z wyborem czasu, wspólne ikony i słownik tekstów.
- Zapamiętywanie danych logowania (szyfrowane), profil domyślny, edytowalna konfiguracja użytkownika.
- Powtarzalne wydanie z audytem źródeł i pakietu.

## 0.3.x

- Logowanie oficjalnym formularzem Netii bezpośrednio na TV, przywracanie sesji i profili.
- Odtwarzacz z wyborem jakości, audio i napisów, cofaniem w buforze i ramówką kanału.

## 0.1.0–0.2.x

- Podstawy: sesja i profile, kanały w pakiecie, odtwarzanie DASH/Widevine, ulubione, ukryte kanały i Program TV.

## Znane ograniczenia

- Niektóre kanały mogą odmówić licencji lub odtwarzania mimo widoczności w pakiecie.
- Wymagane PIN-y rodzicielskie i polityki CAC nie są obsługiwane.
- Interaktywna weryfikacja CAPTCHA, inne generacje webOS oraz długie odświeżanie sesji wymagają dalszych testów.
