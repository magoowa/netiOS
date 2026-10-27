#!/bin/sh
# Runs on the LG TV (root shell, started by the Windows/macOS installer over SSH with a terminal).
# Installs or updates netiOS from the GitHub repository given as OWNER/NAME (verifying the SHA-256), or from a local IPK
# already copied to the TV (--local FILE), and starts the app.
set -e
WORK=/tmp/netios-install
mkdir -p "$WORK"
if [ "$1" = "--local" ]; then
  IPK="${2:?usage: tv-setup.sh --local FILE}"
  # Node instead of ar/tar: BusyBox on older webOS (4.x) lacks the ar syntax and tar options this needs.
  VERSION=$(node -e '
  var b=require("fs").readFileSync(process.argv[1]),at=8;
  while(at+60<=b.length){var h=b.slice(at,at+60).toString("binary"),n=h.slice(0,16).trim(),s=parseInt(h.slice(48,58),10);
  if(/^control\.tar\.gz/.test(n)){var m=/Version: *([0-9.]+)/.exec(require("zlib").gunzipSync(b.slice(at+60,at+60+s)).toString("binary"));if(m)console.log(m[1]);break}
  at+=60+s+(s%2)}' "$IPK" 2>/dev/null || true)
  [ -n "$VERSION" ] || { echo "netiOS: to nie jest paczka IPK netiOS."; rm -rf "$WORK"; exit 1; }
  echo "netiOS: lokalna paczka, wersja $VERSION"
else
  REPO="${1:?usage: tv-setup.sh OWNER/NAME | --local FILE}"
  IPK="$WORK/netios.ipk"
  BASE="https://raw.githubusercontent.com/$REPO/main/homebrew"
  echo "netiOS: pobieranie informacji o wydaniu z $REPO..."
  curl -fsSL "$BASE/com.netiago.webos.manifest.json" -o "$WORK/manifest.json"
  # The manifest is JSON; webOS ships Node.js for app services, so it parses it reliably.
  eval "$(node -e '
  var m=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
  if(!/^https:\/\//.test(m.ipkUrl)||!/^[0-9a-f]{64}$/.test(m.ipkHash.sha256)||!/^[0-9.]+$/.test(m.version))throw Error("INVALID_MANIFEST");
  console.log("URL=\""+m.ipkUrl+"\"; SHA=\""+m.ipkHash.sha256+"\"; VERSION=\""+m.version+"\"");
  ' "$WORK/manifest.json")"
  echo "netiOS: pobieranie wersji $VERSION..."
  curl -fL --retry 2 "$URL" -o "$IPK"
  echo "$SHA  $IPK" | sha256sum -c - >/dev/null || { echo "netiOS: niezgodna suma SHA-256, przerywam."; rm -rf "$WORK"; exit 1; }
fi
echo "netiOS: instalowanie..."
# luna-send silently does nothing when its stdin is a pipe (as under "curl | sh"), hence </dev/null on every call.
# The subscription reports the real outcome; the version check alone would pass when the same version was installed.
luna-send -w 180000 -i luna://com.webos.appInstallService/dev/install "{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"$IPK\",\"subscribe\":true}" </dev/null >"$WORK/install.log" 2>&1 &
PID=$!; i=0
while [ $i -lt 90 ] && kill -0 $PID 2>/dev/null && ! grep -q '"state" *: *"installed"\|failed\|"returnValue" *: *false' "$WORK/install.log"; do sleep 2; i=$((i+1)); done
kill $PID 2>/dev/null || true
APPINFO=/media/developer/apps/usr/palm/applications/com.netiago.webos/appinfo.json
if ! grep -q '"state" *: *"installed"' "$WORK/install.log" || ! grep -q "\"version\": *\"$VERSION\"" "$APPINFO" 2>/dev/null; then
  echo "netiOS: instalacja się nie powiodła:"; tail -c 600 "$WORK/install.log"; echo; rm -rf "$WORK"; exit 1
fi
rm -rf "$WORK"
luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.netiago.webos"}' </dev/null >/dev/null 2>&1 || true
echo "NETIOS_INSTALLED $VERSION"
