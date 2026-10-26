# Bezpieczeństwo i publikacja

Nie umieszczaj prawdziwych loginów, haseł, tokenów, cookies, identyfikatorów kont/profili, podpisanych URL-i mediów, kluczy SSH, prywatnych adresów TV ani ścieżek komputera w źródłach, testach, zgłoszeniach, metadanych czy commitach. Testy używają danych syntetycznych.

Prywatny plik logowania jest wyłącznie autoryzowanym wejściem do testu lokalnego. Nie wypisuj go i nie przekazuj haseł argumentami procesu. Surowe przechwycenia i oryginalne archiwa należą do ignorowanego katalogu .local. Sam .gitignore nie wystarcza do oceny publikacji.

## Zapamiętywanie konta

Checkbox pod iframe kontroluje zapis hasła. Dane konta są szyfrowane AES-256-GCM ze świeżą losową solą i nonce oraz uwierzytelnionym formatem. Losowy klucz instalacji i zaszyfrowany rekord znajdują się w prywatnym katalogu usługi, z dostępem tylko właściciela. Root lub przejęta usługa mogą odczytać oba pliki i odszyfrować rekord. To szyfrowanie lokalne umożliwiające automatyczny login, nie sprzętowy keystore.

Hasło i klucz nie trafiają do kodu, paczki, diagnostyki ani jawnego localStorage. Metody konta sprawdzają dokładny identyfikator wywołującej aplikacji. Dane z iframe są ograniczane i weryfikowane przez serwerowe getSession. Używaj prawidłowej weryfikacji certyfikatów HTTPS oraz sprawdzonych hostów Netii/CDN. Nie loguj treści żądań ani odpowiedzi, nagłówków autoryzacji czy pełnych URL-i mediów.

Cookies oficjalnego serwisu pozostają w normalnym magazynie przeglądarki TV. Mogą wygasać lub zostać odwołane. Wylogowanie usuwa zapisane hasło oraz sesję/cookies uwierzytelniające; zachowuje tylko zaszyfrowany login i opcjonalną podpowiedź profilu. Wyłączenie zapamiętywania usuwa hasło także ze starego schowka. Nie zgłaszaj poprawnego wylogowania, gdy usunięcie cookies się nie powiodło. Ponowienia są ograniczone.

## Kontrola publikacji

1. Przejrzyj listę plików i diff. Sprawdź też wymuszone dodania plików ignorowanych.
2. Sprawdź treści, historię i autora/commitera pod kątem prywatności. Eksport release tworzy nową, neutralną historię, zachowując lokalną historię roboczą.
3. Eksportuj wyłącznie jawnie dopuszczone źródła. Nie pakuj całego katalogu roboczego, node_modules, Androida ani przechwyceń.
4. Buduj przez staging app/service. Kontroluj każdy element archiwum IPK, manifesty, licencje i metadane.
5. Usuń EXIF/XMP/IPTC, dane redaktorów i osobiste piksele obrazów. Zachowaj wymaganą informację o wersji i licencjach stron trzecich.

Logo SVG zawiera geometrię i kolory, bez danych edytora. Generowane PNG mają wyłącznie IHDR/IDAT/IEND. Oryginalne pliki referencyjne są zachowane prywatnie i nie są przeznaczone do redystrybucji. Konfiguracja użytkownika ma ścisły schemat bez loginów, haseł, PIN-ów, tokenów i identyfikatorów konta.

Podejrzenie wycieku zgłoś prywatnie opiekunowi repozytorium. Nie publikuj sekretu w issue. Zmień ujawnione dane i usuń ich ekspozycję w historii/artefaktach przed publikacją. Zamknięcie i ponowne otwarcie TV było testowane; pełny cykl zasilania i awarie usuwania offline wymagają osobnego odbioru.

