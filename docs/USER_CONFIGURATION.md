# Konfiguracja użytkownika i edycja zdalna

Edytowalna kopia lokalna: user-config.json w katalogu projektu. Powstaje z bieżącej listy TV, jest ignorowana przez Git i nie wchodzi do IPK. Neutralny wzór: config/user-config.example.json.

Na telewizorze plik znajduje się pod adresem:

```text
/media/internal/com.netiago.webos/user-config.json
```

Aplikacja tworzy go po pierwszym poprawnym pobraniu kanałów. Zawiera ID/nazwy kanałów, ulubione/ukryte, osobne sortowanie Wszystkich/Ulubionych/Ukrytych i Seriali/Programów, rozmiar napisów oraz czas wygaszacza. Nie zawiera loginu, hasła, PIN-u, cookies, tokenów, nazw profili ani ID kont. Nieznane pola są odrzucane także wewnątrz rekordów kanałów.

channelSort: alphabetical, thematic, favorites-first (dawna wartość default jest odczytywana jako alphabetical). librarySort: alphabetical, genres. oledMinutes: 30/60/90/120. subtitleSize: 50/75/100/150/200. Nazwy kanałów są aliasami wyświetlania; zmiana JSON nie przyznaje dostępu. Przełącznik OLED ON/OFF jest lokalną preferencją UI, oddzielną od czasu w konfiguracji.

## Synchronizacja SSH

```powershell
node tools/config.cjs pull TV_IP
# Edytuj user-config.json
node tools/config.cjs push TV_IP
```

Opcjonalny ostatni argument wskazuje inny plik JSON. SSH korzysta ze zwykłego uwierzytelnienia i weryfikacji hosta; hasła nie są zapisywane w konfiguracji ani przekazywane argumentem.

Glassdoor/LG InputHook mogą używać tej samej ścieżki poprzez uwierzytelnione operacje plikowe/SSH; nie zakładamy ich konkretnego API. Podmiana musi być atomowa i zachowywać właściciela oraz prawa. Usługa ma własny UID, więc nowy plik root z prawami 600 byłby nieczytelny. Narzędzie zachowuje prawa przez cp -p przed podmianą.

Aplikacja wczytuje plik po załadowaniu profilu oraz po Opcje > Odśwież kanały i program; nie odpytuje go cyklicznie. Zmiana znaczenia konfiguracji aktualizuje aktywny profil bez wylogowania; błędny/nieczytelny plik pozostawia ostatnie działające ustawienia i wyświetla krótki błąd. Późniejsze wybory UI pozostają niezależne do kolejnej faktycznej edycji pliku; sam odczyt nie resetuje ustawień.

Wszystkie współdzielone style: app/style.css. Wszystkie własne teksty: app/strings.json. Zachowuj placeholdery takie jak {minutes}.
