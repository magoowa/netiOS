# Publikacja na GitHub i przez Homebrew

Publikuj czysty eksport `dist/github/netiOS`, a nie nadrzędny katalog roboczy. Eksport zawiera własny Git, jedno zatwierdzenie z neutralnym autorem, gałąź `main` i tag `vWERSJA`. Jego historia nie obejmuje prywatnych badań ani wcześniejszych commitów. Repozytorium nie ma ustawionego remote.

## Źródła

Po utworzeniu pustego repozytorium GitHub zastąp OWNER właściwą nazwą:

```sh
cd dist/github/netiOS
git status --short
git log -1 --format=fuller
git remote add origin https://github.com/OWNER/netiOS.git
git push -u origin HEAD
git push origin vWERSJA
```

Sprawdź adres i widoczność repozytorium przed wysłaniem. Nie przenoś do niego nadrzędnej historii `.git`, `.local`, własnego `user-config.json`, danych konta ani materiałów referencyjnych. README, polska dokumentacja, zachowane angielskie oryginały, screenshoty demonstracyjne i wymagane licencje są już częścią eksportu.

## Wydanie

Do GitHub Release dla tagu wersji dołącz wyłącznie zawartość `dist/release`: IPK, manifest, ikonę, SHA256SUMS i archiwum źródeł. Sprawdź sumy SHA-256. Nie publikuj staging ani całego katalogu roboczego.

Manifest używa względnych adresów IPK i ikony; trzy pliki muszą być dostępne razem. Publiczne wykrywanie w Homebrew wymaga osobnego wpisu w katalogu i dostępnego adresu manifestu. Przygotowanie lokalnego wydania nie publikuje go automatycznie.

## Kolejna wersja

Zaktualizuj zgodnie wersje `package.json`, `package-lock.json`, `service/package.json`, `app/appinfo.json`, testy wersji i dokumentację. Wykonaj testy oraz build, a następnie `npm run release`. Polecenie sprawdza źródła, prywatne wartości i każdy element IPK oraz tworzy nowy eksport. Poprzedni eksport przenosi do ignorowanego `.local/archive`; aktywne wydanie zawiera wyłącznie bieżącą wersję.

Prywatny plik `.local/release-private.json` może zawierać dodatkową tablicę ciągów, których audyt ma szukać, np. rzeczywisty adres własnego TV. Audyt sprawdza też bieżącą ścieżkę, nazwę użytkownika systemu i obecny prywatny plik testowego loginu. Brak wykrycia tych ciągów nie zastępuje ręcznego przeglądu nowych treści i obrazów.
