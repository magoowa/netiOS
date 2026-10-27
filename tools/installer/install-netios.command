#!/bin/zsh
# netiOS installer for macOS (double-click in Finder): finds LG webOS TVs on the local network, installs the latest
# netiOS over SSH (telnet fallback) and shows the Homebrew Channel repository address. Requires Homebrew Channel (root) and SSH or telnet on the TV.
# With --import-session (Import-Session.command) it hands a Netia GO session from a browser on this Mac to the TV
# instead (webOS 4, whose browser cannot run the official login form). Experimental.
REPO="${NETIOS_REPO:-magoowa/netiOS}"
mode=install; [[ "$1" == "--import-session" ]] && { mode=import; shift; }
echo "netiOS - instalator"
own=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
tvs=()
if [[ -n "$own" ]]; then
  echo "Szukam telewizorów LG w sieci ${own%.*}.0/24..."
  # LG webOS answers on its control port 3000; probe the local /24 in parallel.
  tmp=$(mktemp)
  for i in {1..254}; do ( nc -z -G 1 "${own%.*}.$i" 3000 >/dev/null 2>&1 && echo "${own%.*}.$i" >> "$tmp" ) & done
  wait
  tvs=(${(f)"$(sort -t. -k4 -n "$tmp")"}); rm -f "$tmp"
