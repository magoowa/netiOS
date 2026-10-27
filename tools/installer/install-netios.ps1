# netiOS installer for Windows: finds LG webOS TVs on the local network, installs the latest netiOS over SSH (telnet fallback) and shows
# the Homebrew Channel repository address. Requires a TV with Homebrew Channel (root) and SSH or telnet enabled.
param([string]$Repo = 'magoowa/netiOS', [string]$Tv = '', [string]$Ipk = '', [switch]$Telnet, [switch]$ImportSession)
$ErrorActionPreference = 'Stop'

function Find-Tvs {
    # SSDP goes out of every private IPv4 interface: on PCs with virtual adapters (WSL, Hyper-V, VPN) the default
    # route for multicast often is not the home network.
    $request = [Text.Encoding]::ASCII.GetBytes("M-SEARCH * HTTP/1.1`r`nHOST: 239.255.255.250:1900`r`nMAN: `"ssdp:discover`"`r`nMX: 1`r`nST: urn:schemas-upnp-org:device:MediaRenderer:1`r`n`r`n")
    $target = New-Object System.Net.IPEndPoint([Net.IPAddress]::Parse('239.255.255.250'), 1900)
    $locals = [Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' } |
        ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and $_.Address.ToString() -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' } | ForEach-Object { $_.Address }
    $clients = @(foreach ($local in $locals) { try { $c = New-Object System.Net.Sockets.UdpClient(New-Object System.Net.IPEndPoint($local, 0)); 1..2 | ForEach-Object { [void]$c.Send($request, $request.Length, $target) }; $c } catch { } })
    $found = @{}; $until = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $until) {
        $ready = @($clients | Where-Object { $_.Available -gt 0 })
        if (-not $ready.Count) { Start-Sleep -Milliseconds 50; continue }
        foreach ($client in $ready) { try {
            $from = New-Object System.Net.IPEndPoint([Net.IPAddress]::Any, 0)
            $text = [Text.Encoding]::ASCII.GetString($client.Receive([ref]$from))
            $address = $from.Address.ToString()
            if ($found.ContainsKey($address)) { continue }
            $location = ([regex]'(?im)^location:\s*(\S+)').Match($text).Groups[1].Value
            if (-not $location) { continue }
            $xml = (Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $location).Content
            if ($xml -notmatch 'webos|LG Electronics|LG Smart') { continue }
            $name = ([regex]'<friendlyName>([^<]*)</friendlyName>').Match($xml).Groups[1].Value
            $found[$address] = $(if ($name) { $name } else { 'LG webOS TV' })
        } catch { } }
    }
    $clients | ForEach-Object { $_.Close() }
    return $found
}

Write-Host 'netiOS - instalator' -ForegroundColor Cyan
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) { Write-Host 'Brak klienta OpenSSH. Włącz go w Ustawienia > Aplikacje > Funkcje opcjonalne > Klient OpenSSH.'; exit 1 }
if (-not $Tv) {
    Write-Host 'Szukam telewizorów LG w sieci...'
    $tvs = Find-Tvs; $list = @($tvs.Keys | Sort-Object)
    for ($i = 0; $i -lt $list.Count; $i++) { Write-Host ("  {0}. {1} ({2})" -f ($i + 1), $tvs[$list[$i]], $list[$i]) }
    $prompt = $(if ($list.Count) { 'Numer TV lub adres IP' } else { 'Nie znaleziono TV. Podaj adres IP' })
    $answer = (Read-Host $prompt).Trim()
    $Tv = $(if ($answer -match '^\d+$' -and [int]$answer -ge 1 -and [int]$answer -le $list.Count) { $list[[int]$answer - 1] } else { $answer })
}
if ($Tv -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { Write-Host 'Nieprawidłowy adres IP.'; exit 1 }

function Test-Port([string]$address, [int]$port) {
    $c = New-Object System.Net.Sockets.TcpClient
    try { return $c.BeginConnect($address, $port, $null, $null).AsyncWaitHandle.WaitOne(1500) -and $c.Connected } catch { return $false } finally { $c.Close() }
}
# Fallback for TVs with SSH off: Homebrew Channel's root telnet (port 23, no password). Minimal client: refuses every
# option the server proposes, sends the command and prints the output until the connection closes.
function Invoke-Telnet([string]$address, [string]$command) {
    $client = New-Object System.Net.Sockets.TcpClient($address, 23); $stream = $client.GetStream(); $stream.ReadTimeout = 300000
    $line = [Text.Encoding]::ASCII.GetBytes("$command; exit`r`n"); $sent = $false; $output = New-Object System.Text.StringBuilder; $buffer = New-Object byte[] 4096
    try { while ($true) {
        if (-not $sent -and -not $stream.DataAvailable) { Start-Sleep -Milliseconds 700; if (-not $stream.DataAvailable) { $stream.Write($line, 0, $line.Length); $sent = $true } }
        $n = $stream.Read($buffer, 0, $buffer.Length); if ($n -le 0) { break }
        $text = New-Object System.Collections.Generic.List[byte]
        for ($i = 0; $i -lt $n; $i++) {
            if ($buffer[$i] -eq 255 -and $i + 2 -lt $n -and $buffer[$i + 1] -ge 251) { $reply = [byte[]](255, $(if ($buffer[$i + 1] -in 251, 252) { 254 } else { 252 }), $buffer[$i + 2]); $stream.Write($reply, 0, 3); $i += 2 }
            else { $text.Add($buffer[$i]) }
        }
        $chunk = [Text.Encoding]::UTF8.GetString($text.ToArray()); [void]$output.Append($chunk); Write-Host -NoNewline $chunk
    } } catch { } finally { $client.Close() }
    return $output.ToString()
}

# -ImportSession hands a session from a browser to the TV app: the official go.netia.pl form needs Chromium 60+, so on
# webOS 4 the user logs in on the computer instead and the app picks the session up once on its next start.
# The user logs in at go.netia.pl themselves in a browser window with a dedicated netiOS profile (Chromium refuses DevTools
# on the default profile); the script only watches that window's go.netia.pl cookies over the local DevTools port and
# closes it once a valid session appears. The profile stays, so later imports need no login (or one click with a saved
# password) and the user's own profile is never touched.
function Get-BrowserSession {
    # The user's default browser when it is Chromium-based (DevTools port); otherwise the first installed one.
    $browser = $null
    try {
        $progId = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice').ProgId
        $command = (Get-ItemProperty -LiteralPath "Registry::HKEY_CLASSES_ROOT\$progId\shell\open\command").'(default)'
        $exe = $(if ($command -match '^\s*"([^"]+)"') { $Matches[1] } else { ($command -split '\s+')[0] })
        if ((Split-Path -Leaf $exe) -match '^(chrome|msedge|brave|vivaldi|opera|launcher|chromium|thorium|yandex)\.exe$' -and (Test-Path -LiteralPath $exe)) { $browser = $exe }
        elseif ($exe) { Write-Host "Domyślna przeglądarka ($(Split-Path -Leaf $exe)) nie obsługuje tego trybu; używam innej zainstalowanej." -ForegroundColor Yellow }
    } catch { }
    if (-not $browser) {
        $browser = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    }
    if (-not $browser) { throw 'Nie znaleziono przeglądarki opartej na Chromium (Chrome, Edge, Brave, Opera, Vivaldi).' }
    Write-Host "Przeglądarka: $(Split-Path -Leaf $browser)"
    $port = Get-Random -Minimum 20000 -Maximum 40000
    $profileDir = Join-Path $env:LOCALAPPDATA ("netiOS\login-" + [IO.Path]::GetFileNameWithoutExtension($browser))
    if (-not (Test-Path -LiteralPath $profileDir)) {
        # New profile: restore the previous session on start so go.netia.pl's session cookies survive between imports.
        New-Item -ItemType Directory -Force (Join-Path $profileDir 'Default') | Out-Null
        [IO.File]::WriteAllText((Join-Path $profileDir 'Default\Preferences'), '{"session":{"restore_on_startup":1},"browser":{"has_seen_welcome_page":true}}')
        Write-Host 'Pierwsze logowanie w profilu netiOS: zaloguj się i pozwól przeglądarce zapamiętać hasło - kolejne razy pójdą same.' -ForegroundColor Yellow
    }
    $process = Start-Process $browser -PassThru -ArgumentList "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=$port", "--user-data-dir=`"$profileDir`"", '--no-first-run', '--no-default-browser-check', '--new-window', 'https://go.netia.pl/login'
    $socket = $null; $id = 0; $script:closing = $false
    function Send-Cdp([string]$method) {
        $script:id++; $bytes = [Text.Encoding]::UTF8.GetBytes((@{id = $script:id; method = $method} | ConvertTo-Json -Compress))
        $socket.SendAsync((New-Object ArraySegment[byte] (, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait()
        $buffer = New-Object byte[] 65536; $text = New-Object System.Text.StringBuilder
        do {
            do { $r = $socket.ReceiveAsync((New-Object ArraySegment[byte] (, $buffer)), [Threading.CancellationToken]::None).Result; [void]$text.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $r.Count)) } until ($r.EndOfMessage)
            $reply = $text.ToString() | ConvertFrom-Json; [void]$text.Clear()
        } until ($reply.id -eq $script:id)
        return $reply.result
    }
    try {
        for ($i = 0; $i -lt 900; $i++) {
            Start-Sleep 1
            # Browsers often hand the launch to another process and exit at once, so only the DevTools port tells whether
            # the window is up; give it 30 s to appear.
            if (-not $socket -and $i -ge 30) { throw 'Przeglądarka nie udostępniła okna logowania.' }
            try {
                if (-not $socket) {
                    $endpoint = (Invoke-RestMethod -TimeoutSec 2 "http://127.0.0.1:$port/json/version").webSocketDebuggerUrl
                    $socket = New-Object System.Net.WebSockets.ClientWebSocket; $socket.ConnectAsync([Uri]$endpoint, [Threading.CancellationToken]::None).Wait()
                }
                $cookies = @((Send-Cdp 'Storage.getCookies').cookies | Where-Object { $_.domain -match '(^|\.)netia\.pl$' })
                $found = @{}; foreach ($c in $cookies) { if ($c.name -in 'user-session', 'user-recognition') { $found[$c.name] = [Uri]::UnescapeDataString($c.value) | ConvertFrom-Json } }
                # Browser.close drops the socket before any reply, so it is fire-and-forget; finally kills what remains.
                # Only a session with time left counts; an expired one stays until the page refreshes it or the user logs in.
                $live = $found['user-session'] -and $found['user-session'].key -and $found['user-session'].keyExpirationTime -gt [DateTimeOffset]::UtcNow.AddMinutes(5).ToUnixTimeSeconds()
                if ($live -and $found['user-recognition']) {
                    try { $bytes = [Text.Encoding]::UTF8.GetBytes('{"id":999999,"method":"Browser.close"}'); $socket.SendAsync((New-Object ArraySegment[byte] (, $bytes)), 'Text', $true, [Threading.CancellationToken]::None).Wait(2000) | Out-Null } catch { }
                    $script:closing = $true
                    return @($found['user-session'], $found['user-recognition'])
                }
            } catch { if ($socket -and $socket.State -ne 'Open') { throw 'Okno logowania zostało zamknięte.' } }
        }
        throw 'Nie zalogowano w ciągu 15 minut.'
    } finally {
        if ($socket) { $socket.Dispose() }
        # Give a requested Browser.close time to write the profile (cookies, saved password) before forcing the window.
        if ($script:closing) { Start-Sleep 3 }
        Get-CimInstance Win32_Process -Filter "CommandLine LIKE '%remote-debugging-port=$port%'" -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch { } }
    }
}

if ($ImportSession) {
    Write-Host 'Otwieram Netia GO w profilu netiOS. Jeśli zobaczysz formularz, zaloguj się; okno zamknie się samo.'
    try { $cookies = Get-BrowserSession } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 }
    $session = $cookies[0]; $recognition = $cookies[1]
    if (-not ($session.id -and $session.key -and $session.keyExpirationTime -and $recognition.clientId -and $recognition.deviceId)) { Write-Host 'W ciasteczkach brakuje sesji Netia GO; zaloguj się ponownie.' -ForegroundColor Red; exit 1 }
    if ([DateTimeOffset]::FromUnixTimeSeconds([long]$session.keyExpirationTime) -lt [DateTimeOffset]::UtcNow) { Write-Host 'Sesja Netia GO już wygasła; uruchom ponownie.' -ForegroundColor Red; exit 1 }
    $json = @{session = @{id = $session.id; key = $session.key; keyExpirationTime = $session.keyExpirationTime}; clientId = $recognition.clientId; deviceId = $recognition.deviceId} | ConvertTo-Json -Compress
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
    # Short echo chunks: the telnet shell's line editor copes badly with very long lines.
    $dir = '/media/internal/com.netiago.webos'; $parts = @("umask 077; mkdir -p $dir; : > /tmp/netios-session.b64")
    for ($i = 0; $i -lt $b64.Length; $i += 400) { $parts += "echo $($b64.Substring($i, [Math]::Min(400, $b64.Length - $i))) >> /tmp/netios-session.b64" }
    $parts += "base64 -d /tmp/netios-session.b64 > $dir/import-session.json && rm /tmp/netios-session.b64 && echo NETIOS_SESSION_READY"
    if (-not $Telnet -and (Test-Port $Tv 22)) {
        Write-Host "Łączę z $Tv przez SSH jako root (domyślne hasło: alpine)."
        ssh -tt -o StrictHostKeyChecking=accept-new "root@$Tv" ($parts -join '; '); $ok = $LASTEXITCODE -eq 0
    } elseif (Test-Port $Tv 23) { $ok = (Invoke-Telnet $Tv ($parts -join '; ')) -match 'NETIOS_SESSION_READY' }
    else { Write-Host 'TV nie odpowiada na SSH (22) ani telnet (23).' -ForegroundColor Red; exit 1 }
    if (-not $ok) { Write-Host 'Nie udało się przekazać sesji.' -ForegroundColor Red; exit 1 }
    Write-Host 'Gotowe. Uruchom netiOS na telewizorze (lub uruchom go ponownie) - zaloguje się tą sesją.' -ForegroundColor Green
    exit 0
}

