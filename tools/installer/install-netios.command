#!/bin/zsh
# netiOS installer for macOS (double-click in Finder): finds LG webOS TVs on the local network, installs the latest
# netiOS over SSH (telnet fallback) and shows the Homebrew Channel repository address. Requires Homebrew Channel (root) and SSH or telnet on the TV.
REPO="${NETIOS_REPO:-magoowa/netiOS}"
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
  { sleep 1; printf '%s; exit\r\n' "$remote"; sleep 300; } | nc "$tv" 23 | LC_ALL=C tr -d '\373\374\375\376\377' | tee "$log"
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