fi
i=1; for ip in $tvs; do echo "  $i. LG webOS TV ($ip)"; ((i++)); done
if (( ${#tvs} )); then read "answer?Numer TV lub adres IP: "; else read "answer?Nie znaleziono TV. Podaj adres IP: "; fi
if [[ "$answer" =~ '^[0-9]+$' ]] && (( answer >= 1 && answer <= ${#tvs} )); then tv=${tvs[$answer]}; else tv=$answer; fi
[[ "$tv" =~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' ]] || { echo "Nieprawidłowy adres IP."; exit 1; }

if [[ $mode == import ]]; then
  # The user logs in at go.netia.pl in a browser window with a dedicated netiOS profile; the script reads only that
  # window's go.netia.pl session cookies through the browser's own DevTools pipe (no extra software: Chromium speaks the
  # protocol over file descriptors 3/4, macOS's JavaScript parses the JSON) and sends the session to the TV.
  js() { osascript -l JavaScript - "$@"; }
  app=$(js <<'JS'
ObjC.import('AppKit');
function run() { var a = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('https://go.netia.pl')); return a.isNil() ? '' : ObjC.unwrap(a.path); }
JS
)
  if [[ "${app:t}" != (Google\ Chrome|Brave\ Browser|Microsoft\ Edge|Vivaldi|Opera|Chromium).app ]]; then
    [[ -n "$app" ]] && echo "Domyślna przeglądarka (${app:t:r}) nie obsługuje tego trybu; używam innej zainstalowanej."
    app=
    for name in 'Google Chrome' 'Brave Browser' 'Microsoft Edge' 'Vivaldi' 'Opera' 'Chromium'; do
      for base in /Applications ~/Applications; do [[ -d "$base/$name.app" ]] && { app="$base/$name.app"; break 2; }; done
    done
  fi
  [[ -n "$app" ]] || { echo "Nie znaleziono przeglądarki Chrome, Brave, Edge, Vivaldi ani Opera."; exit 1; }
  exe="$app/Contents/MacOS/$(defaults read "$app/Contents/Info" CFBundleExecutable 2>/dev/null)"
  [[ -x "$exe" ]] || { echo "Nie mogę uruchomić ${app:t:r}."; exit 1; }
  echo "Przeglądarka: ${app:t:r}"
  profile="$HOME/Library/Application Support/netiOS/login-${${app:t:r}// /-}"
  if [[ ! -d "$profile" ]]; then
    # New profile: restore the previous session on start so go.netia.pl's session cookies survive between imports.
    mkdir -p "$profile/Default"
    print -r -- '{"session":{"restore_on_startup":1},"browser":{"has_seen_welcome_page":true}}' > "$profile/Default/Preferences"
    echo "Pierwsze logowanie w profilu netiOS: zaloguj się i pozwól przeglądarce zapamiętać hasło - kolejne razy pójdą same."
  fi
  echo "Otwieram Netia GO w profilu netiOS. Jeśli zobaczysz formularz, zaloguj się; okno zamknie się samo."
  pipes=$(mktemp -d); mkfifo "$pipes/in" "$pipes/out"
  "$exe" --remote-debugging-pipe --user-data-dir="$profile" --no-first-run --no-default-browser-check --new-window https://go.netia.pl/login 3<"$pipes/in" 4>"$pipes/out" >/dev/null 2>&1 &
  browser=$!
  exec 5>"$pipes/in" 6<"$pipes/out"
  session= id=0
  for (( tick = 0; tick < 900; tick++ )); do
    sleep 1
    kill -0 $browser 2>/dev/null || break
    (( id++ )); printf '{"id":%d,"method":"Storage.getCookies"}\0' $id >&5 2>/dev/null || break
    reply=
    while read -r -d '' -u 6 message; do [[ "$message" == *"\"id\":$id,"* || "$message" == *"\"id\":$id}"* ]] && { reply=$message; break; }; done
    [[ -n "$reply" ]] || break
    session=$(js "$reply" <<'JS'
function run(argv) {
  var reply; try { reply = JSON.parse(argv[0]); } catch (error) { return ''; }
  var found = {};
  ((reply.result && reply.result.cookies) || []).forEach(function (c) {
    if (/(^|\.)netia\.pl$/.test(c.domain) && (c.name === 'user-session' || c.name === 'user-recognition')) { try { found[c.name] = JSON.parse(decodeURIComponent(c.value)); } catch (error) {} }
  });
  var s = found['user-session'], r = found['user-recognition'];
  // Only a session with time left counts; an expired one stays until the page refreshes it or the user logs in.
  if (!s || !r || !s.id || !s.key || !(s.keyExpirationTime > Date.now() / 1000 + 300) || !r.clientId || !r.deviceId) return '';
  return JSON.stringify({session: {id: s.id, key: s.key, keyExpirationTime: s.keyExpirationTime}, clientId: r.clientId, deviceId: r.deviceId});
}
JS
)
    [[ -n "$session" ]] && break
  done
  # Browser.close lets the profile save (cookies, a remembered password) before the window goes.
  printf '{"id":999999,"method":"Browser.close"}\0' >&5 2>/dev/null
  exec 5>&- 6<&-
  for (( w = 0; w < 10; w++ )); do kill -0 $browser 2>/dev/null || break; sleep 0.5; done
  kill $browser 2>/dev/null; rm -rf "$pipes"
  [[ -n "$session" ]] || { echo "Nie odczytano sesji Netia GO (okno zamknięte lub brak logowania)."; exit 1; }
  # Short echo chunks: the telnet shell's line editor copes badly with very long lines. The service runs as its own
  # unprivileged user on webOS 4: start it, then hand it the folder and file.
  dir=/media/internal/com.netiago.webos
  b64=$(print -rn -- "$session" | base64 | tr -d '\n')
  cmd="umask 077; mkdir -p $dir; : > /tmp/netios-session.b64"
  for (( i = 1; i <= ${#b64}; i += 400 )); do cmd+="; echo ${b64[i,i+399]} >> /tmp/netios-session.b64"; done
  cmd+="; base64 -d /tmp/netios-session.b64 > $dir/import-session.json && rm /tmp/netios-session.b64"
  cmd+="; luna-send -n 1 luna://com.netiago.webos.service/status '{}' </dev/null >/dev/null 2>&1"
  cmd+='; P=$(ps -ef | grep "[c]om.netiago.webos.service" | awk "{print \$2}" | head -1); [ -n "$P" ] && chown -R $(awk "/^Uid:/{print \$2}" /proc/$P/status):$(awk "/^Gid:/{print \$2}" /proc/$P/status) '"$dir"
  cmd+="; test -s $dir/import-session.json && echo NETIOS_SESSION_\"\"READY"
  log=$(mktemp)
  if nc -z -G 2 "$tv" 22 >/dev/null 2>&1; then
    echo "Łączę z $tv przez SSH jako root (domyślne hasło: alpine)."
    ssh -tt -o StrictHostKeyChecking=accept-new "root@$tv" "$cmd" > "$log" 2>&1
  elif nc -z -G 2 "$tv" 23 >/dev/null 2>&1; then
    echo "Przekazuję sesję na $tv przez telnet..."
    { sleep 1; printf '%s; exit\r\n' "$cmd"; sleep 15; } | nc "$tv" 23 > "$log" 2>&1
  else
    rm -f "$log"; echo "TV nie odpowiada na SSH (22) ani telnet (23). Włącz jedno z nich w Homebrew Channel."; exit 1
  fi
  # The log holds the echoed command (the session), so it is removed right after the check.
  if grep -q 'NETIOS_SESSION_READY' "$log"; then rm -f "$log"; else rm -f "$log"; echo "Nie udało się przekazać sesji."; exit 1; fi
  echo "Gotowe. Uruchom netiOS na telewizorze (lub uruchom go ponownie) - zaloguje się tą sesją."
  exit 0
fi
remote="curl -fsSL https://raw.githubusercontent.com/$REPO/main/tools/installer/tv-setup.sh | sh -s -- $REPO"
# A local IPK wins over the GitHub release: $1, then one next to the installer, then the newest in the repository's
# dist/; otherwise the user may type a path, and Enter downloads the latest release.
here=${0:A:h}
ipk=$1
if [[ -z "$ipk" ]]; then
  found=(${here}/*.ipk(N.om[1]))
  (( ${#found} )) || found=(${here}/../../dist/com.netiago.webos_*_all.ipk(N.On))
  found=(${(f)"$(printf '%s\n' $found | sort -t_ -k2 -V | tail -1)"})
  if [[ -n "${found[1]}" ]]; then
    read "answer?Lokalna paczka: ${found[1]:t}. Enter = użyj jej, albo podaj inną ścieżkę: "; ipk=${answer:-${found[1]}}
  else
    read "ipk?Ścieżka do pliku IPK (Enter = pobierz najnowszą wersję z GitHuba): "
  fi
fi
pusher=
if [[ -n "$ipk" ]]; then
  ipk=${~ipk}; [[ -f "$ipk" ]] || { echo "Nie ma pliku $ipk."; exit 1; }
  setup=$(mktemp); payload=$(mktemp)
  if [[ -f "$here/tv-setup.sh" ]]; then cp "$here/tv-setup.sh" "$setup"; else curl -fsSL "https://raw.githubusercontent.com/$REPO/main/tools/installer/tv-setup.sh" -o "$setup" || exit 1; fi
  cat "$setup" "$ipk" > "$payload"
  n1=$(wc -c < "$setup" | tr -d ' '); n=$(wc -c < "$payload" | tr -d ' ')
  # The TV has no listening netcat, so Node receives tv-setup.sh + the IPK on port 5599 while this Mac pushes them;
  # the bootstrap travels base64-encoded so no quoting survives the SSH/telnet command line.
  boot="W=/tmp/netios-install; mkdir -p \$W; node -e 'var n=+process.argv[2],f=require(\"fs\").createWriteStream(process.argv[1]),g=0;require(\"net\").createServer(function(c){c.on(\"data\",function(d){f.write(d);g+=d.length;if(g>=n)f.end(function(){process.exit(0)})})}).listen(5599);setTimeout(function(){process.exit(1)},300000)' \$W/p $n || exit 1; dd if=\$W/p of=\$W/s.sh bs=1 count=$n1 2>/dev/null; tail -c +$((n1 + 1)) \$W/p > \$W/n.ipk; rm \$W/p; sh \$W/s.sh --local \$W/n.ipk"
  remote="echo $(printf '%s' "$boot" | base64 | tr -d '\n') | base64 -d | sh"
  echo "Instaluję lokalną paczkę ${ipk:t}."
  ( for i in {1..300}; do nc -w 3 "$tv" 5599 < "$payload" 2>/dev/null && break; sleep 1; done ) &
  pusher=$!
fi
if nc -z -G 2 "$tv" 22 >/dev/null 2>&1; then
  echo "Łączę z $tv przez SSH jako root. Podaj hasło SSH telewizora, gdy zostaniesz poproszony (domyślnie alpine)."
  ssh -tt -o StrictHostKeyChecking=accept-new "root@$tv" "$remote" || { echo "Instalacja nie powiodła się."; exit 1; }
elif nc -z -G 2 "$tv" 23 >/dev/null 2>&1; then
  # Fallback for TVs with SSH off: Homebrew Channel's root telnet (port 23, no password); macOS has no telnet client.
  echo "SSH jest niedostępne, łączę z $tv przez telnet (Homebrew Channel)."
  log=$(mktemp)
  { sleep 1; printf '%s; exit\r\n' "$remote"; sleep 300; } | nc "$tv" 23 | LC_ALL=C tr -d '\r\373\374\375\376\377' | tee "$log" | grep -E '^(netiOS:|NETIOS_INSTALLED)'
  grep -q NETIOS_INSTALLED "$log" || { rm -f "$log"; echo "Instalacja nie powiodła się."; exit 1; }
  rm -f "$log"
else
  echo "TV nie odpowiada na SSH (22) ani telnet (23). Włącz jedno z nich w Homebrew Channel."; exit 1
fi
[[ -n "$pusher" ]] && { kill $pusher 2>/dev/null; rm -f "$setup" "$payload"; }
echo
echo "Gotowe. Aby otrzymywać aktualizacje w Homebrew Channel, dodaj repozytorium:"
echo "  Homebrew Channel > Ustawienia > Repozytoria > dodaj adres:"
echo "  https://raw.githubusercontent.com/$REPO/main/homebrew/repo.json"
