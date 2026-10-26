# Współpraca przy projekcie

Zgłoszenia dotyczą logowania, kanałów, odtwarzacza, opcji lub instalacji. Szablony zgłoszeń działają po opublikowaniu repozytorium.

Propozycja funkcji powinna opisywać potrzebę, oczekiwane zachowanie i konkretny test odbiorczy. Błąd opisz wersją aplikacji i webOS, krokami odtworzenia, wynikiem oczekiwanym/rzeczywistym oraz zanonimizowanym kodem błędu. Nie dołączaj danych konta, nazw profili, prywatnych adresów, przechwyceń ani pełnych URL-i mediów.

Poprawki utrzymuj małe. Przeczytaj zmieniany kod i wywołania; wykorzystuj istniejące mechanizmy. Nietrywialna logika wymaga regresji. Logowanie, zapis, multimedia i pilot wymagają odpowiedniego testu TV przed oznaczeniem jako zweryfikowane. Niewykonane testy zaznacz jawnie.

Przed commitem/eksportem stosuj [zasady bezpieczeństwa](SECURITY.md). Zachowaj wymagane licencje. Nie kopiuj implementacji Androida, serwisu Netii ani jego kluczy. Źródła i usługa muszą pozostać zgodne z Chromium 68 i Node.js 8.12.0; narzędzia lokalne używają Node.js 22+.