# A local IPK wins over the GitHub release: -Ipk, then one next to the installer, then the newest in the repository's
# dist/; otherwise the user may type a path, and Enter downloads the latest release.
function Find-Ipk {
    if ($Ipk) { return $Ipk }
    $near = @(Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ipk' -ErrorAction SilentlyContinue)
    $dist = Join-Path $PSScriptRoot '..\..\dist'
    if (-not $near.Count -and (Test-Path -LiteralPath $dist)) { $near = @(Get-ChildItem -LiteralPath $dist -Filter 'com.netiago.webos_*_all.ipk') }
    $best = $near | Sort-Object { try { [version]($_.Name -replace '^.*?_([\d.]+)_all\.ipk$', '$1') } catch { [version]'0.0' } }, LastWriteTime | Select-Object -Last 1
    if ($best) {
        $answer = (Read-Host "Lokalna paczka: $($best.Name). Enter = użyj jej, albo podaj inną ścieżkę").Trim('" ')
        return $(if ($answer) { $answer } else { $best.FullName })
    }
    return (Read-Host 'Ścieżka do pliku IPK (Enter = pobierz najnowszą wersję z GitHuba)').Trim('" ')
}
$Ipk = Find-Ipk
$script = "https://raw.githubusercontent.com/$Repo/main/tools/installer/tv-setup.sh"
$remote = "curl -fsSL $script | sh -s -- $Repo"
$push = $null
if ($Ipk) {
    if (-not (Test-Path -LiteralPath $Ipk -PathType Leaf)) { Write-Host "Nie ma pliku $Ipk." -ForegroundColor Red; exit 1 }
    $setupFile = Join-Path $PSScriptRoot 'tv-setup.sh'
    $setup = $(if (Test-Path -LiteralPath $setupFile) { [IO.File]::ReadAllBytes($setupFile) } else { (Invoke-WebRequest -UseBasicParsing $script).RawContentStream.ToArray() })
    $payload = [byte[]]($setup + [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Ipk).Path))
    # The TV has no listening netcat, so Node receives tv-setup.sh + the IPK on port 5599 while this PC pushes them;
    # the bootstrap travels base64-encoded so no quoting survives the SSH/telnet command line.
    $boot = "W=/tmp/netios-install; mkdir -p `$W; node -e 'var n=+process.argv[2],f=require(""fs"").createWriteStream(process.argv[1]),g=0;require(""net"").createServer(function(c){c.on(""data"",function(d){f.write(d);g+=d.length;if(g>=n)f.end(function(){process.exit(0)})})}).listen(5599);setTimeout(function(){process.exit(1)},300000)' `$W/p $($payload.Length) || exit 1; dd if=`$W/p of=`$W/s.sh bs=1 count=$($setup.Length) 2>/dev/null; tail -c +$($setup.Length + 1) `$W/p > `$W/n.ipk; rm `$W/p; sh `$W/s.sh --local `$W/n.ipk"
    $remote = "echo $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($boot.Replace("`r", '')))) | base64 -d | sh"
    Write-Host "Instaluję lokalną paczkę $(Split-Path -Leaf $Ipk)."
    $push = Start-Job -ArgumentList $Tv, $payload -ScriptBlock { param($tv, $data)
        for ($i = 0; $i -lt 300; $i++) {
            try { $c = New-Object System.Net.Sockets.TcpClient($tv, 5599); $s = $c.GetStream(); $s.Write($data, 0, $data.Length); $s.Flush(); Start-Sleep 1; $c.Close(); return } catch { Start-Sleep 1 }
        }
    }
}
if (-not $Telnet -and (Test-Port $Tv 22)) {
    Write-Host "Łączę z $Tv przez SSH jako root. Podaj hasło SSH telewizora, gdy zostaniesz poproszony (domyślnie alpine)."
    ssh -tt -o StrictHostKeyChecking=accept-new "root@$Tv" $remote
    $ok = $LASTEXITCODE -eq 0
} elseif (Test-Port $Tv 23) {
    Write-Host "SSH jest niedostępne, łączę z $Tv przez telnet (Homebrew Channel)."
    $ok = (Invoke-Telnet $Tv $remote) -match 'NETIOS_INSTALLED'
} else { Write-Host 'TV nie odpowiada na SSH (22) ani telnet (23). Włącz jedno z nich w Homebrew Channel.' -ForegroundColor Red; exit 1 }
if ($push) { Stop-Job $push; Remove-Job $push -Force }
if (-not $ok) { Write-Host 'Instalacja nie powiodła się.' -ForegroundColor Red; exit 1 }

Write-Host ''
Write-Host 'Gotowe. Aby otrzymywać aktualizacje w Homebrew Channel, dodaj repozytorium:' -ForegroundColor Green
Write-Host "  Homebrew Channel > Ustawienia > Repozytoria > dodaj adres:"
Write-Host "  https://raw.githubusercontent.com/$Repo/main/homebrew/repo.json" -ForegroundColor Yellow
