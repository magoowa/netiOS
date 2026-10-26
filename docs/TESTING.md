# Testy

## Automatyczne

```sh
npm test         # testy jednostkowe i regresyjne (Node.js)
npm run build    # pakiet IPK; test UI używa wyniku z dist/staging
npm run test:ui  # interfejs w przeglądarce (Brave/Chromium)
npm run release  # audyt źródeł i pakietu oraz eksport wydania
```

Testy jednostkowe obejmują m.in. podpisy RPC, walidację i szyfrowany zapis konta, paginację kanałów i katalogów, uprawnienia, konfigurację, sortowanie, model przewijania (kółko Magic Remote, animacja, scrollbar), pamięć list i grafik oraz pomiary panelu wydajności.

Test interfejsu działa wyłącznie na syntetycznym koncie i atrapie odtwarzacza. Sprawdza logowanie, profile, kanały, katalogi, Program TV, pilota i kółko, Opcje, Diagnostykę, płynne przewijanie, układ elementów i konfigurację. Nie dowodzi działania DRM ani fizycznego pilota.

## Na telewizorze

Do testu odtwarzania na TV służy `tools/tv-smoke.cjs`. W ignorowanym pliku `.local/tv-inspector.json` wpisz adres inspektora przekierowanego na loopback, np. `{"endpoint":"ws://127.0.0.1:PORT/devtools/page/TARGET"}`, włącz uprawniony kanał i uruchom skrypt. Sprawdza on aplikację, postęp czasu, obraz i brak błędu, bez wypisywania danych konta, sesji ani adresów mediów.

Wymagają osobnych testów: interaktywna CAPTCHA, inne generacje webOS, pełna obsługa fizycznego pilota, uśpienie i cykl zasilania, długie odświeżanie sesji oraz słaba sieć.

Nie publikuj przechwyceń ruchu, odpowiedzi API, haseł, podpisanych adresów ani zrzutów ekranu z danymi konta.
