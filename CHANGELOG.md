# Historia zmian netiOS

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
