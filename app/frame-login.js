(function () {
    'use strict';
    var active = null;
    function cancel() { if (active) active(new Error('LOGIN_CANCELLED')); }
    function readCookie(doc, name) {
        var item = doc.cookie.split(';').find(function (c) { return c.trim().indexOf(name + '=') === 0; });
        if (!item) return null;
        var value = item.trim().slice(name.length + 1); if (value.length > 65536) throw new Error('INVALID_SESSION');
        return JSON.parse(decodeURIComponent(value));
    }
    window.NetiaFrameLogin = {
        cancel: cancel,
        forget: function () {
            cancel();
            return new Promise(function (resolve, reject) {
                var frame = document.getElementById('netia-login'), done = false;
                active=finish;
                var timeout = setTimeout(function () { finish(new Error('COOKIE_CLEAR_FAILED')); }, 15000), timer = setInterval(function () {
                    try {
                        var w = frame.contentWindow; if (w.location.origin !== 'https://go.netia.pl') return;
                        ['user-session', 'user-recognition', 'profile-id'].forEach(function (name) {
                            ['', ';domain=go.netia.pl', ';domain=.go.netia.pl', ';domain=netia.pl', ';domain=.netia.pl'].forEach(function (domain) { w.document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/' + domain; });
                        });
                        w.localStorage.removeItem('credentials');
                        if (readCookie(w.document, 'user-session') || readCookie(w.document, 'user-recognition')) return finish(new Error('COOKIE_CLEAR_FAILED'));
                        finish();
                    } catch (error) { if (error.name === 'SecurityError') finish(new Error('FRAME_ACCESS_UNSUPPORTED')); }
                }, 100);
                function finish(error) { if (done) return; done = true;if(active===finish)active=null; clearInterval(timer); clearTimeout(timeout); frame.src = 'about:blank'; if (error) reject(error); else resolve(); }
                frame.src = 'https://go.netia.pl/login';
            });
        },
        open: function (credentials, status, interactive, manual, revealed) {
            cancel();
            return new Promise(function (resolve, reject) {
                // autoSubmitted spans documents: one automated submit per open, later attempts are the user's.
                var frame = document.getElementById('netia-login'), prepared = null, autoSubmitted = false, filled = false, finished = false, lastError = null, challenge = false, captchaSince = 0;
                var view=document.getElementById('web-login');if(view&&view.classList)view.classList.remove('form-ready');
                var captured = null, formReady=false, scanned=0, openedAt=Date.now(), submittedAt=0;status(T("text.odczyt_wersji_systemu_i_przygotowanie_logowania"));
                // A remembered account signs in behind the app's own screen; the form appears only when the user is needed:
                // a challenge, a rejected attempt (manual), or no session 20 s after the automated submit (30 s overall).
                var quiet = !!(credentials && credentials.password && !manual);
                var shown = false;
                function reveal() { if (shown) return; shown = true; if (view && view.classList) view.classList.add('form-ready'); if (typeof revealed === 'function') revealed(); }
                var timer = setInterval(tick, 10), timeout = setTimeout(function () { finish(new Error('LOGIN_TIMEOUT')); }, credentials || interactive ? 300000 : 15000);
                active = finish;
                function finish(error, data) {
                    if (finished) return; finished = true; clearInterval(timer); clearTimeout(timeout); if (active === finish) active = null;
                    if (data && (captured || credentials)) data.credentials = captured || credentials;
                    credentials = null; captured = null; prepared = null;if(view&&view.classList)view.classList.remove('form-ready'); frame.src = 'about:blank';
                    if (error) reject(error); else resolve(data);
                }
                function tick() {
                    try {
                        var w = frame.contentWindow;
                        if (w.location.origin !== 'https://go.netia.pl') return;
                        var doc = w.document;
                        if (prepared !== doc) {
                            if (typeof w.webOS === 'undefined') w.webOS = window.webOS;
                            if(!doc.head)return;
                            filled=false;formReady=false;captchaSince=0;status(T("text.wczytywanie_oficjalnego_formularza_netia_go"));var style=doc.createElement('style');style.textContent='form input,form button{font-size:26px!important}html,body{overflow:hidden!important;overscroll-behavior:none!important}*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}';doc.head.appendChild(style);if(doc.addEventListener)doc.addEventListener('wheel',function(e){e.preventDefault();},{capture:true,passive:false});prepared=doc;scanned=0;
                        }
                        if(Date.now()-scanned<100)return;scanned=Date.now();
                        w.localStorage.removeItem('credentials');
                        var frames=Array.prototype.slice.call(doc.querySelectorAll('iframe'));if(frames.some(function(node){var r=node.getBoundingClientRect&&node.getBoundingClientRect();return r&&r.width>200&&r.height>80;}))reveal();
                        // A visible checkbox or image challenge belongs to the user; automation stops for this attempt.
                        if (!challenge && frames.some(visibleChallenge)) { challenge = true; reveal(); status(T('login.challenge')); }
                        if (quiet && (submittedAt ? Date.now() - submittedAt > 20000 : Date.now() - openedAt > 30000)) { quiet = false; reveal(); status(T('login.manualSubmit')); }
                        var session = readCookie(doc, 'user-session'), recognition = readCookie(doc, 'user-recognition');
                        if (session && recognition && Number.isFinite(session.keyExpirationTime) && session.keyExpirationTime * 1000 > Date.now()) return finish(null, {session: session, clientId: recognition.clientId, deviceId: recognition.deviceId});
                        var failure = doc.body && doc.body.textContent.match(/podając kod:\s*\(?(\d{4,6})[:)]/i);
                        if (failure) return finish(new Error('RPC_' + failure[1]));
                        var buttons = Array.prototype.slice.call(doc.querySelectorAll('button'));
                        var decline = buttons.find(function (b) { return b.textContent.trim() === 'Nie, przejdź do serwisu'; });
                        if (decline && decline.getBoundingClientRect().height) { status(T("text.odrzucanie_opcjonalnych_zgod_partnerow"));decline.click(); return; }
                        var username = doc.querySelector('input[name="email"]'), password = doc.querySelector('input[name="password"]');
                        var submit = buttons.find(function (b) { return b.textContent.trim() === 'Zaloguj się'; });
                        if(username&&password&&!formReady){formReady=true;if(!quiet)reveal();status(challenge?T('login.challenge'):credentials&&credentials.password?T(manual||autoSubmitted?'login.manualSubmit':"text.przywracanie_zapamietanego_konta"):credentials?T('login.usernameSaved'):T("text.wpisz_login_i_haslo_klawiatura_telewizora"));}
                        if (interactive && username && password && !username.netiaRememberWatch) {
                            username.netiaRememberWatch = true;
                            var capture = function () { if (!finished && username.value && password.value) captured = {username: username.value, password: password.value}; };
                            username.addEventListener('input', capture); password.addEventListener('input', capture);
                        }
                        if (username && password && username.value && password.value) captured = {username: username.value, password: password.value};
                        if (!credentials && !interactive && username && password && doc.readyState === 'complete' && w.next && w.next.router && w.next.router.isReady) return finish(new Error('LOGIN_REQUIRED'));
                        if (credentials && username && password && doc.readyState === 'complete' && w.next && w.next.router && w.next.router.isReady) {
                            if(filled){
                                if(credentials.password&&!manual&&!autoSubmitted&&!challenge&&submit&&!submit.disabled&&captchaReady(w,doc)){autoSubmitted=true;submittedAt=Date.now();submit.click();status(T("text.logowanie_w_serwisie_netia_go"));}
                                return;
                            }
                            var setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
                            setter.call(username, credentials.username); username.dispatchEvent(new w.Event('input', {bubbles: true})); username.dispatchEvent(new w.Event('change', {bubbles: true}));
                            filled = true;
                            if(!credentials.password)return;
                            setter.call(password, credentials.password); password.dispatchEvent(new w.Event('input', {bubbles: true})); password.dispatchEvent(new w.Event('change', {bubbles: true}));
                            username.addEventListener('input', function () { if (credentials) credentials.username = username.value; });
                            password.addEventListener('input', function () { if (credentials) credentials.password = password.value; });
                            // Submit on a later scan, after the page has processed input/change.
                        }
                    } catch (error) {
                        if (error.name === 'SecurityError') return finish(new Error('FRAME_ACCESS_UNSUPPORTED'));
                        if (error instanceof SyntaxError || error.message === 'INVALID_SESSION') return finish(new Error('INVALID_SESSION'));
                        if (lastError !== error.name) { lastError = error.name; status(T("text.trwa_ladowanie_logowania_netia_go")); }
                    }
                }
                // Netia loads reCAPTCHA Enterprise lazily (idle callback, 3 s) and the login request needs its token.
                // Submitting earlier sends no token, which the server rejects, so wait for the page's own readiness.
                function captchaReady(w, doc) {
                    var api = w.grecaptcha && w.grecaptcha.enterprise;
                    if (!captchaSince) captchaSince = Date.now();
                    if (api && typeof api.ready === 'function' && !api.netiaWatch) { api.netiaWatch = true; api.ready(function () { api.netiaReady = true; }); }
                    if (api && api.netiaReady) return true;
                    // Without a reCAPTCHA script the form is not protected; with one, Netia's own wait ends after 10 s.
                    var elapsed = Date.now() - captchaSince;
                    return doc.getElementById && doc.getElementById('google-recaptcha-v3') ? elapsed > 12000 : elapsed > 4000;
                }
                function visibleChallenge(node) {
                    var src = String(node.src || '');
                    if (src.indexOf('/recaptcha/') < 0 || /[?&]size=invisible/.test(src)) return false;
                    var r = node.getBoundingClientRect();
                    if (!(r.width > 0 && r.height > 0)) return false;
                    var style = frame.contentWindow.getComputedStyle ? frame.contentWindow.getComputedStyle(node) : null;
                    return !style || style.visibility !== 'hidden' && style.display !== 'none';
                }
                var started = false;
                // Netia reads the LG callback synchronously, so prime the SDK cache before its page loads.
                try {
                    window.webOS.deviceInfo(function (info) {
                        if (finished || started) return;
                        if (!info || !info.sdkVersion) return finish(new Error('DEVICE_INFO_UNAVAILABLE'));
                        started = true;status(T("text.laczenie_z_bezpiecznym_logowaniem_netia_go")); frame.src = 'https://go.netia.pl/login';
                    });
                } catch (error) { finish(new Error('DEVICE_INFO_UNAVAILABLE')); }
            });
        }
    };
}());
