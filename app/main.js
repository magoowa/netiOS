(function () {
    'use strict';
    // On the TV (Chromium 68) every toLocale*String call and new Intl.DateTimeFormat builds a formatter (several ms each;
    // 575 ms measured when the guide added a day). Each format is created once and reused.
    var formats={time:new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Warsaw'}),clock:new Intl.DateTimeFormat('pl-PL',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Warsaw'}),
        dayKey:new Intl.DateTimeFormat('en',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Europe/Warsaw'}),date:new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'long',timeZone:'Europe/Warsaw'}),weekday:new Intl.DateTimeFormat('pl-PL',{weekday:'long',timeZone:'Europe/Warsaw'})};
    var serverEpoch = null, serverAt = 0, guideChannel = null, guideSearchTimer, guideFirst, guideLast, guideLoading = false, guideWheelFrame = 0, guideScrollFrame = 0, guideWheelBrowsing = false;
    function netiaNow() { return serverEpoch === null ? null : serverEpoch + performance.now() - serverAt; }
    function syncClock() { return rpc('clock').then(function (sample) { if (sample && Number.isFinite(sample.epoch)) { serverEpoch = sample.epoch; serverAt = performance.now(); } }).catch(function () { serverEpoch = null; }); }
    var numberTimer, channelDigits='',pendingTune=null;
    var noticeTimer, selectedVod=null, playerReturn='channels', libraryKind='series', libraryId, libraryNext=null, libraryItems=[], libraryNodes=[], libraryTrail=[], libraryGeneration=0, libraryLoading=false;
    var libraryDetails=null,libraryDetailsRevision=0,libraryEpisodeSort='seasons';
    var libraryCache=Object.create(null),libraryScope=null,artworkQueue=[],artworkActive=0;
    var screen = 'login', busy = false, player = null, generation = 0, licenseError = '';
    var selectedChannel = null, focusedChannel = null, channelNodes = Object.create(null), channelItems = [], nowPrograms = {}, playerPrograms = [];
    var prefs = TVModel.preferences(), preferenceKey = null, channelMode = 'all', qualityMode = 'highest';
    var modal = null, returnFocus = null, hideTimer, guideReturn = 'channels', guideDate = day(Date.now()), guideItems = [], guideGeneration = 0, playerDay = '', saveReturn = 'channels', saveAfterLogin = false, pendingLogin = null, loginTimer = null, loginRevision = 0;
    var $ = function (id) { return document.getElementById(id); }, bridges = [];
    var messages = {CONFIG_INVALID:T('errors.config'),CONFIG_ACCESS:T('errors.configAccess'),FRAME_ACCESS_UNSUPPORTED: T("text.ten_tv_nie_udostepnia_sesji_ramki_aplikacji_logowanie"), CAPTCHA_REQUIRED: T("text.zaloguj_sie_ponownie_w_aplikacji"), LOGIN_REQUIRED: T("text.zaloguj_sie_ponownie"), PROFILE_REQUIRED: T("text.wybierz_profil"), NETWORK: T("text.nie_udalo_sie_polaczyc_sprawdz_siec_i_certyfikaty"), VAULT_UNLOCK: T("text.bledna_fraza_lub_uszkodzony_schowek"), VAULT_PASSPHRASE: T("text.fraza_musi_miec_od_12_do_256_znakow"), INVALID_SESSION: T("text.sesja_wygasla_zaloguj_sie_ponownie"), PARENTAL_CONTROL_REQUIRED: T("text.profil_wymaga_kontroli_rodzicielskiej_obsluga_pin_nie_jest"), UNSUPPORTED_ACCESS_POLICY: T("text.ten_kanal_wymaga_nieobslugiwanej_jeszcze_polityki_sesji"), WIDEVINE_REQUIRED: T("text.brak_obslugi_widevine_na_tym_urzadzeniu"), UNSUPPORTED_STREAM: T("text.brak_strumienia_obslugiwanego_przez_ten_tv"), PREFERENCES_SAVE: T("text.nie_udalo_sie_zapisac_ustawien_kanalow_na_tv")};
    messages.BUFFER_UNAVAILABLE=T("text.poczatek_audycji_jest_poza_dostepnym_buforem_netii");
    messages.RPC_13440 = T("text.netia_odmowila_licencji_tego_kanalu_odswiez_liste_uprawnien");
    messages.RPC_13572 = T("text.serwis_netii_odrzucil_logowanie_13572_sprobuj_ponownie_za");
    messages.DEVICE_INFO_UNAVAILABLE = T("text.nie_udalo_sie_odczytac_wersji_systemu_tv_uruchom");
    messages.CHANNEL_NUMBER=T("text.nie_ma_kanalu_o_takim_numerze_na_tej");
    messages.NOT_ENTITLED = T("text.ten_kanal_nie_ma_potwierdzonego_dostepu_na_tym");
    messages.WEBOS_REQUIRED=T('errors.webosRequired');
    messages.TIMEOUT=T('errors.timeout');
    messages.SERVICE_ERROR=T('errors.service');
    messages.NO_PROFILES=T('errors.noProfiles');
    messages.COOKIE_CLEAR_FAILED=T('errors.cookieClear');
    messages.LOGIN_CANCELLED=T('errors.loginCancelled');
    messages.LOGIN_TIMEOUT=T('errors.loginTimeout');
    messages.LOGIN_SCREEN_REQUIRED=T('errors.loginScreen');
    messages.INVALID_CREDENTIALS=T('errors.credentials');
    messages.STALE_REQUEST=T('errors.staleRequest');
    messages.INVALID_PAGINATION=T('errors.pagination');
    function rpc(method, params) {
        return new Promise(function (resolve, reject) {
            if (typeof WebOSServiceBridge === 'undefined') return reject(new Error('WEBOS_REQUIRED'));
            var bridge = new WebOSServiceBridge(), done = false;
            bridges.push(bridge);
            var timer = setTimeout(function () { finish(new Error('TIMEOUT')); }, 45000);
            function finish(error, data) {
                if (done) return; done = true; clearTimeout(timer);
                bridges.splice(bridges.indexOf(bridge), 1);
                if (error) reject(error); else resolve(data);
            }
            bridge.onservicecallback = function (value) {
                try { var result = JSON.parse(value); if (!result.returnValue) finish(new Error(result.errorCode || 'SERVICE_ERROR')); else finish(null, result.data); }
                catch (error) { finish(new Error('SERVICE_ERROR')); }
            };
            bridge.call('luna://com.netiago.webos.service/' + method, JSON.stringify(params || {}));
        });
    }
    var setIcon=NetiosIcons.set;
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (button) { setIcon(button, button.dataset.icon, button.dataset.text?T(button.dataset.text):undefined); });
    NetiosIcons.selects();
    var oledMinutes=30,oledLastActivity=Date.now(),oledResume=false,oledEnabled=true;
    try{oledEnabled=localStorage.getItem('netios-oled-enabled')!=='false';}catch(error){}
    function oledState(){$('oled-toggle').setAttribute('aria-pressed',String(oledEnabled));setIcon($('oled-toggle'),'lifebuoy',T('options.oled')+' · '+T(oledEnabled?'options.on':'options.off'));}
    oledState();$('oled-toggle').onclick=function(){oledEnabled=!oledEnabled;oledLastActivity=Date.now();oledState();try{localStorage.setItem('netios-oled-enabled',String(oledEnabled));}catch(error){notice(new Error('PREFERENCES_SAVE'));}};
    try{var storedOled=Number(localStorage.getItem('netios-oled-minutes'));if([30,60,90,120].indexOf(storedOled)>=0)oledMinutes=storedOled;}catch(error){}
    $('oled-minutes').value=String(oledMinutes);Array.prototype.forEach.call($('oled-minutes').options,function(option){option.textContent=T('options.minutes',{minutes:option.value});});
    $('oled-minutes').mdiUpdate();
    $('oled-minutes').onchange=function(){var value=Number(this.value);if([30,60,90,120].indexOf(value)<0)return;oledMinutes=value;oledLastActivity=Date.now();try{localStorage.setItem('netios-oled-minutes',String(value));}catch(error){notice(new Error('PREFERENCES_SAVE'));}};
    var optionHelp={'menu-favorite':'options.help.favorite','menu-hide':'options.help.hide','menu-restore':'options.help.restore','refresh-button':'options.help.refresh','menu-profiles':'options.help.profiles','menu-close':'options.help.close','oled-toggle':'options.help.oled','oled-minutes':'options.help.oled','menu-diagnostics':'options.help.diagnostics','close-options':'options.help.closeMenu','smooth-toggle':'options.help.smooth','perf-toggle':'options.help.perf','autonext-toggle':'options.help.autonext'};
    // Help follows focus only; a real pointer move focuses the hovered option, while a dialog opening under a resting
    // pointer (Chromium's synthetic mouseenter) no longer swaps the help for an option that is not selected.
    Object.keys(optionHelp).forEach(function(id){$(id).onfocus=function(){$('option-help').textContent=T(optionHelp[id]);};});
    function wakeOled(event){
        oledLastActivity=Date.now();if($('oled-saver').hidden)return;
        $('oled-saver').hidden=true;if(screen==='player'&&event){$('player-controls').hidden=false;reveal();if(oledResume)$('video').play().catch(notice);}oledResume=false;
        if(event&&event.type!=='mousemove'){event.preventDefault();event.stopImmediatePropagation();}
    }
    ['keydown','mousedown','mousemove','wheel','touchstart'].forEach(function(name){document.addEventListener(name,wakeOled,{capture:true,passive:false});});
    setInterval(function(){
        if(!oledEnabled||screen!=='player'||selectedVod||document.hidden||!$('guide').hidden||modal){oledLastActivity=Date.now();return;}
        if($('oled-saver').hidden&&Date.now()-oledLastActivity>=oledMinutes*60000){oledResume=!$('video').paused;$('video').pause();$('player-controls').hidden=true;$('oled-saver').hidden=false;}
    },1000);
    var lastRegisteredError=null;
    function notice(error) { if(error)lastRegisteredError={time:netiaNow(),code:/^[A-Z_0-9-]+$/.test(error.message)?error.message:'APP_ERROR',message:messages[error.message]||T('errors.generic',{code:/^[A-Z_0-9-]+$/.test(error.message)?error.message:'APP_ERROR'})};clearTimeout(noticeTimer); $('notice').textContent = error ? messages[error.message] || T('errors.generic',{code:/^[A-Z_0-9-]+$/.test(error.message)?error.message:'APP_ERROR'}) : ''; if(error)noticeTimer=setTimeout(function(){notice();},5000); }
    $('notice').onclick=function(){notice();};
    Array.prototype.forEach.call(document.querySelectorAll('.app-version'),function(n){n.textContent=T('version.label',{version:APP_VERSION});});
    function loginStage(text){$('login-stage').textContent=text;$('splash-status').textContent=text;}
    function run(action) {
        if (busy) return Promise.resolve(); busy = true; notice();
        return Promise.resolve().then(action).catch(notice).then(function () { busy = false;if(pendingTune){var id=pendingTune;pendingTune=null;begin(id);} });
    }
    function time(value) { return formats.time.format(new Date(value)); }
    function day(value) {
        var parts = formats.dayKey.formatToParts(new Date(value)), values = {};
        parts.forEach(function (p) { values[p.type] = p.value; }); return values.year + '-' + values.month + '-' + values.day;
    }
    function requestChannelKeys(enabled) {
        var system=typeof PalmSystem!=='undefined'?PalmSystem:typeof webOSSystem!=='undefined'?webOSSystem:null;
        if(system&&typeof system.setKeyMask==='function')try{system.setKeyMask(enabled?['KeyMaskDefault','KeyMaskNumeric','KeyMaskProgramme']:['KeyMaskDefault']);}catch(error){}
    }
    function show(next) {
        cancelChannelOK();Scrolling.releasePointer();Scrolling.update();
        if(screen!==next){wakeOled();oledLastActivity=Date.now();}
        if(screen==='library'&&next!=='library')rememberLibrary();
        clearChannelNumber();if(next!=='channels'&&next!=='player')pendingTune=null;
        $('shell').classList.toggle('library-screen',next==='library');
        if(screen==='library'&&next!=='library'&&next!=='player')libraryGeneration++;screen = next;requestChannelKeys(next==='channels'||next==='player'&&!selectedVod);
        ['login', 'web-login', 'profiles', 'channels', 'library', 'save'].forEach(function (id) { $(id).hidden = id !== next; });
        $('shell').hidden = next === 'player'; $('player-controls').hidden = next !== 'player';
        notice(); closeModal(false);
        var root = next === 'player' ? $('player-controls') : $(next), first = root && root.querySelector('input,button');
        if (first) first.focus(); if (next === 'player') reveal();
    }
    function profiles(force) {
        loginStage(T("text.pobieranie_profili_uzytkownika"));
        return Promise.all([rpc('profiles'), rpc('profilePreference')]).then(function (results) {
            var items = results[0], saved = results[1];
            var automatic = items.length === 1 ? items[0] : items.find(function (p) { return saved && p.id === saved.id; });
            if (force !== true && automatic) return rpc('selectProfile', {id: automatic.id, remember: true}).then(channels);
            show('profiles'); $('remember-profile').checked=!!saved; $('profile-list').textContent = '';
            items.forEach(function (p, i) {
                var button = document.createElement('button'), avatar = document.createElement('span'), name = document.createElement('span');
                avatar.className = 'profile-avatar avatar-' + i % 4;
                avatar.innerHTML = '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="30" r="19"/><path d="M18 88c0-39 64-39 64 0"/></svg>';
                name.className = 'profile-name'; name.textContent = p.name; button.appendChild(avatar); button.appendChild(name);
                button.onclick = function () { run(function () { return rpc('selectProfile', {id: p.id, remember: $('remember-profile').checked}).then(channels); }); };
                $('profile-list').appendChild(button);
            });
            if (!items.length) throw new Error('NO_PROFILES'); $('profile-list').firstChild.focus();
        });
    }
    function loadPreferences(status) {
        var nextKey=status.preferenceKey?'netia-prefs:'+status.preferenceKey:null;
        if(preferenceKey!==nextKey){libraryCache=Object.create(null);artworkQueue=[];libraryGeneration++;}
        if(preferenceKey!==nextKey)configRevision=null;preferenceKey = nextKey;
        try { prefs = TVModel.preferences(preferenceKey ? JSON.parse(localStorage.getItem(preferenceKey)) : null); } catch (e) { prefs = TVModel.preferences(); }
        subtitleSize();
    }
    function savePreferences() {
        try { if (preferenceKey) localStorage.setItem(preferenceKey, JSON.stringify(prefs)); } catch (e) { notice(new Error('PREFERENCES_SAVE')); }
    }
    var configRevision=null,configErrorShown=false;
    function configDefaults(){return {version:1,channelSort:prefs.channelSort,librarySort:prefs.librarySort,oledMinutes:oledMinutes,subtitleSize:prefs.subtitleSize,channels:channelItems.map(function(c){return {id:c.id,name:c.title,favorite:prefs.favorites.indexOf(c.id)>=0,hidden:prefs.hidden.indexOf(c.id)>=0};})};}
    function loadUserConfig(render){
        var scope=preferenceKey;
        return rpc('userConfig',{defaults:configRevision?undefined:configDefaults()}).then(function(data){
            if(scope!==preferenceKey)return;var settings=validateNetiosConfig(data.settings),changed=configRevision!==data.revision;configRevision=data.revision;configErrorShown=false;
            var rows=Object.create(null);settings.channels.forEach(function(c){rows[c.id]=c;});channelItems.forEach(function(c){if(rows[c.id])c.title=rows[c.id].name;});
            var key='netios-config:'+preferenceKey;
            if(localStorage.getItem(key)!==data.revision){
                prefs.channelSort=settings.channelSort;prefs.librarySort=settings.librarySort;prefs.sort=prefs.channelSort[channelMode];prefs.subtitleSize=settings.subtitleSize;
                settings.channels.forEach(function(c){['favorites','hidden'].forEach(function(field){var enabled=field==='favorites'?c.favorite:c.hidden,index=prefs[field].indexOf(c.id);if(enabled&&index<0)prefs[field].push(c.id);else if(!enabled&&index>=0)prefs[field].splice(index,1);});});
                oledMinutes=settings.oledMinutes;$('oled-minutes').value=String(oledMinutes);$('oled-minutes').mdiUpdate();localStorage.setItem('netios-oled-minutes',String(oledMinutes));savePreferences();subtitleSize();localStorage.setItem(key,data.revision);
            }
            $('channel-sort').value=prefs.sort;$('channel-sort').mdiUpdate();
            if(render&&changed){renderChannels();if(screen==='channels')focusChannel();if(screen==='library')orderLibrary();}
        }).catch(function(error){if(!configErrorShown){configErrorShown=true;notice(error);}});
    }
    function channel(id) { return channelItems.find(function (c) { return c.id === id; }); }
    function channelCards(){return Array.prototype.slice.call($('channel-list').querySelectorAll('.channel-card'));}
    function renderChannels() {
        clearChannelNumber();
        var items = TVModel.channels(channelItems, prefs, channelMode), category='', list = $('channel-list'); list.textContent = '';
        ['all', 'favorites', 'hidden'].forEach(function (mode) { $('filter-' + mode).setAttribute('aria-pressed', String(mode === channelMode)); });
        $('count').textContent = T('channels.count',{visible:items.length,total:channelItems.length});
        $('empty-channels').hidden = items.length > 0;
        var fragment = document.createDocumentFragment();
        items.forEach(function (c,i) {
            if(prefs.sort==='thematic' && category!==(c.category||T("common.other"))){category=c.category||T("common.other");var heading=document.createElement('h2');heading.className='channel-category';heading.textContent=category;fragment.appendChild(heading);}
            var button = channelNodes[c.id];
            if (!button) {
                button = document.createElement('button'); button.dataset.channel = c.id;
                var number=document.createElement('span');number.className='channel-number';button.appendChild(number);
                var image = document.createElement('img'), star = document.createElement('span'), title = document.createElement('span');
                // Logos are shown at about 180 px; twice that keeps them sharp without decoding the 2000 px originals.
                image.alt = ''; image.dataset.imageWidth = '360'; image.dataset.logoBox = '180 88'; image.onerror = function () { image.hidden = true; }; star.className = 'favorite-mark';setIcon(star,'heart'); title.className = 'channel-name';
                button.appendChild(image); button.appendChild(star); button.appendChild(title);
                button.onfocus = function () { if (focusedChannel !== c.id) { focusedChannel = c.id; if (wheelFocusing) queueWheelHero(); else hero(); } if(!pointerFocusing)centerChannel(button); };
                button.onclick = function () { if (channelMode === 'hidden') openChannelMenu(); else begin(c.id); };
                channelNodes[c.id] = button;
            }
            button.querySelector('.channel-number').textContent=i+1;
            button.className = 'channel-card' + (channelMode === 'hidden' ? ' is-hidden' : '');
            var logo = button.querySelector('img'); logo.hidden = !c.logo;
            if (c.logo && logo.dataset.imageSource !== c.logo) setImage(logo,c.logo);
            button.querySelector('.favorite-mark').hidden = prefs.favorites.indexOf(c.id) < 0;
            button.querySelector('.channel-name').textContent = c.title;
            fragment.appendChild(button);
        });
        list.appendChild(fragment);
        if (!items.some(function (c) { return c.id === focusedChannel; })) focusedChannel = items.length ? items[0].id : null;
        hero();Scrolling.update();
    }
    // Shared wheel, row and scrollbar handling for the channel grid, catalogue/episode grid and guide.
    var Scrolling=(function(){
        var idle=250,maxSteps=3,holdTime=4000,lag=60,maxSpeed=4,smooth=false,indicators=[],moving=[],anchor=null;
        // One wheel notch moves one row. The notch is the smallest delta seen (the LG Magic Remote sends 53 per detent and
        // merges fast spins into 106, 159 or 212), kept within 40–120 so trackpad-like streams of tiny deltas accumulate.
        // A merged event moves as many rows as it holds (at most three); the first event after a pause or a reversal always
        // moves one row.
        function steps(state,e,page){
            var delta=e.deltaY*(e.deltaMode===1?40:e.deltaMode===2?page:1),magnitude=Math.abs(delta),direction=delta>0?1:-1,now=Date.now(),fresh,count;
            if(!delta)return 0;
            state.notch=Math.max(40,Math.min(120,state.notch||120,magnitude));
            fresh=direction!==state.direction||now-(state.at||0)>idle;if(fresh){state.direction=direction;state.total=0;}
            state.at=now;state.total+=magnitude;count=Math.floor(state.total/state.notch+1e-6);state.total-=count*state.notch;
            if(fresh){count=1;state.total=0;}
            return direction*Math.min(maxSteps,count);
        }
        // The Magic Remote pointer drifts slightly at rest; after a wheel it must move deliberately before it can take focus.
        // The hold lapses after a few seconds and on any screen, dialog or D-pad change, so it never blocks later pointer use.
        function holdPointer(e){anchor={x:e.clientX,y:e.clientY,at:Date.now()};}
        function releasePointer(){anchor=null;}
        function pointerHeld(e){if(!anchor)return false;if(Date.now()-anchor.at<holdTime&&Math.abs(e.clientX-anchor.x)+Math.abs(e.clientY-anchor.y)<32)return true;anchor=null;return false;}
        // Every list scrolls through to(). Smooth mode chases the destination: each frame closes part of the remaining
        // distance (time constant 60 ms, so it settles in about 200 ms per row) but never faster than 4 px/ms (about 67 px a
        // frame; after a slow frame it catches up at most two frames, so a stall never turns into a leap). A new destination mid-flight just moves the goal, so the motion never restarts, and a fast spin of the
        // Magic Remote (several rows in 150 ms) glides through the rows instead of covering them in one or two frames.
        // On the TV (Chromium 68) a list scroller never gets its own compositor layer, so every scrollTop change repaints the
        // whole screen (16-20 fps measured on the episode grid) while moving the list's content by transform runs at 57-60
        // fps. Lists registered with layered() therefore animate their children by transform and keep scrollTop still;
        // scrollTop jumps to the destination once the motion has stopped, in the same frame the transform returns to zero,
        // so the one slow repaint happens while nothing moves. Positions read through visualTop()/contentTop() include the
        // transform, so focus, alignment and the scrollbar follow what is on screen.
        var layeredLists=[];
        function layered(el){layeredLists.push(el);}
        function target(el){return el.netiosMotion?el.netiosMotion.to:el.scrollTop;}
        function visualTop(el){var m=el.netiosMotion;return m&&m.layered?m.position:el.scrollTop;}
        function contentTop(el,node){return node.getBoundingClientRect().top-el.getBoundingClientRect().top+visualTop(el);}
        function limit(el,top){return Math.max(0,Math.min(el.scrollHeight-el.clientHeight,Math.round(top)));}
        function offsetChildren(el,value){var transform=value?'translate3d(0,'+value+'px,0)':'';for(var child=el.firstElementChild;child;child=child.nextElementSibling)if(child.style.transform!==transform)child.style.transform=transform;}
        function follow(el){indicators.forEach(function(item){if(item.scroller===el)placeThumb(item);});}
        function to(el,top,animate){
            var motion=el.netiosMotion;top=limit(el,top);
            if(!smooth||animate===false){if(motion){cancelAnimationFrame(motion.frame);settle(el);}if(el.scrollTop!==top)el.scrollTop=top;return;}
            if(motion){motion.to=top;return;}
            if(el.scrollTop===top)return;
            motion=el.netiosMotion={to:top,exact:el.scrollTop,position:el.scrollTop,anchor:el.scrollTop,layered:layeredLists.indexOf(el)>=0,last:performance.now(),frame:0};moving.push(el);
            motion.frame=requestAnimationFrame(function step(time){
                var m=el.netiosMotion;if(m!==motion)return;
                var dt=Math.max(1,Math.min(34,time-m.last)),remaining=m.to-m.exact,move=remaining*(1-Math.exp(-dt/lag)),cap=maxSpeed*dt;m.last=time;
                if(Math.abs(remaining)<=0.5||Math.abs(remaining)<=Math.min(Math.abs(move),cap)+0.5)m.exact=m.to;else m.exact+=Math.max(-cap,Math.min(cap,move));
                m.position=Math.round(m.exact);
                if(m.layered){offsetChildren(el,m.anchor-m.position);follow(el);}else el.scrollTop=m.position;
                if(m.exact!==m.to)m.frame=requestAnimationFrame(step);else{if(m.layered)el.scrollTop=m.to;settle(el);}
            });
        }
        function settle(el){var m=el.netiosMotion;el.netiosMotion=null;if(m&&m.layered)offsetChildren(el,0);var index=moving.indexOf(el);if(index>=0)moving.splice(index,1);}
        // Content inserted above the viewport moves the whole motion with it, so prepending never jolts an animation.
        function shift(el,delta){var m=el.netiosMotion;if(m){m.to+=delta;m.exact+=delta;m.position+=delta;m.anchor+=delta;}el.scrollTop+=delta;}
        // Nearest-edge reveal against the destination, not the in-flight position.
        function reveal(el,node,pad){
            var box=el.getBoundingClientRect(),rect=node.getBoundingClientRect(),current=visualTop(el),aim=target(el),top=rect.top-box.top+current,bottom=rect.bottom-box.top+current;pad=pad||0;
            if(top<aim+pad)to(el,top-pad);else if(bottom>aim+el.clientHeight-pad)to(el,bottom-el.clientHeight+pad);
        }
        function setSmooth(value){
            smooth=!!value;document.documentElement.classList.toggle('smooth-scroll',smooth);
            if(!smooth)moving.slice().forEach(function(el){to(el,el.netiosMotion.to,false);});
        }
        // Converts offsetTop (relative to the offsetParent) to the list's scroll coordinates.
        function base(list,node){return node.offsetTop-contentTop(list,node);}
        // Wheel target in a single-column list: the row at the top edge moves by count rows; rows align to the top.
        function snapTop(list,items,count){
            if(!items.length)return target(list);
            var offset=base(list,items[0]),before=target(list),low=0,high=items.length-1;
            while(low<high){var middle=(low+high)>>1;if(items[middle].offsetTop-offset<before-1)low=middle+1;else high=middle;}
            var aligned=Math.abs(items[low].offsetTop-offset-before)<=1,index=aligned||count<0?low+count:low+count-1;
            return limit(list,items[Math.max(0,Math.min(items.length-1,index))].offsetTop-offset);
        }
        // Wheel step in a grid (channels, catalogues, episodes). The list moves exactly one row from where it is heading,
        // aligned to the top with the row's group heading (category, genre, season) in view, and never backwards. Focus moves
        // one row from the selected card, in its column, and stays inside the rows that will be visible: at either end of the
        // list the selection walks row by row instead of jumping to the last row and back.
        function wheelRows(list,rowsList,count,heading,pad,from){
            if(!rowsList.length)return null;
            var offset=base(list,rowsList[0].nodes[0]),before=target(list),height=list.clientHeight,max=Math.max(0,list.scrollHeight-height),direction=count>0?1:-1;
            function aim(row){var head=row.nodes[0].previousElementSibling;return (head&&head.classList.contains(heading)?head.offsetTop:row.top)-offset-pad;}
            var index=direction>0?rowsList.findIndex(function(row){return aim(row)>before+1;}):rowsList.map(function(row){return aim(row)<before-1;}).lastIndexOf(true);
            var row=index<0?null:rowsList[Math.max(0,Math.min(rowsList.length-1,index+count-direction))],top=row?Math.max(0,Math.min(max,aim(row))):direction>0?max:0;
            top=direction>0?Math.max(before,top):Math.min(before,top);
            function visible(i){var r=rowsList[i],t=r.top-offset;return t>=top-1&&t+r.nodes[0].offsetHeight<=top+height+1;}
            var at=from?rowsList.findIndex(function(item){return item.nodes.indexOf(from)>=0;}):-1,column=at<0?0:rowsList[at].nodes.indexOf(from);
            var wanted=at<0?(row?rowsList.indexOf(row):0):Math.max(0,Math.min(rowsList.length-1,at+count));
            if(!visible(wanted)){var first=-1,last=-1;for(var i=0;i<rowsList.length;i++)if(visible(i)){if(first<0)first=i;last=i;}if(first>=0)wanted=wanted<first?first:last;}
            var chosen=rowsList[wanted];return {node:chosen.nodes[Math.min(column,chosen.nodes.length-1)],top:top};
        }
        function rows(nodes){
            var result=[];nodes.forEach(function(node){var top=node.offsetTop,row=result[result.length-1];if(!row||row.top!==top){row={top:top,nodes:[]};result.push(row);}row.nodes.push(node);});
            return result;
        }
        // Keeps the column across rows of different lengths, including rows split by group headings.
        function moveRows(list,node,count){
            var index=list.findIndex(function(row){return row.nodes.indexOf(node)>=0;});if(index<0)return list.length?list[0].nodes[0]:null;
            var row=list[Math.max(0,Math.min(list.length-1,index+count))];return row.nodes[Math.min(list[index].nodes.indexOf(node),row.nodes.length-1)];
        }
        function indicator(scroller){
            var track=document.createElement('div'),thumb=document.createElement('div'),item={scroller:scroller,track:track,thumb:thumb,key:'',geometry:null,offset:-1};
            track.className='scroll-track';track.setAttribute('data-for',scroller.id);thumb.className='scroll-thumb';track.hidden=true;track.setAttribute('aria-hidden','true');track.appendChild(thumb);
            scroller.addEventListener('scroll',function(){schedule(false);},{passive:true});indicators.push(item);return item;
        }
        // Scrolling only moves the thumb (one scrollTop read, one transform write); geometry is measured after content changes.
        function placeThumb(item){
            var g=item.geometry;if(!g)return;var offset=Math.round(Math.max(0,Math.min(1,visualTop(item.scroller)/g.extent))*(g.height-g.size));
            if(offset!==item.offset){item.offset=offset;item.thumb.style.transform='translateY('+offset+'px)';}
        }
        function draw(item){
            var s=item.scroller,host=s.offsetParent,height=s.clientHeight,extent=s.scrollHeight-height;
            if(!host||height<=0||extent<=1){if(!item.track.hidden)item.track.hidden=true;item.key='';item.geometry=null;return;}
            var box=s.getBoundingClientRect();
            // The track sits in the page margin, so climb past ancestors that would clip it there.
            while(host.offsetParent&&getComputedStyle(host).overflow!=='visible'&&box.right+18>host.getBoundingClientRect().right)host=host.offsetParent;
            if(item.track.parentNode!==host)host.appendChild(item.track);
            var origin=host.getBoundingClientRect(),size=Math.max(40,Math.round(height*height/s.scrollHeight));
            item.geometry={height:height,size:size,extent:extent};
            var key=[box.top-origin.top,box.right-origin.left,height,size].join();
            if(key!==item.key){item.key=key;item.track.style.top=(box.top-origin.top+s.clientTop)+'px';item.track.style.left=(box.right-origin.left+14)+'px';item.track.style.height=height+'px';item.thumb.style.height=size+'px';item.track.hidden=false;}
            placeThumb(item);
        }
        var frame=0,full=false;
        function schedule(measure){if(measure)full=true;if(!frame)frame=requestAnimationFrame(function(){frame=0;var all=full;full=false;indicators.forEach(function(item){if(all||!item.geometry)draw(item);else placeThumb(item);});});}
        return {moving:function(el){return !!el.netiosMotion;},layered:layered,visualTop:visualTop,contentTop:contentTop,steps:steps,holdPointer:holdPointer,releasePointer:releasePointer,pointerHeld:pointerHeld,target:target,to:to,shift:shift,reveal:reveal,setSmooth:setSmooth,snapTop:snapTop,wheelRows:wheelRows,rows:rows,moveRows:moveRows,indicator:indicator,update:function(){schedule(true);}};
    }());
    Scrolling.indicator($('channel-scroll'));Scrolling.indicator($('library-results'));Scrolling.indicator($('guide-results'));Scrolling.layered($('channel-scroll'));Scrolling.layered($('library-results'));Scrolling.layered($('guide-results'));
    // Options > Smooth scrolling: animates every list (channels, guide, catalogues, seasons, episodes); stored on this TV.
    var smoothScroll=false;try{smoothScroll=localStorage.getItem('netios-smooth-scroll')==='true';}catch(error){}
    function smoothState(){Scrolling.setSmooth(smoothScroll);$('smooth-toggle').setAttribute('aria-pressed',String(smoothScroll));setIcon($('smooth-toggle'),'swap-vertical',T('options.smooth')+' · '+T(smoothScroll?'options.on':'options.off'));}
    // Options > Performance panel: FPS counted from rendered frames, TV CPU/RAM from the service, the app's own memory.
    // It costs one frame callback and one service call per second, and nothing while it is off.
    var perf={on:false,frames:0,since:0,frame:0,timer:0};try{perf.on=localStorage.getItem('netios-perf-overlay')==='true';}catch(error){}
    function perfFrame(){perf.frames++;perf.frame=requestAnimationFrame(perfFrame);}
    function perfSample(){
        var now=performance.now(),fps=Math.round(perf.frames*1000/(now-perf.since));perf.frames=0;perf.since=now;
        rpc('performance').catch(function(){return null;}).then(function(data){
            if(!perf.on)return;var na=T('perf.na'),memory=data&&data.memory,heap=window.performance&&performance.memory&&performance.memory.usedJSHeapSize,used=memory&&memory.total-memory.available;
            function mb(value){return value?T('diagnostics.megabytes',{value:Math.round(value/1048576)}):na;}
            $('perf-overlay').textContent=T('perf.value',{fps:fps,cpu:data&&Number.isFinite(data.cpu)?data.cpu+'%':na,ram:memory?T('perf.ram',{used:Math.round(used/1048576),total:Math.round(memory.total/1048576),percent:Math.round(used*100/memory.total)}):na,app:T('perf.app',{js:mb(heap),service:mb(data&&data.serviceRss)})});
        });
    }
    function perfState(){
        $('perf-toggle').setAttribute('aria-pressed',String(perf.on));setIcon($('perf-toggle'),'speedometer',T('options.perf')+' · '+T(perf.on?'options.on':'options.off'));$('perf-overlay').hidden=!perf.on;
        cancelAnimationFrame(perf.frame);clearInterval(perf.timer);perf.frame=perf.timer=0;
        if(perf.on){perf.frames=0;perf.since=performance.now();$('perf-overlay').textContent=T('perf.value',{fps:'…',cpu:'…',ram:'…',app:'…'});perf.frame=requestAnimationFrame(perfFrame);perf.timer=setInterval(perfSample,1000);rpc('performance').catch(function(){});}
    }
    perfState();$('perf-toggle').onclick=function(){perf.on=!perf.on;perfState();try{localStorage.setItem('netios-perf-overlay',String(perf.on));}catch(error){notice(new Error('PREFERENCES_SAVE'));}};
    // Options > Auto-play episodes (also in the player's settings for series and shows): 10 s countdown, then the next one.
    var autoNext=false,playlist=null,nextUp={cancelled:false,fired:-1};try{autoNext=localStorage.getItem('netios-auto-next')==='true';}catch(error){}
    function autoNextState(){$('autonext-toggle').setAttribute('aria-pressed',String(autoNext));setIcon($('autonext-toggle'),'playlist-play',T('options.autonext')+' · '+T(autoNext?'options.on':'options.off'));}
    function setAutoNext(value){autoNext=value;autoNextState();if(!autoNext)hideNextUp();try{localStorage.setItem('netios-auto-next',String(autoNext));}catch(error){notice(new Error('PREFERENCES_SAVE'));}}
    autoNextState();$('autonext-toggle').onclick=function(){setAutoNext(!autoNext);};
    smoothState();$('smooth-toggle').onclick=function(){smoothScroll=!smoothScroll;smoothState();try{localStorage.setItem('netios-smooth-scroll',String(smoothScroll));}catch(error){notice(new Error('PREFERENCES_SAVE'));}};
    function focusControl(target,direction) { var top=Scrolling.target($('library-results'));target.focus({preventScroll: true});if(target.classList.contains('library-card'))alignLibrary(target,direction,top); }
    function centerChannel(target, immediate) {
        var scroller = $('channel-scroll');
        Scrolling.to(scroller, Scrolling.contentTop(scroller, target) + (target.offsetHeight - scroller.clientHeight) / 2, !immediate);
    }
    function focusChannel() {
        var target = channelCards().find( function (b) { return b.dataset.channel === selectedChannel; }) || channelCards()[0];
        if (target) { focusControl(target); centerChannel(target, true); }
    }
    // mode 'refresh' (Options > Refresh) always asks Netia; otherwise the saved list shows at once and Netia's answer follows.
    function channels(mode) {
        var refresh=mode==='refresh';
        libraryCache=Object.create(null);libraryScope=null;artworkQueue=[];libraryGeneration++;
        loginStage(T("text.pobieranie_kanalow_i_sprawdzanie_uprawnien_pakietu"));
        return rpc('status').then(function (status) {
            loadPreferences(status);var scope=preferenceKey,key='channels:'+scope;
            if(refresh)['series','shows'].forEach(function(kind){NetiosData.remove('library:'+scope+':'+kind);});
            return (refresh||!scope?Promise.resolve(null):NetiosData.get(key)).then(function(saved){
                var cached=TVModel.savedList(saved,Infinity,Date.now());
                var fresh=rpc('channels').then(function(items){if(scope)NetiosData.set(key,{items:items});return items;});
                if(!cached)return fresh.then(function(items){channelItems=items;return rpc('status');}).then(function(current){return showChannels(current);});
                // Configuration renames mutate channelItems, so compare Netia's answer with the list as it was saved.
                var cachedText=JSON.stringify(cached);fresh.catch(function(){});channelItems=cached;
                return showChannels(status).then(function(){
                    fresh.then(function(items){
                        if(scope!==preferenceKey||JSON.stringify(items)===cachedText)return;
                        var focused=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.channel;
                        channelItems=items;return loadUserConfig(false).then(function(){
                            // A background update keeps the list where the viewer left it: rebuilding the grid would reset the
                            // scroll position, and restoring focus must not recentre the card.
                            if(scope!==preferenceKey)return;var scroller=$('channel-scroll'),keep=Scrolling.target(scroller);renderChannels();Scrolling.to(scroller,keep,false);
                            if(focused&&channelNodes[focused]&&channelNodes[focused].isConnected&&screen==='channels'&&!modal){pointerFocusing=true;try{focusControl(channelNodes[focused]);}finally{pointerFocusing=false;}}
                        });
                    }).catch(function(error){if(scope===preferenceKey)notice(error);});
                });
            });
        });
    }
    function showChannels(status){
        channelMode='all';prefs.sort=prefs.channelSort.all;return loadUserConfig(false).then(function(){show('channels');renderChannels();focusChannel();
        $('count').title = status.catalogueTotal + T("text.pozycji_w_pelnym_katalogu_serwisu");
        refreshPrograms(); syncClock();
        if (saveAfterLogin) { saveAfterLogin = false; saveReturn = 'channels'; show('save'); }
        });
    }
    function refreshPrograms() {
        var current = generation;
        return rpc('programs').then(function (items) {
            if (current !== generation) return;
            nowPrograms = {}; items.forEach(function (item) { nowPrograms[item.channelId] = item; }); hero();
        }).catch(function () { if (screen === 'channels') $('hero-meta').textContent = T("text.program_tv_jest_chwilowo_niedostepny"); });
    }
    function markChannel() {
        var selected=channelNodes[focusedChannel];
        $('channel-list').querySelectorAll('.is-selected').forEach(function(node){if(node!==selected)node.classList.remove('is-selected');});
        if(selected&&!selected.classList.contains('is-selected'))selected.classList.add('is-selected');
    }
    var channelHeroFrame=0;
    function queueChannelHero(){if(!channelHeroFrame)channelHeroFrame=requestAnimationFrame(function(){channelHeroFrame=0;if(screen==='channels'&&!modal)hero();});}
    function hero() {
        markChannel();
        var c = channel(focusedChannel), p = c && nowPrograms[c.id];
        $('hero-channel').textContent = c ? c.title : T("text.kanaly_tv"); $('hero-title').textContent = p ? p.title : c ? c.title : T("text.wybierz_kanal");
        $('hero-description').textContent = p ? p.description : c ? T("text.aktualne_informacje_o_programie_pojawia_sie_po_pobraniu") : T("text.zmien_filtr_lub_przywroc_ukryte_kanaly_w_opcjach");
        var meta = $('hero-meta'); meta.textContent = '';
        if (p) {
            var onAir = document.createElement('span'); onAir.className = 'on-air'; onAir.textContent = T("text.trwa"); meta.appendChild(onAir);
            meta.appendChild(document.createTextNode(time(p.start) + ' – ' + time(p.end) + T("text.pozostalo") + Math.max(0, Math.ceil((p.end - (netiaNow() || Date.now())) / 60000)) + T("text.min")));
            var bar = document.createElement('span'), fill = document.createElement('span'); bar.className = 'program-progress'; fill.style.width = Math.max(0, Math.min(100, ((netiaNow() || Date.now()) - p.start) / (p.end - p.start) * 100)) + '%'; bar.appendChild(fill); meta.appendChild(bar);
        }
        $('watch-button').disabled = !c || channelMode === 'hidden';$('favorite-shortcut').hidden=!c;
        $('favorite-shortcut-label').textContent = c && prefs.favorites.indexOf(c.id) >= 0 ? T("channels.favoriteRemove") : T("channels.favoriteAdd");
    }
    function togglePreference(key) {
        if (!focusedChannel) return; var index = prefs[key].indexOf(focusedChannel);
        if (index < 0) prefs[key].push(focusedChannel); else prefs[key].splice(index, 1);
        savePreferences(); renderChannels();
    }
    function openModal(id) {
        returnFocus = document.activeElement; modal = id; $('modal-backdrop').hidden = false;Scrolling.releasePointer();
        $('channel-menu').hidden = id !== 'channel-menu'; $('player-settings').hidden = id !== 'player-settings'; $('diagnostics-dialog').hidden = id !== 'diagnostics-dialog';
        // Focus the first option, not the header's close button; dialogs without options focus their close button.
        var first = $(id).querySelector(':scope>button:not([disabled]):not([hidden])') || $(id).querySelector('button:not([disabled])'); if (first) first.focus(); reveal();
    }
    function closeModal(restore) {
        if(modal==='diagnostics-dialog'&&restore!==false){openChannelMenu();focusControl($('menu-diagnostics'));return;}
        if (!modal) return; modal = null; $('modal-backdrop').hidden = true; $('channel-menu').hidden = true; $('player-settings').hidden = true; $('diagnostics-dialog').hidden=true;
        if (restore !== false) { if (returnFocus && returnFocus.isConnected && returnFocus.offsetWidth) focusControl(returnFocus); else if (screen === 'channels') focusChannel(); }
        reveal();
    }
    var playbackSample=null,playbackBytes=null,playbackAt=0,diagnosticsRevision=0;
    function samplePlayback(){
        if(!player||typeof player.getStats!=='function')return;
        var now=performance.now();if(now-playbackAt<1000)return;
        try{var stats=player.getStats(),video=$('video'),buffer=0;
            for(var i=0;i<video.buffered.length;i++)if(video.buffered.start(i)<=video.currentTime&&video.buffered.end(i)>=video.currentTime)buffer=video.buffered.end(i)-video.currentTime;
            var bytes=Number.isFinite(stats.bytesDownloaded)&&stats.bytesDownloaded>=0?stats.bytesDownloaded:null;
            playbackSample={speed:stats.estimatedBandwidth,stream:stats.streamBandwidth,bytes:bytes,width:video.videoWidth||stats.width,height:video.videoHeight||stats.height,buffer:buffer,time:netiaNow(),traffic:bytes!==null&&playbackBytes!==null&&bytes>=playbackBytes?(bytes-playbackBytes)*8000/(now-playbackAt):null};
            playbackBytes=bytes;playbackAt=now;
        }catch(error){}
    }
    function diagnosticTime(epoch){return epoch===null?T('diagnostics.noClock'):formats.clock.format(new Date(epoch));}
    function renderDiagnostics(){
        var root=$('diagnostics-data'),sample=playbackSample;
        function row(key,value,id){var title=document.createElement('dt'),body=document.createElement('dd');title.textContent=T(key);body.textContent=value;if(id)body.id=id;root.appendChild(title);root.appendChild(body);}
        function rate(value){return Number.isFinite(value)&&value>=0?T('diagnostics.mbps',{value:(value/1000000).toFixed(2)}):T('diagnostics.noSample');}
        root.textContent='';row('diagnostics.channels',String(channelItems.length),'diagnostics-channels');row('diagnostics.clock',diagnosticTime(netiaNow()),'diagnostics-clock');row('diagnostics.version',T('diagnostics.versionValue',{version:APP_VERSION,webOS:T('diagnostics.notAvailable')}),'diagnostics-version');
        row('diagnostics.speed',rate(sample&&sample.speed));row('diagnostics.stream',rate(sample&&sample.stream));
        row('diagnostics.bytes',sample&&sample.bytes!==null?T('diagnostics.megabytes',{value:(sample.bytes/1048576).toFixed(2)}):T('diagnostics.noSample'));
        row('diagnostics.resolution',sample?T('diagnostics.bufferValue',{width:sample.width||0,height:sample.height||0,seconds:sample.buffer.toFixed(1)}):T('diagnostics.noSample'));row('diagnostics.sample',sample?diagnosticTime(sample.time):T('diagnostics.noSample'));
        row('diagnostics.memory',T('diagnostics.measuring'),'diagnostics-memory');row('diagnostics.storage',T('diagnostics.measuring'),'diagnostics-storage');
        // Messages that already quote their code are shown once, without repeating it.
        var lastError=lastRegisteredError;row('diagnostics.lastError',lastError?T(lastError.message.indexOf(lastError.code)>=0?'diagnostics.timeValue':'diagnostics.errorCode',{time:diagnosticTime(lastError.time),code:lastError.code,message:lastError.message}):T('diagnostics.noError'));
    }
    // RAM: the app's JS heap (Chromium reports only that) and the service process; space: image cache, saved lists, service files, preferences.
    function measureResources(revision){
        function megabytes(value){return T('diagnostics.megabytes',{value:(value/1048576).toFixed(1)});}
        var heap=window.performance&&performance.memory&&performance.memory.usedJSHeapSize,preferences=0;
        try{for(var i=0;i<localStorage.length;i++){var name=localStorage.key(i);preferences+=(name.length+String(localStorage.getItem(name)).length)*2;}}catch(error){}
        Promise.all([rpc('resources').catch(function(){return null;}),NetiosImages.usage(),NetiosData.usage()]).then(function(results){
            if(revision!==diagnosticsRevision||modal!=='diagnostics-dialog')return;
            var service=results[0],images=results[1],data=results[2],own=(service?service.storage:0)+preferences;
            $('diagnostics-memory').textContent=T('diagnostics.memoryValue',{app:heap?megabytes(heap):T('diagnostics.notAvailable'),service:service?megabytes(service.rss):T('diagnostics.notAvailable')});
            $('diagnostics-storage').textContent=T('diagnostics.storageValue',{total:megabytes(images.bytes+data+own),images:megabytes(images.bytes),files:images.files,data:megabytes(data),own:megabytes(own)});
        });
    }
    function openDiagnostics(){
        samplePlayback();var revision=++diagnosticsRevision;renderDiagnostics();openModal('diagnostics-dialog');measureResources(revision);
        if(window.webOS&&typeof window.webOS.deviceInfo==='function')window.webOS.deviceInfo(function(info){if(revision===diagnosticsRevision&&modal==='diagnostics-dialog')$('diagnostics-version').textContent=T('diagnostics.versionValue',{version:APP_VERSION,webOS:info&&info.sdkVersion||T('diagnostics.notAvailable')});});
    }
    $('menu-diagnostics').onclick=openDiagnostics;$('close-options').onclick=function(){closeModal();};$('close-diagnostics').onclick=function(){closeModal();};
    setInterval(function(){if(modal==='diagnostics-dialog')$('diagnostics-clock').textContent=diagnosticTime(netiaNow());},1000);
    function openChannelMenu() {
        var globalOnly=screen==='profiles',c = globalOnly?null:channel(focusedChannel); $('channel-menu-title').textContent = c ? c.title : T("text.opcje_2");
        ['menu-favorite','menu-hide','menu-restore','refresh-button'].forEach(function(id){$(id).hidden=globalOnly;});
        $('menu-favorite').disabled = $('menu-hide').disabled = !c;
        $('menu-favorite').removeAttribute('data-current-icon');setIcon($('menu-favorite'),'heart',c && prefs.favorites.indexOf(c.id)>=0?T('channels.favoriteRemove'):T('channels.favoriteAdd'));
        $('menu-hide').removeAttribute('data-current-icon');setIcon($('menu-hide'),'ghost',c && prefs.hidden.indexOf(c.id)>=0?T('text.pokaz_kanal'):T('text.ukryj_kanal'));openModal('channel-menu');
    }
    function stop() {
        samplePlayback();
        generation++; playerDay = ''; playerPrograms = []; clearTimeout(hideTimer); closeModal(false);
        var old = player; player = null;
        return Promise.resolve(old && old.destroy()).catch(function () {}).then(function () { $('video').pause(); $('video').removeAttribute('src'); $('video').load(); return rpc('stop').catch(function () {}); });
    }
    function backToChannels() { var destination=playerReturn;return stop().then(function () { selectedVod=null;show(destination);if(destination==='library'){fitLibraryBackdrop();observeLibraryImages();var saved=libraryCache[libraryKey()],target=saved&&saved.nodes[saved.focus];if(!target||target.hidden)target=$('library-grid').querySelector('.library-card:not([hidden])');if(target)focusControl(target);if(saved)scrollLibrary(saved.scroll,false);if(libraryNext!==null)loadLibrary(true);}else{focusChannel();refreshPrograms();} }); }
    function clearChannelNumber(){clearTimeout(numberTimer);channelDigits='';$('channel-number-entry').hidden=true;}
    function tuneChannel(id){
        var target=channelNodes[id];
        if(screen==='channels'&&target){focusControl(target);centerChannel(target,true);if(channelMode==='hidden'){openChannelMenu();return;}}
        if(busy){pendingTune=id;return;}begin(id);
    }
    function commitChannelNumber(){
        var number=Number(channelDigits),items=TVModel.channels(channelItems,prefs,channelMode);clearChannelNumber();
        if(number<1||number>items.length){notice(new Error('CHANNEL_NUMBER'));return;}tuneChannel(items[number-1].id);
    }
    function remoteChannelKey(e){
        if((screen!=='channels'&&screen!=='player')||selectedVod||modal||!$('guide').hidden||/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))return false;
        var direction=e.keyCode===427||e.key==='ChannelUp'?1:e.keyCode===428||e.key==='ChannelDown'?-1:0;
        if(direction){
            e.preventDefault();clearChannelNumber();var items=TVModel.channels(channelItems,prefs,channelMode),id=pendingTune||(screen==='player'?selectedChannel:focusedChannel),index=items.findIndex(function(c){return c.id===id;});
            if(items.length)tuneChannel(items[(Math.max(0,index)+direction+items.length)%items.length].id);return true;
        }
        var digit=/^[0-9]$/.test(e.key||'')?e.key:e.keyCode>=48&&e.keyCode<=57?String(e.keyCode-48):e.keyCode>=96&&e.keyCode<=105?String(e.keyCode-96):null;
        if(digit!==null){e.preventDefault();if(e.repeat)return true;channelDigits=(channelDigits.length>=4?'':channelDigits)+digit;$('channel-number-entry').textContent=channelDigits;$('channel-number-entry').hidden=false;clearTimeout(numberTimer);numberTimer=setTimeout(commitChannelNumber,1500);return true;}
        if(channelDigits&&e.keyCode===13){e.preventDefault();commitChannelNumber();return true;}return false;
    }
    function begin(id, start, end) { playerReturn='channels';playlist=null;return run(function () { selectedChannel = id; focusedChannel = id; return play(id, start, undefined, end); }); }
    function chooseQuality(mode) {
        if (!player) return; qualityMode = mode; player.configure({abr: {enabled: mode === 'auto'}});
        if (mode !== 'auto') {
            var tracks = player.getVariantTracks(), active = tracks.find(function (t) { return t.active; });
            tracks = tracks.filter(function (t) { return !active || t.language === active.language && (active.audioId === undefined || t.audioId === active.audioId); });
            var best = highestQuality(mode === 'highest' ? tracks : tracks.filter(function (t) { return t.height === mode; }));
            if (best && (!active || active.id !== best.id)) player.selectVariantTrack(best, true);
        }
    }
    function startVideo(current, retry){
        if(current!==generation)return Promise.resolve();
        return $('video').play().catch(function(error){
            if(error.name!=='AbortError'||retry===false)throw error;
            // webOS can reset MediaSource during the initial quality switch.
            return new Promise(function(resolve){setTimeout(resolve,500);}).then(function(){return startVideo(current,false);});
        });
    }
    function play(id, start, vod, end) {
        var current;
        return stop().then(function () {
            current = generation; selectedVod=vod||null;hideNextUp();nextUp.cancelled=false;show('player');$('player-guide').hidden=$('live-button').hidden=$('live-badge').parentNode.hidden=!!vod; $('player-title').textContent = (vod||channel(id)).title; $('player-channel').textContent = ''; $('player-message').textContent = T("text.laczenie");
            $('player-controls').classList.toggle('vod',!!vod);$('vod-time').hidden=!vod;$('vod-time').textContent=T('player.vodTime',{position:TVModel.playbackTime(0),duration:T('player.unknownTime')});
            if (!navigator.requestMediaKeySystemAccess) throw new Error('WIDEVINE_REQUIRED');
            return navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{initDataTypes: ['cenc'], videoCapabilities: [{contentType: 'video/mp4; codecs="avc1.42E01E"'}]}]).catch(function () { throw new Error('WIDEVINE_REQUIRED'); });
        }).then(function () { if (current !== generation) throw new Error('STALE_REQUEST'); return rpc('play', {id: id, kind:vod?'vod':'tv',widevine: true, userAgent: navigator.userAgent}); }).then(function (data) {
            if (current !== generation) throw new Error('STALE_REQUEST');
            shaka.polyfill.installAll(); if (!shaka.Player.isBrowserSupported()) throw new Error('UNSUPPORTED_STREAM'); licenseError = '';
            player = new shaka.Player($('video'));
            player.getNetworkingEngine().registerRequestFilter(function (type, request) { request.uris = request.uris.map(function (uri) { return uri.replace(/^http:\/\//, 'https://'); }); });
            shaka.net.NetworkingEngine.registerScheme('netia-license', function (uri, request) {
                var bytes = new Uint8Array(request.body), text = ''; for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]); var aborted = false;
                var result = rpc('license', {challenge: btoa(text)}).catch(function (error) { licenseError = /^[A-Z_0-9-]+$/.test(error.message) ? error.message : 'LICENSE_ERROR'; throw error; }).then(function (encoded) {
                    if (aborted || current !== generation) throw new Error('STALE_REQUEST');
                    var binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), answer = new Uint8Array(binary.length);
                    for (var j = 0; j < binary.length; j++) answer[j] = binary.charCodeAt(j);
                    return {uri: uri, originalUri: uri, data: answer.buffer, headers: {}};
                }); return new shaka.util.AbortableOperation(result, function () { aborted = true; return Promise.resolve(); });
            });
            var playbackConfig={streaming: {bufferingGoal: 20, rebufferingGoal: 2}, abr: {enabled: false}};
            if(data.drm==='widevine')playbackConfig.drm={servers: {'com.widevine.alpha': 'netia-license://widevine'}};
            player.configure(playbackConfig);
            player.addEventListener('error', function (event) { if (current === generation) { $('player-message').textContent='';notice(new Error('PLAYER_'+event.detail.code+(licenseError?'_'+licenseError:'')));reveal(); } });
            return player.load(data.url,undefined,data.mimeType||'application/dash+xml').then(function () {
                if (current !== generation) return; if(start !== undefined && !seekProgramme(start, end))throw new Error('BUFFER_UNAVAILABLE'); chooseQuality('highest'); $('player-message').textContent = ''; playerDay = ''; tick(); reveal(); return startVideo(current);
            });
        }).catch(function (error) { if (current !== generation) return; return backToChannels().then(function () { throw typeof error.code==='number'?new Error('PLAYER_'+error.code+(licenseError?'_'+licenseError:'')):error; }); });
    }
    function reveal() {
        clearTimeout(hideTimer); $('player-controls').classList.remove('controls-hidden');
        if (screen === 'player') hideTimer = setTimeout(function () { if (!modal && $('guide').hidden && !$('video').paused && !$('player-message').textContent && $('next-up').hidden) $('player-controls').classList.add('controls-hidden'); }, 5000);
    }
    function seek(delta, live) {
        if (!player) return; var range = player.seekRange(), target = TVModel.seek(live ? range.end : $('video').currentTime + delta, range);
        if (target !== null && range.end - range.start > 1) $('video').currentTime = target; reveal();
    }
    // Episodes: neighbours in the series/show list the episode was started from. Live: programme starts inside the buffer.
    function neighbour(direction){return selectedVod&&playlist?TVModel.adjacentEpisode(playlist,selectedVod.id,direction):null;}
    function episodeCaption(item){return TVModel.episodeTitle(item.title,$('library-title').textContent,libraryDetails&&libraryDetails.items?libraryDetails.items.length:libraryItems.length);}
    function playEpisode(item){
        var saved=libraryCache[libraryKey()],index=saved?saved.items.indexOf(item):-1;if(index>=0)saved.focus=index;
        return run(function(){return play(item.id,undefined,Object.assign({},item,{title:episodeCaption(item)}));});
    }
    function skip(direction){
        if(selectedVod){var item=neighbour(direction);if(item)playEpisode(item);return;}
        if(!player)return;var date=typeof player.getPlayheadTimeAsDate==='function'?player.getPlayheadTimeAsDate():null;
        var value=TVModel.segmentPosition(playerPrograms,bufferWindow(),date?date.getTime():NaN,direction);if(value!==null)$('video').currentTime=value;reveal();
    }
    function hideNextUp(){var card=$('next-up');if(card.hidden)return;card.hidden=true;if(card.contains(document.activeElement))$('pause-button').focus();}
    function updateNextUp(video){
        var next=autoNext?neighbour(1):null,remaining=video.duration-video.currentTime;
        if(Number.isFinite(remaining)&&remaining>15)nextUp.cancelled=false;
        if(!next||nextUp.cancelled||!Number.isFinite(remaining)||video.duration<30||remaining>10){hideNextUp();return;}
        if(remaining<=0.5){if(nextUp.fired!==generation){nextUp.fired=generation;playEpisode(next);}return;}
        var card=$('next-up');$('next-up-count').textContent=T('player.nextIn',{seconds:Math.ceil(remaining)});
        if(card.hidden){
            var image=$('next-up-image'),src=next.image||libraryDetails&&libraryDetails.image;image.hidden=!src;if(src)setImage(image,src);
            $('next-up-title').textContent=episodeCaption(next);card.hidden=false;reveal();focusControl($('next-up-play'));
        }
    }
    $('video').addEventListener('ended',function(){if(screen==='player'&&selectedVod&&autoNext&&!nextUp.cancelled&&nextUp.fired!==generation){var next=neighbour(1);if(next){nextUp.fired=generation;playEpisode(next);}}});
    $('next-up-play').onclick=function(){var next=neighbour(1);if(next){nextUp.fired=generation;playEpisode(next);}};
    // Cancel (and Back while the card is up) ends watching: back to the episode list.
    $('next-up-cancel').onclick=function(){nextUp.cancelled=true;backToChannels().catch(notice);};
    function pause() { if (!player) return; if ($('video').paused) $('video').play().catch(notice); else $('video').pause(); reveal(); }
    function bufferWindow() {
        if(selectedVod || !player || typeof player.getPlayheadTimeAsDate !== 'function')return null;
        var date=player.getPlayheadTimeAsDate();
        return date ? TVModel.buffer(player.seekRange(),date.getTime(),$('video').currentTime) : null;
    }
    function seekProgramme(start, end) { var value=TVModel.programmePosition(start,bufferWindow(),end);if(value===null)return false;$('video').currentTime=value;reveal();return true; }
    function timelineTooltip(value, fraction) {
        var window=bufferWindow(),tip=$('timeline-tooltip');if(selectedVod){tip.textContent=TVModel.playbackTime(value)||T('player.unknownTime');tip.style.left=Math.max(0,Math.min(100,fraction*100))+'%';tip.hidden=false;return;}if(!window){tip.hidden=true;return;}
        tip.textContent=time(window.origin+value*1000);tip.style.left=Math.max(0,Math.min(100,fraction*100))+'%';tip.hidden=false;
    }
    function renderTimeline() {
        var parts=TVModel.segments(playerPrograms,bufferWindow()),root=$('timeline-segments');
        while(root.children.length>parts.length)root.removeChild(root.lastChild);
        parts.forEach(function(p,i){var mark=root.children[i];if(!mark){mark=document.createElement('span');root.appendChild(mark)}mark.style.left=p.left+'%';mark.style.width=p.width+'%';mark.title=time(p.start)+' · '+p.title;});
    }
    function tick() {
        // List contents change without scrolling (rendering, paging, images); keep the scrollbars in step.
        Scrolling.update();samplePlayback();
        updateGuideProgress();
        if (!player || screen !== 'player') return;
        var video = $('video'), range = player.seekRange(), valid = Number.isFinite(range.start) && Number.isFinite(range.end) && range.end - range.start > 1;
        var behind = valid ? Math.max(0, range.end - video.currentTime) : 0, position = (netiaNow() || Date.now()) - behind * 1000;
        $('timeline').disabled = !valid; $('rewind-button').disabled = $('forward-button').disabled = !valid;
        $('previous-button').disabled=selectedVod?!neighbour(-1):!valid;$('next-button').disabled=selectedVod?!neighbour(1):!valid;
        if (valid) { $('timeline').min = range.start; $('timeline').max = range.end; if(!$('timeline').matches(':active'))$('timeline').value = video.currentTime; }
        if(!$('player-controls').classList.contains('controls-hidden'))renderTimeline();
        $('netia-clock').textContent = netiaNow() === null ? '--:--:--' : formats.clock.format(new Date(netiaNow())); setIcon($('live-badge'), behind < 15 ? 'record' : 'broadcast', T("text.na_zywo")); $('live-badge').classList.toggle('behind', behind >= 15);
        setIcon($('pause-button'), video.paused ? 'play' : 'pause'); $('pause-button').setAttribute('aria-label', video.paused ? T("text.odtwarzaj") : T("text.pauza"));
        if(selectedVod){updateNextUp(video);$('vod-time').textContent=T('player.vodTime',{position:TVModel.playbackTime(video.currentTime)||T('player.unknownTime'),duration:TVModel.playbackTime(video.duration)||T('player.unknownTime')});$('player-title').textContent=selectedVod.title;$('player-channel').textContent='';return;}
        var p = TVModel.at(playerPrograms, position) || nowPrograms[selectedChannel], c = channel(selectedChannel);
        $('player-title').textContent = p ? p.title : c ? c.title : ''; $('player-channel').textContent = c ? c.title + (p ? ' · ' + time(p.start) + ' – ' + time(p.end) : '') : '';
        var date = day(position);
        if (playerDay !== date) {
            playerDay = date; var current = generation;
            rpc('programs', {id: selectedChannel, date: date}).then(function (items) { if (current === generation && playerDay === date) playerPrograms = items; }).catch(function () {});
        }
    }
    function option(list, label, action, selected) {
        var button = document.createElement('button'); button.textContent = label; button.setAttribute('aria-pressed', String(!!selected)); button.onclick = action; $(list).appendChild(button); return button;
    }
    function settings() {
        if (!player) return;
        var focused = document.activeElement, focusLabel = focused.textContent, focusList = focused.parentElement && focused.parentElement.id;
        ['quality-list', 'audio-list', 'subtitle-list', 'subtitle-sizes', 'autonext-list'].forEach(function (id) { $(id).textContent = ''; });
        option('quality-list', T("text.najwyzsza"), function () { chooseQuality('highest'); settings(); }, qualityMode === 'highest');
        option('quality-list', T("text.auto"), function () { chooseQuality('auto'); settings(); }, qualityMode === 'auto');
        var tracks = player.getVariantTracks(), heights = tracks.map(function (t) { return t.height; }).filter(function (h, i, all) { return h && all.indexOf(h) === i; }).sort(function (a, b) { return b - a; });
        heights.forEach(function (height) { option('quality-list', height + 'p', function () { chooseQuality(height); settings(); }, qualityMode === height); });
        var audioTracks=[],audioKeys=[];
        player.getAudioTracks().forEach(function(audio){
            var key=JSON.stringify([audio.language,audio.label||'',audio.roles||[],audio.accessibilityPurpose||'']),index=audioKeys.indexOf(key);
            if(index<0){audioKeys.push(key);audioTracks.push(audio);}else if(audio.active)audioTracks[index]=audio;
        });
        var selectedAudio=audioTracks.find(function(audio){return audio.active;});
        audioTracks.forEach(function(audio){
            var label=(audio.label||'').replace(/\b(?:main|alternate)\b/gi,'').replace(/^[\s·–—-]+|[\s·–—-]+$/g,'');
            if(!label)label=audio.language==='pl'?T('audio.polish'):audio.language||T('text.domyslna');
            if(!/audiodeskrypcj/i.test(label)&&((audio.roles||[]).indexOf('description')>=0||audio.accessibilityPurpose==='visually impaired'))label+=' · '+T('audio.description');
            option('audio-list',label,function(){var current=generation;player.selectAudioTrack(audio);setTimeout(function(){if(current!==generation||!player)return;chooseQuality(qualityMode);if(modal==='player-settings')settings();},150);},audio===selectedAudio);
        });
        option('subtitle-list', T("text.wylaczone"), function () { player.setTextTrackVisibility(false); settings(); }, !player.isTextTrackVisible());
        var texts = player.getTextTracks();
        texts.forEach(function (track) { option('subtitle-list', track.label || track.language || T("text.napisy"), function () { player.selectTextTrack(track); player.setTextTrackVisibility(true); settings(); }, track.active && player.isTextTrackVisible()); });
        if (!texts.length) { var empty = document.createElement('p'); empty.textContent = T("text.kanal_nie_udostepnia_napisow"); $('subtitle-list').appendChild(empty); }
        [50, 75, 100, 150, 200].forEach(function (size) { option('subtitle-sizes', size + '%', function () { prefs.subtitleSize = size; subtitleSize(); savePreferences(); settings(); }, prefs.subtitleSize === size); });
        // Auto-play only applies to series and shows, i.e. an episode started from such a list.
        $('autonext-heading').hidden=!(selectedVod&&playlist);
        if(selectedVod&&playlist){option('autonext-list',T('options.on'),function(){setAutoNext(true);settings();},autoNext);option('autonext-list',T('options.off'),function(){setAutoNext(false);settings();},!autoNext);}
        if (modal !== 'player-settings') openModal('player-settings');
        else if (focusList && $(focusList)) { var target = Array.prototype.find.call($(focusList).querySelectorAll('button'), function (b) { return b.textContent === focusLabel; }); if (target) target.focus(); }
    }
    function subtitleSize() {
        Array.prototype.forEach.call(document.styleSheets[0].cssRules, function (rule) { if (rule.selectorText === 'video::cue') rule.style.fontSize = 36 * prefs.subtitleSize / 100 + 'px'; });
    }
    function setGuideLogo(c) {
        var image = $('guide-logo'); image.hidden = !c || !c.logo;
        if (!c || !c.logo || image.dataset.imageSource === c.logo) return;
        image.hidden = true;image.dataset.imageWidth='360';image.dataset.logoBox='280 68';image.onerror=function(){image.hidden=true;};
        setImage(image,c.logo).then(function(loaded){if(loaded&&image.dataset.imageSource===c.logo){image.hidden=false;queueGuideScroll();}});
    }
    // Logos get about the same visible area whatever their shape, within the slot: wide logos no longer fill the slot and
    // tall or square ones no longer shrink to a stamp. The slot keeps its height, so card titles stay on one line.
    function fitLogo(image){
        var box=image.dataset.logoBox.split(' ').map(Number),width=image.naturalWidth,height=image.naturalHeight;if(!width||!height)return;
        var aspect=width/height,h=Math.sqrt(box[0]*box[1]*0.42/aspect),w=aspect*h;
        if(w>box[0]){w=box[0];h=w/aspect;}if(h>box[1]){h=box[1];w=h*aspect;}
        image.style.width=Math.round(w)+'px';image.style.height=Math.round(h)+'px';var gap=Math.round((box[1]-h)/2)+'px';image.style.marginTop=image.style.marginBottom=gap;
    }
    function queueGuideScroll() {
        if(guideScrollFrame)return;
        guideScrollFrame=requestAnimationFrame(function(){
            guideScrollFrame=0;if($('guide').hidden)return;
            var list=$('guide-results'),rect=list.getBoundingClientRect(),row,focused=document.activeElement;
            if(!guideWheelBrowsing && focused.classList.contains('guide-item')){var box=focused.getBoundingClientRect();if(box.top<rect.bottom&&box.bottom>rect.top)row=focused;}
            for(var offset=8;offset<45&&!row;offset+=12){var hit=document.elementFromPoint(rect.left+32,rect.top+offset);row=hit&&hit.closest('.guide-item');}
            if(row)guideDateLabel(day(Number(row.dataset.start)));
        });
    }
    function openGuide() {
        if (!$('guide').hidden) return; guideReturn = screen; guideChannel = screen === 'player' ? selectedChannel : focusedChannel; var highlighted=document.querySelector('.channel-card:focus');if(screen==='channels'&&highlighted)guideChannel=highlighted.dataset.channel; guideDate = day(netiaNow() || Date.now()); $('guide-search').value = ''; var c = channel(guideChannel); setGuideLogo(c); $('guide').hidden = false; closeModal(false); reveal(); loadGuide();
    }
    function closeGuide() { if ($('guide').hidden) return; guideGeneration++; cancelAnimationFrame(guideWheelFrame); guideWheelFrame = 0; $('guide').hidden = true; if (guideReturn === 'player') { $('player-guide').focus(); reveal(); } else focusChannel(); }
    function guideDateLabel(date) {
        guideDate = date;
        $('guide-date').textContent = formats.date.format(new Date(date + 'T12:00:00Z'));
    }
    function loadGuide() {
        cancelAnimationFrame(guideWheelFrame); guideWheelFrame = 0; var current = ++guideGeneration; guideItems = []; guideFirst = guideLast = guideDate; guideLoading = true;
        $('guide-items').textContent = ''; $('guide-status').textContent = T("text.pobieranie_ramowki_kanalu"); guideDateLabel(guideDate);
        rpc('programs', {id: guideChannel, date: guideDate}).then(function (items) {
            if (current !== guideGeneration) return;
            guideLoading = false; guideItems = items.filter(function(p){return p.channelId === guideChannel;}); renderGuide();
            var active = $('guide-items').querySelector('.current') || $('guide-items').querySelector('.guide-item');
            // Centre the current programme within the list only; scrollIntoView would also scroll the page around it.
            if (active) { focusControl(active); var list = $('guide-results'); Scrolling.to(list, Scrolling.contentTop(list, active) - (list.clientHeight - active.offsetHeight) / 2, false); }
        }).catch(function (error) { if (current === guideGeneration) { guideLoading = false; guideError(error); } });
    }
    function guideError(error) {
        $('guide-status').textContent = T('errors.guide',{code:/^[A-Z_0-9-]+$/.test(error.message)?error.message:'EPG_ERROR'});
    }
    function guideButton(p) {
        var button = document.createElement('button'), clock = document.createElement('span'), body = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('p');
        button.dataset.program = p.id; button.dataset.start = p.start;
        button.className = 'guide-item' + (p.start <= (netiaNow() || Date.now()) && p.end > (netiaNow() || Date.now()) ? ' current' : '');
        clock.className = 'guide-time';body.className='guide-body'; clock.textContent = time(p.start) + ' – ' + time(p.end); title.textContent = p.title; description.textContent = p.description;
        var status=document.createElement('span'),remaining=document.createElement('span'),live=document.createElement('span');
        status.className='guide-live-status';status.hidden=true;status.setAttribute('role','progressbar');status.setAttribute('aria-valuemin','0');status.setAttribute('aria-valuemax','100');
        remaining.className='guide-remaining';live.className='guide-live-badge';live.textContent=T('text.na_zywo_2');status.appendChild(remaining);status.appendChild(live);
        var heading=document.createElement('span');heading.className='guide-heading';heading.appendChild(title);heading.appendChild(status);
        body.appendChild(heading); body.appendChild(description); button.appendChild(clock); button.appendChild(body);
        // Keep visited descriptions open so losing focus cannot shrink rows above the viewport.
        button.onfocus = function () { guideWheelBrowsing = false; button.classList.add('expanded'); guideDateLabel(day(p.start)); };
        button.onclick = function () {
            if(p.start > (netiaNow() || Date.now())) { $('guide-status').textContent=T("text.ta_audycja_jeszcze_sie_nie_rozpoczela"); return; }
            if(player && selectedChannel===p.channelId) { if(!seekProgramme(p.start,p.end)) { $('guide-status').textContent=T("text.poczatek_audycji_jest_poza_dostepnym_buforem_netii"); return; } closeGuide(); $('video').play().catch(notice); }
            else { closeGuide(); begin(p.channelId,p.start,p.end); }
        };
        return button;
    }
    function guideStatus() { $('guide-status').textContent = T('guide.count',{count:guideItems.length});updateGuideProgress(); }
    function updateGuideProgress(){
        if($('guide').hidden)return;
        var now=netiaNow()||Date.now(),p=TVModel.at(guideItems,now),value=p?Math.max(0,Math.min(100,(now-p.start)/(p.end-p.start)*100)):0;
        $('guide-results').querySelectorAll('.guide-item').forEach(function(button){
            var current=!!p&&button.dataset.program===p.id&&Number(button.dataset.start)===p.start;
            if(!current&&!button.classList.contains('current'))return;
            var status=button.querySelector('.guide-live-status');
            button.classList.toggle('current',current);status.hidden=!current;
            if(!current)return;
            button.style.setProperty('--guide-progress',value+'%');status.setAttribute('aria-valuenow',String(Math.round(value)));status.setAttribute('aria-label',T('guide.current',{title:p.title}));
            var text=T('guide.remaining',{minutes:Math.ceil((p.end-now)/60000)}),remaining=status.querySelector('.guide-remaining');
            if(remaining.textContent!==text)remaining.textContent=text;
        });
    }
    function extendGuide(offset, keyboard) {
        if (guideLoading || $('guide').hidden || $('guide-search').value.trim()) return;
        var date = day(Date.parse((offset < 0 ? guideFirst : guideLast) + 'T12:00:00Z') + offset * 86400000), current = guideGeneration;
        guideLoading = true; $('guide-status').textContent = T("text.pobieranie_kolejnego_dnia");
        rpc('programs', {id: guideChannel, date: date}).then(function (items) {
            if (current !== guideGeneration) return;
            guideLoading = false;
            if (offset < 0) guideFirst = date; else guideLast = date;
            var list = $('guide-results'), box = $('guide-items'), edge = offset < 0 ? box.firstChild : box.lastChild, anchorTop = edge && edge.getBoundingClientRect().top;
            var existing = Object.create(null); guideItems.forEach(function(p){existing[p.id + ':' + p.start] = true;});
            var added = items.filter(function(p){return p.channelId === guideChannel && !existing[p.id + ':' + p.start];}).sort(function(a,b){return a.start-b.start;});
            guideItems = offset < 0 ? added.concat(guideItems) : guideItems.concat(added);
            if ($('guide-search').value.trim()) { renderGuide(); return; }
            var fragment = document.createDocumentFragment(); added.forEach(function(p){fragment.appendChild(guideButton(p));});
            var target = offset < 0 ? fragment.lastChild : fragment.firstChild;
            if (offset < 0) box.insertBefore(fragment, box.firstChild); else box.appendChild(fragment);
            markGuideDays();if (offset < 0 && edge) Scrolling.shift(list, edge.getBoundingClientRect().top - anchorTop);
            if (keyboard && target) { focusControl(target); Scrolling.reveal(list,target); }
            guideStatus(); queueGuideScroll(); Scrolling.update();
        }).catch(function(error){if(current === guideGeneration){guideLoading=false;guideError(error);}});
    }
    // A labelled boundary ("27 października, wtorek") precedes every programme that starts a new day after another day's
    // programme. Boundaries are not focusable; arrows, the wheel and the pointer skip them.
    function markGuideDays() {
        var items=$('guide-items'),previous=null;
        Array.prototype.slice.call(items.querySelectorAll('.guide-day')).forEach(function(node){node.remove();});
        Array.prototype.forEach.call(items.querySelectorAll('.guide-item'),function(button){
            var date=day(Number(button.dataset.start));if(previous&&date!==previous){var label=document.createElement('div');label.className='guide-day';label.setAttribute('role','separator');label.textContent=guideDayLabel(date);items.insertBefore(label,button);}previous=date;
        });
    }
    function guideDayLabel(date){
        var noon=new Date(date+'T12:00:00Z');
        return T('guide.day',{date:formats.date.format(noon),weekday:formats.weekday.format(noon)});
    }
    function guideNeighbour(node,forward){do{node=forward?node.nextElementSibling:node.previousElementSibling;}while(node&&!node.classList.contains('guide-item'));return node;}
    function renderGuide() {
        var visible = TVModel.channels(channelItems, prefs, 'all').map(function (c) { return c.id; });
        var items = TVModel.search(guideItems.filter(function (p) { return visible.indexOf(p.channelId) >= 0; }), $('guide-search').value);
        $('guide-status').textContent = T('guide.count',{count:items.length});updateGuideProgress(); $('guide-items').textContent = '';
        var fragment = document.createDocumentFragment(); items.forEach(function(p){fragment.appendChild(guideButton(p));}); $('guide-items').appendChild(fragment);markGuideDays();updateGuideProgress(); queueGuideScroll();
    }
    function back() {
        if (modal) closeModal(); else if (!$('guide').hidden) closeGuide(); else if (screen === 'player') backToChannels().catch(notice); else if(screen==='library') libraryBack(); else if (screen === 'web-login') cancelLogin(); else if (screen === 'save') show(saveReturn); else if (screen === 'channels') run(profiles); else if (screen === 'profiles') $('logout-button').focus(); else if (typeof window.close === 'function') window.close();
    }
    var libraryImageFrame=0,libraryError=false;
    function updateLibraryImageStatus(){
        if(libraryImageFrame)return;
        libraryImageFrame=requestAnimationFrame(function(){
            libraryImageFrame=0;if(screen!=='library'||libraryError)return;
            var waiting=libraryNodes.some(function(node){var image=node.querySelector('img');return image.dataset.imagePending==='true'||image.dataset.imageQueued==='true';});
            $('library-results').setAttribute('aria-busy',String(libraryLoading||waiting));
            $('library-status').textContent=T('library.count',{visible:libraryNodes.filter(function(node){return !node.hidden;}).length,total:libraryItems.length})+(libraryLoading?T('text.wczytywanie_calej_listy'):'');
        });
    }
    function setImage(image,src){
        if(image.dataset.imageSource===src&&(image.dataset.imagePending==='true'||image.complete&&image.naturalWidth))return image.netiosPromise||Promise.resolve(true);
        image.dataset.imageSource=src;image.dataset.imagePending='true';
        image.netiosPromise=NetiosImages.source(src,Number(image.dataset.imageWidth)||0,image.dataset.logoBox!==undefined).then(function(local){
            if(image.dataset.imageSource!==src)return image.netiosPromise;
            return new Promise(function(resolve){
                function finish(){image.removeEventListener('load',finish);image.removeEventListener('error',finish);if(image.dataset.imageSource!==src)return resolve(image.netiosPromise);image.dataset.imagePending='false';updateLibraryImageStatus();resolve(image.naturalWidth>0);}
                image.addEventListener('load',finish);image.addEventListener('error',finish);image.src=local;if(image.decode)image.decode().catch(function(){});if(image.complete&&image.naturalWidth)finish();
            });
        });
        return image.netiosPromise;
    }
    ['load','error'].forEach(function(event){document.addEventListener(event,function(e){if(e.target.tagName==='IMG'){e.target.dataset.imagePending='false';if(event==='error'&&e.target.dataset.imageSource)NetiosImages.discard(e.target.dataset.imageSource,Number(e.target.dataset.imageWidth)||0,e.target.dataset.logoBox!==undefined);if(event==='load'&&e.target.dataset.logoBox)fitLogo(e.target);updateLibraryImageStatus();}},true);});
    function libraryKey(){return libraryKind+':'+(libraryId===undefined?'root':libraryId);}
    function rememberLibrary(){
        if(libraryScope!==preferenceKey||!libraryItems.length&&libraryNext!==null)return;
        libraryCache[libraryKey()]={items:libraryItems,nodes:libraryNodes,next:libraryNext,search:$('library-search').value,scroll:Scrolling.target($('library-results')),focus:libraryNodes.indexOf(document.activeElement),sort:libraryMode(),details:libraryDetails};
    }
    function openLibrary(kind){if(screen==='library')rememberLibrary();libraryGeneration++;libraryKind=kind;libraryId=undefined;libraryTrail=[];show('library');loadLibrary(false);}
    function artwork(){
        if(artworkActive>=2||!artworkQueue.length)return;
        var job=artworkQueue.shift();if(job.scope!==preferenceKey||job.key!==libraryKey()||!job.image.isConnected){job.item.artworkRequested=false;job.image.dataset.imagePending='false';job.resolve();artwork();return;}artworkActive++;
        rpc('catalogArtwork',{kind:job.kind,id:job.item.id}).then(function(src){
            if(job.scope!==preferenceKey){job.image.dataset.imagePending='false';return;}if(src){job.item.image=src;job.image.dataset.src=src;if(job.key===libraryKey())saveLibrary(true);if(job.key===libraryKey()&&job.image.isConnected){job.image.hidden=false;return setImage(job.image,src);}}job.image.dataset.imagePending='false';
        }).catch(function(){job.item.artworkRequested=false;job.image.dataset.imagePending='false';}).then(function(){artworkActive--;job.resolve();updateLibraryImageStatus();artwork();});artwork();
    }
    function loadLibraryImage(image){
        image.dataset.imageQueued='false';
        if(image.dataset.src)return setImage(image,image.dataset.src);
        if(image.netiaItem&&!image.netiaItem.artworkRequested){image.netiaItem.artworkRequested=true;image.dataset.imagePending='true';image.netiosArtwork=new Promise(function(resolve){artworkQueue.push({image:image,item:image.netiaItem,kind:image.netiaKind,scope:image.netiaScope,key:libraryKey(),resolve:resolve});});artwork();}
        return image.netiosArtwork||Promise.resolve();
    }
    var libraryImageRevision=0;
    function observeLibraryImages(){
        var revision=++libraryImageRevision,view=libraryGeneration,groups=[],group=[],rowTop=null;
        libraryNodes.forEach(function(node){node.querySelector('img').dataset.imageQueued='false';});
        $('library-grid').querySelectorAll('.library-group,.library-card').forEach(function(node){
            if(node.classList.contains('library-group')){if(group.length)groups.push(group);group=[];rowTop=null;return;}
            if(group.length&&node.offsetTop!==rowTop){groups.push(group);group=[];}rowTop=node.offsetTop;
            var image=node.querySelector('img');image.dataset.imageQueued=String((!image.complete||!image.naturalWidth)&&!!(image.dataset.src||image.netiaItem));group.push(image);
        });
        if(group.length)groups.push(group);
        function next(index){if(revision!==libraryImageRevision||view!==libraryGeneration||screen!=='library'||index===groups.length)return;return Promise.all(groups[index].map(loadLibraryImage)).then(function(){return next(index+1);});}
        next(0);updateLibraryImageStatus();
    }
    function orderLibrary(){
        filterLibrary();
        $('library-sort').value=libraryMode();$('library-sort').mdiUpdate();
    }
    function libraryRows(){
        return Scrolling.rows(Array.prototype.slice.call($('library-grid').querySelectorAll('.library-card:not([hidden])')));
    }
    function scrollLibrary(top,animate){Scrolling.to($('library-results'),top,animate);}
    function alignLibrary(node,direction,origin){
        var list=$('library-results');
        if(node.hidden||!node.isConnected)return;
        var top=Scrolling.contentTop(list,node),bottom=top+node.getBoundingClientRect().height;
        var before=origin===undefined?Scrolling.target(list):origin,aim=before;
        if(top<before+8){var heading=node.previousElementSibling;if(heading&&heading.classList.contains('library-group'))top=heading.offsetTop;aim=top-8;}
        else if(bottom>before+list.clientHeight-8)aim=bottom-list.clientHeight+8;
        if(direction>0)aim=Math.max(before,aim);else if(direction<0)aim=Math.min(before,aim);
        scrollLibrary(aim);
    }
    // Pointer focus must not scroll a card away before release.
    $('library-results').addEventListener('mousedown',function(e){var card=e.target.closest('.library-card');if(card&&e.button===0){e.preventDefault();card.focus({preventScroll:true});}});
    var libraryWheel={};
    $('library-results').addEventListener('wheel',function(e){
        if(!e.deltaY||screen!=='library'||modal||!$('guide').hidden)return;e.preventDefault();Scrolling.holdPointer(e);
        var list=this,rows=libraryRows();if(list.scrollHeight<=list.clientHeight||!rows.length)return;
        var count=Scrolling.steps(libraryWheel,e,list.clientHeight);if(!count)return;
        var from=document.activeElement&&document.activeElement.classList.contains('library-card')?document.activeElement:null,move=Scrolling.wheelRows(list,rows,count,'library-group',8,from);
        if(move.node!==document.activeElement)move.node.focus({preventScroll:true});
        scrollLibrary(move.top);
    },{passive:false});
    function filterLibrary(){
        Scrolling.update();
        var list=$('library-results'),grid=$('library-grid'),focus=document.activeElement,scroll=Scrolling.target(list),mode=libraryMode(),changedSort=grid.dataset.sort!==mode,matches=TVModel.search(libraryItems,$('library-search').value),matching=new Set(matches),nodes=new Map(),minHeight=grid.style.minHeight;
        // Keep the scroll extent while moving reused cards into the fragment.
        grid.style.minHeight=grid.offsetHeight+'px';
        var grouped=mode==='genres'||mode==='seasons',groups=TVModel.catalogueGroups(matches,mode),fragment=document.createDocumentFragment();
        libraryNodes.forEach(function(node,i){nodes.set(libraryItems[i],node);node.hidden=!matching.has(libraryItems[i]);});
        groups.forEach(function(group){
            if(grouped){var heading=document.createElement('h2');heading.className='channel-category library-group';heading.textContent=mode==='seasons'?(group.key?T('library.season',{number:group.key}):T('library.episodes')):group.key||T('common.other');fragment.appendChild(heading);}
            group.items.forEach(function(item){fragment.appendChild(nodes.get(item));});
        });
        grid.textContent='';grid.appendChild(fragment);grid.style.minHeight=minHeight;grid.dataset.sort=mode;
        if(libraryNodes.indexOf(focus)>=0){var target=!focus.hidden?focus:grid.querySelector('.library-card:not([hidden])');if(target)focusControl(target);}
        if(!Scrolling.moving(list))Scrolling.to(list,scroll,false);
        if(changedSort&&target)alignLibrary(target);
        observeLibraryImages();
    }
    function renderLibraryHero(){
        setIcon($('library-back'),libraryId===undefined?'home':'chevron-left');
        $('library-back').setAttribute('aria-label',T(libraryId===undefined?'text.wroc_do_kanalow':'library.back'));
        $('library-hero').hidden=libraryId===undefined||!libraryDetails;
        $('library-background').hidden=libraryId===undefined;
        if(libraryId===undefined)return;
        var details=libraryDetails||{};
        $('library-info').hidden=details.hideDescription===true;
        $('library-description').textContent=details.description||T('library.noDescription');
        var metadata=[];
        if(details.closedCaptions===true)metadata.push(T('library.cc'));
        if(Number.isInteger(details.ageGroup))metadata.push(T('library.age',{age:details.ageGroup}));
        if(details.genres&&details.genres.length)metadata.push(details.genres.join(' · '));
        $('library-metadata').textContent=metadata.join(' · ');
        var image=$('library-backdrop'),background=$('library-background'),src=details.backdrop||details.image,key=libraryKey();
        if(details.hideDescription===true)$('library-hero').hidden=true;
        if(!src||image.dataset.imageSource!==src||!image.complete||!image.naturalWidth){image.hidden=true;background.hidden=true;}
        image.onerror=function(){image.hidden=true;background.hidden=true;};
        if(src)setImage(image,src).then(function(loaded){
            if(!loaded||key!==libraryKey()||libraryId===undefined||image.dataset.imageSource!==src)return;
            background.classList.toggle('thumbnail-background',!details.backdrop&&!!details.image);fitLibraryBackdrop();image.hidden=false;background.hidden=false;
        });
        fitLibraryDescription();
    }
    function fitLibraryDescription(){
        var description=$('library-description');
        if(libraryId===undefined||!description.clientWidth)return;
        var text=libraryDetails&&libraryDetails.description||T('library.noDescription'),limit=parseFloat(getComputedStyle(description).lineHeight)*6;
        description.textContent=text;
        if(description.scrollHeight<=limit+1&&description.scrollWidth<=description.clientWidth+1)return;
        var words=text.trim().split(/\s+/),low=0,high=words.length;
        while(low<high){
            var middle=Math.ceil((low+high)/2);
            description.textContent=words.slice(0,middle).join(' ')+'…';
            if(description.scrollHeight<=limit+1&&description.scrollWidth<=description.clientWidth+1)low=middle;else high=middle-1;
        }
        description.textContent=words.slice(0,low).join(' ')+'…';
    }
    function fitLibraryBackdrop(){
        var image=$('library-backdrop'),background=$('library-background'),body=$('library-body');
        if(!image.naturalWidth||!image.naturalHeight||body.clientWidth<=16||body.clientHeight<=8)return;
        var width=(body.clientWidth-16)*(background.classList.contains('thumbnail-background') ? .75 : 1);
        var scale=Math.min(width/image.naturalWidth,(body.clientHeight-8)/image.naturalHeight);
        background.style.width=(image.naturalWidth*scale)+'px';background.style.height=(image.naturalHeight*scale)+'px';
    }
    window.addEventListener('resize',function(){fitLibraryBackdrop();fitLibraryDescription();});
    if(document.fonts)document.fonts.ready.then(fitLibraryDescription);
    function libraryMode(){return libraryId===undefined?prefs.librarySort[libraryKind]:libraryEpisodeSort;}
    function configureLibrarySort(){
        var select=$('library-sort'),inner=libraryId!==undefined,key=inner?'seasons':'genres';
        if(!select.querySelector('option[value="'+key+'"]')){
            select.textContent='';[['alphabetical','sort.alphabetical'],[key,inner?'sort.seasons':'sort.genres']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=T(pair[1]);select.appendChild(option);});
        }
        select.value=libraryMode();select.mdiUpdate();
    }
    function loadLibraryDetails(refresh){
        var revision=++libraryDetailsRevision,key=libraryKey(),scope=preferenceKey;
        return rpc('catalogDetails',{kind:libraryKind,id:libraryId,refresh:!!refresh}).then(function(details){
            if(revision!==libraryDetailsRevision||scope!==preferenceKey||key!==libraryKey())throw new Error('STALE_REQUEST');
            libraryDetails=details;renderLibraryHero();return details;
        });
    }
    // Complete series/show lists are kept for a day; Refresh in the catalogue or in Options replaces them.
    var libraryMaxAge=86400000,librarySaveTimer=null;
    // A completed list is saved at once; artwork found later is batched (later=true) into one rewrite.
    function saveLibrary(later){
        if(libraryId!==undefined||!preferenceKey||libraryNext!==null)return;
        var key='library:'+preferenceKey+':'+libraryKind,items=libraryItems;clearTimeout(librarySaveTimer);
        function save(){NetiosData.set(key,{items:items.map(function(item){var copy=Object.assign({},item);delete copy.artworkRequested;return copy;})});}
        if(later)librarySaveTimer=setTimeout(save,2000);else save();
    }
    function loadLibrary(append,refresh){
        var current=++libraryGeneration,offset=append?libraryNext:0;libraryError=false;libraryLoading=true;$('library-results').setAttribute('aria-busy','true');
        $('library-title').textContent=libraryTrail.length?libraryTrail[libraryTrail.length-1].title:libraryKind==='series'?T("library.series"):T("library.shows");
        if(!append){
            libraryScope=preferenceKey;if(refresh)delete libraryCache[libraryKey()];
            var cached=libraryCache[libraryKey()];libraryDetails=cached&&cached.details||null;renderLibraryHero();
            libraryDetailsRevision++;libraryEpisodeSort=cached&&cached.sort||'seasons';configureLibrarySort();
            $('library-grid').textContent='';
            if(cached){
                var cachedFocus=cached.nodes[cached.focus];libraryItems=cached.items;libraryNodes=cached.nodes;libraryNext=cached.next;libraryLoading=libraryNext!==null;
                $('library-search').value=cached.search;orderLibrary();
                if(cachedFocus&&!cachedFocus.hidden)focusControl(cachedFocus);
                if(cached.sort===libraryMode())scrollLibrary(cached.scroll,false);else if(cachedFocus)alignLibrary(cachedFocus);
                updateLibraryImageStatus();
                return libraryLoading?loadLibrary(true):Promise.resolve();
            }
            libraryItems=[];libraryNodes=[];libraryNext=0;$('library-search').value='';scrollLibrary(0,false);configureLibrarySort();
        }
        filterLibrary();
        var saveKey=libraryId===undefined&&preferenceKey?'library:'+preferenceKey+':'+libraryKind:null;
        if(saveKey&&refresh)NetiosData.remove(saveKey);
        var request=libraryId!==undefined?loadLibraryDetails(refresh).then(function(details){return {items:details.items,next:null};}):saveKey&&!offset&&!refresh?NetiosData.get(saveKey).then(function(saved){
            var items=TVModel.savedList(saved,libraryMaxAge,Date.now());
            return items?{items:items,next:null,saved:true}:rpc('catalog',{kind:libraryKind,id:libraryId,offset:offset});
        }):rpc('catalog',{kind:libraryKind,id:libraryId,offset:offset});
        return request.then(function(data){
            if(current!==libraryGeneration)return;
            if(data.next!==null&&(!Number.isInteger(data.next)||data.next<=offset))throw new Error('INVALID_PAGINATION');
            libraryNext=data.next;
            data.items.forEach(function(item){
                if(libraryItems.some(function(old){return old.id===item.id;}))return;
                libraryItems.push(item);
                var button=document.createElement('button'),frame=document.createElement('span'),image=document.createElement('img'),title=document.createElement('strong');
                var captionText=libraryId===undefined?item.title:TVModel.episodeTitle(item.title,$('library-title').textContent,libraryDetails&&libraryDetails.items?libraryDetails.items.length:libraryItems.length);
                button.className='library-card';button.title=captionText;frame.className='library-thumbnail';image.alt='';image.dataset.imageWidth='640';
                var parentImage=!item.category&&libraryDetails&&libraryDetails.image,src=item.image||parentImage;
                if(src)image.dataset.src=src;else if(item.category){image.netiaItem=item;image.netiaKind=libraryKind;image.netiaScope=preferenceKey;}
                image.hidden=!src;image.onerror=function(){if(parentImage&&image.dataset.src!==parentImage){image.dataset.src=parentImage;setImage(image,parentImage);}else image.hidden=true;};var caption=document.createElement('span');caption.textContent=captionText;title.appendChild(caption);frame.appendChild(image);button.appendChild(frame);button.appendChild(title);
                button.onclick=function(){
                    rememberLibrary();if(item.category){libraryTrail.push({id:libraryId,title:item.title,item:item});libraryId=item.id;focusControl($('library-back'));loadLibrary(false);}
                    else{libraryGeneration++;libraryLoading=false;playerReturn='library';playlist=libraryId===undefined?null:libraryItems.slice();playEpisode(item);}
                };
                libraryNodes.push(button);$('library-grid').appendChild(button);
            });
            libraryLoading=libraryNext!==null;orderLibrary();updateLibraryImageStatus();
            if(saveKey&&!libraryLoading&&!data.saved)saveLibrary();
            if(!append&&document.activeElement===$('library-back')){var first=$('library-grid').querySelector('.library-card:not([hidden])');if(first)focusControl(first);}
            if(libraryLoading)return loadLibrary(true);
        }).catch(function(error){if(current!==libraryGeneration)return;libraryError=true;libraryLoading=false;$('library-results').setAttribute('aria-busy','false');$('library-status').textContent=T("text.nie_udalo_sie_pobrac_calej_oferty_uzyj_przycisku");if(libraryId!==undefined)$('library-description').textContent=T('library.detailsError');notice(error);});
    }
    $('library-search').oninput=filterLibrary;
    $('library-sort').onchange=function(){if(libraryId===undefined){prefs.librarySort[libraryKind]=this.value;savePreferences();}else libraryEpisodeSort=this.value;orderLibrary();};
    function libraryBack(){rememberLibrary();libraryGeneration++;if(libraryTrail.length){libraryId=libraryTrail.pop().id;loadLibrary(false);}else{show('channels');focusChannel();}}
    $('library-back').onclick=libraryBack;
    $('library-refresh').onclick=function(){loadLibrary(false,true);};
    ['series','shows'].forEach(function(kind){$('filter-'+kind).onclick=function(){openLibrary(kind);};});
    $('channel-sort').onchange=function(){var focused=document.activeElement===this;prefs.sort=this.value;prefs.channelSort[channelMode]=this.value;savePreferences();renderChannels();focusChannel();if(focused)focusControl(this);};
    function clearLogin() { loginRevision++; pendingLogin = null; clearTimeout(loginTimer); NetiaFrameLogin.cancel(); }
    function attemptLogin() {
        var attempt = pendingLogin; if (!attempt) return Promise.resolve();
        show('web-login');
        return NetiaFrameLogin.open(attempt, loginStage).then(function (session) {
            if (attempt !== pendingLogin) return;
            return rpc('acceptFrameSession', Object.assign({}, session, {username: attempt.username, password: attempt.password})).then(function () {
                if (attempt !== pendingLogin) return rpc('lock'); return profiles().then(function(){if(attempt===pendingLogin)clearLogin();});
            });
        }).catch(function (error) { if (attempt !== pendingLogin) return; clearLogin(); show('login'); throw error; });
    }
    function cancelLogin() { clearLogin(); show('login'); }
    // manual: a rejected automated attempt is not repeated automatically; the form is filled and the user submits it.
    function officialLogin(retry, injected, fresh, manual) {
        clearLogin(); var attempt = {},phase='frame'; pendingLogin = attempt; show('web-login');loginStage(T("text.odczyt_zaszyfrowanego_konta_i_zapisanej_sesji")); $('splash').hidden = true;
        // A session imported from a computer browser (webOS 4 cannot run the official form) replaces the frame entirely.
        var imported=null;
        return rpc('importedSession').catch(function(){return null;}).then(function(session){imported=session&&typeof session==='object'&&session.session?session:null;
            if(fresh&&!imported)return rpc('lock').then(function(){if(attempt===pendingLogin)return NetiaFrameLogin.forget();});
        }).then(function(){
            if(attempt!==pendingLogin)return;
            return injected||rpc('rememberedAccount');
        }).then(function (saved) {
            if (attempt !== pendingLogin) return;
            if(!injected&&retry!==false)$('frame-remember').checked=!!(saved&&saved.remember);
            if(imported)return imported;
            return NetiaFrameLogin.open(saved, loginStage, true, manual);
        }).then(function (session) {
            if (!session || attempt !== pendingLogin) return;
            var data = Object.assign({}, session, session.credentials || {}, {remember:$('frame-remember').checked}); delete data.credentials;
            phase='verify';loginStage(T("text.weryfikacja_sesji_i_bezpieczne_zapisywanie_konta"));return rpc('acceptFrameSession', data).then(function () { if (attempt !== pendingLogin) return; phase='profiles';return profiles().then(function(){if(attempt===pendingLogin)clearLogin();}); });
        }).catch(function (error) {
            if (attempt !== pendingLogin) return;
            if (retry !== false && phase!=='profiles' && (/^(INVALID_SESSION|RPC_13404|LOGIN_REQUIRED)$/.test(error.message)||phase==='verify'&&error.message==='RPC_13572')) return NetiaFrameLogin.forget().then(function () { if(attempt===pendingLogin)return officialLogin(false,injected,false,error.message==='RPC_13572'); },function(cleanupError){if(attempt!==pendingLogin)return;clearLogin();show('login');throw cleanupError;});
            if (retry !== false && phase==='frame' && error.message === 'RPC_13572') return officialLogin(false,injected,false,true);
            clearLogin(); show('login'); throw error;
        });
    }
    $('official-login-button').onclick = function () { officialLogin().catch(notice); };
    window.netiOSLogin=function(data){
        if(screen!=='login'&&screen!=='web-login')throw new Error('LOGIN_SCREEN_REQUIRED');
        if(!data||typeof data.username!=='string'||!data.username.trim()||data.username.length>256||typeof data.password!=='string'||!data.password||data.password.length>1024)throw new Error('INVALID_CREDENTIALS');
        officialLogin(false,{username:data.username,password:data.password}).catch(notice);return true;
    };
    $('web-login-cancel').onclick = cancelLogin;
    $('login-form').onsubmit = function (e) { e.preventDefault(); if (busy) return; clearLogin(); saveAfterLogin = $('remember-account').checked; pendingLogin = {username: $('username').value, password: $('password').value}; $('password').value = ''; $('password').type = 'password'; loginTimer = setTimeout(function () { cancelLogin(); notice(new Error('LOGIN_TIMEOUT')); }, 300000); run(attemptLogin); };
    $('show-password').onclick = function () { var revealPassword = $('password').type === 'password'; $('password').type = revealPassword ? 'text' : 'password'; $('show-password').setAttribute('aria-label', revealPassword ? T("text.ukryj_haslo") : T("text.pokaz_haslo")); setIcon($('show-password'), revealPassword ? 'eye-off' : 'eye'); };
    $('unlock-button').onclick = function () { run(function () { var phrase = $('unlock-phrase').value; $('unlock-phrase').value = ''; return rpc('unlock', {passphrase: phrase}).then(function () { return rpc('status'); }).then(function (s) { return s.rememberedProfile ? rpc('selectProfile', {id: s.rememberedProfile, remember: true}).then(channels).catch(profiles) : profiles(); }); }); };
    $('cancel-save').onclick = function () { show(saveReturn); };
    $('confirm-save').onclick = function () { run(function () { var phrase = $('save-phrase').value, confirm = $('confirm-phrase').value; $('save-phrase').value = ''; $('confirm-phrase').value = ''; if (phrase !== confirm) throw new Error('VAULT_PASSPHRASE'); return rpc('save', {passphrase: phrase}).then(function () { show(saveReturn); $('notice').textContent = T("text.konto_zapisane_w_zaszyfrowanym_schowku"); }); }); };
    $('logout-button').onclick = function () { run(function () { return stop().then(function () { return Promise.all([rpc('logout'),NetiaFrameLogin.forget(),NetiosData.clear()].map(function(task){return task.then(function(){return null;},function(error){return error;});})); }).then(function (errors) { $('username').value = ''; $('channel-list').textContent = ''; $('profile-list').textContent = ''; channelItems = []; channelNodes = Object.create(null); nowPrograms = {}; $('remember-account').checked = false; saveAfterLogin = false; preferenceKey = null;libraryCache=Object.create(null);artworkQueue=[]; prefs = TVModel.preferences(); selectedChannel = focusedChannel = null; show('login'); $('unlock-area').hidden = true;var error=errors.find(function(item){return !!item;});if(error)throw error; }); }); };
    $('favorite-shortcut').onclick=function(){var id=focusedChannel;togglePreference('favorites');if(channelNodes[id]&&channelNodes[id].isConnected)focusControl(channelNodes[id]);};
    $('watch-button').onclick = function () { if (focusedChannel) begin(focusedChannel); };
    ['all', 'favorites', 'hidden'].forEach(function (mode) { $('filter-' + mode).onclick = function () { channelMode=mode;prefs.sort=prefs.channelSort[mode];$('channel-sort').value=prefs.sort;$('channel-sort').mdiUpdate();renderChannels(); }; });
    $('channel-options').onclick = openChannelMenu; $('menu-close').onclick = function () { stop().then(function(){window.close();}).catch(notice); };
    $('menu-profiles').onclick=function(){closeModal(false);run(function(){return stop().then(function(){return profiles(true);});});};
    $('menu-favorite').onclick = function () { togglePreference('favorites'); closeModal(); };
    $('menu-hide').onclick = function () { togglePreference('hidden'); closeModal(); };
    $('menu-restore').onclick = function () { prefs.hidden = []; savePreferences(); renderChannels(); closeModal(); };
    $('refresh-button').onclick = function () { closeModal(false); run(function () { return channels('refresh'); }); };
    $('back-button').onclick = function () { backToChannels().catch(notice); }; $('settings-button').onclick = settings; $('close-settings').onclick = function () { closeModal(); };
    $('previous-button').onclick=function(){skip(-1);};$('next-button').onclick=function(){skip(1);};
    $('pause-button').onclick = pause; $('rewind-button').onclick = function () { seek(-10); }; $('forward-button').onclick = function () { seek(10); }; $('live-button').onclick = $('live-badge').onclick = function () { seek(0, true); };
    $('timeline').oninput = function () { if (!player) return; var value = TVModel.seek(Number($('timeline').value), player.seekRange()); if (value !== null) { $('video').currentTime = value;var range=player.seekRange();timelineTooltip(value,(value-range.start)/(range.end-range.start)); } reveal(); };
    $('timeline').onmousemove=function(e){if(!player)return;var r=this.getBoundingClientRect(),fraction=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),range=player.seekRange();timelineTooltip(range.start+fraction*(range.end-range.start),fraction);};
    $('timeline').onmouseleave=$('timeline').onblur=function(){$('timeline-tooltip').hidden=true;};
    $('video').onpause = $('video').onplay = reveal;
    $('guide-button').onclick = $('player-guide').onclick = openGuide; $('close-guide').onclick = closeGuide;
    $('guide-search').oninput = function () { clearTimeout(guideSearchTimer); guideSearchTimer = setTimeout(function(){renderGuide();},120); };
    $('guide-results').addEventListener('scroll',queueGuideScroll,{passive:true});
    var guideWheel={};
    $('guide-results').addEventListener('wheel',function(e){
        if ($('guide').hidden || !e.deltaY) return;
        // Same model as the other panels: one notch moves one programme, without moving focus or letting pointer drift take it.
        e.preventDefault(); Scrolling.holdPointer(e); guideWheelBrowsing = true;
        var count = Scrolling.steps(guideWheel, e, this.clientHeight); if (count) Scrolling.to(this, Scrolling.snapTop(this, $('guide-items').children, count));
        queueGuideScroll();
        if (guideWheelFrame) return;
        var direction = e.deltaY < 0 ? -1 : 1;
        guideWheelFrame = requestAnimationFrame(function(){
            guideWheelFrame = 0; if ($('guide').hidden) return;
            var list = $('guide-results');
            var aim = Scrolling.target(list);
            if (direction < 0 && aim < 180) extendGuide(-1,false);
            else if (direction > 0 && aim + list.clientHeight > list.scrollHeight - 180) extendGuide(1,false);
        });
    },{passive:false});
    // While the wheel moves through channels the programme panel updates once the list stops, not on every notch,
    // so no text layout lands in the middle of a scroll animation.
    var channelWheel={},wheelFocusing=false,wheelHeroTimer=0;
    function queueWheelHero(){clearTimeout(wheelHeroTimer);wheelHeroTimer=setTimeout(function(){if(screen==='channels'&&!modal)hero();},250);}
    $('channel-scroll').addEventListener('wheel',function(e){
        if(screen !== 'channels' || modal || !$('guide').hidden || !$('channel-list').children.length)return;
        e.preventDefault();Scrolling.holdPointer(e);
        var count=Scrolling.steps(channelWheel,e,this.clientHeight);if(!count)return;
        // Same model as the catalogues: rows align to the top edge (category headings stay visible) and focus follows in the
        // column of the highlighted card. Focus is moved without the D-pad centring, which would fight the wheel.
        var scroller=this,cards=channelCards(),rows=Scrolling.rows(cards),from=document.activeElement&&document.activeElement.dataset.channel?document.activeElement:channelNodes[focusedChannel]||cards[0];
        var move=Scrolling.wheelRows(scroller,rows,count,'channel-category',8,from);
        if(move.node!==document.activeElement){pointerFocusing=wheelFocusing=true;try{move.node.focus({preventScroll:true});}finally{pointerFocusing=wheelFocusing=false;}}
        Scrolling.to(scroller,move.top);
    },{passive:false});
    setInterval(syncClock,300000);
    [-1, 1].forEach(function (offset) { $(offset < 0 ? 'guide-prev' : 'guide-next').onclick = function () { guideDate = day(Date.parse(guideDate + 'T12:00:00Z') + offset * 86400000); loadGuide(); }; });
    var pointerFocusing=false,pointerChannel=null,pointerX=null,pointerY=null,scrollCancelledClick=false;
    document.addEventListener('mousedown',function(e){
        if(e.button===0&&e.target.closest&&e.target.closest('button')){scrollCancelledClick=false;pointerChannel=null;var card=e.target.closest('.channel-card');if(card){e.preventDefault();pointerFocusing=true;try{card.focus({preventScroll:true});}finally{pointerFocusing=false;}}}
        else if(e.button!==0&&e.target.closest&&e.target.closest('button'))e.preventDefault();
    },true);
    document.addEventListener('keydown',function(e){
        scrollCancelledClick=false;Scrolling.releasePointer();if(channelHeroFrame){cancelAnimationFrame(channelHeroFrame);channelHeroFrame=0;if(screen==='channels'&&!modal)hero();}
        if(pointerChannel&&screen==='channels'&&!modal&&$('guide').hidden&&[13,37,38,39,40].indexOf(e.keyCode)>=0){pointerFocusing=true;try{pointerChannel.focus({preventScroll:true});}finally{pointerFocusing=false;}}
        pointerChannel=null;
    },true);
    document.addEventListener('wheel',function(e){
        scrollCancelledClick=true;pointerChannel=null;cancelChannelOK();
        if(screen==='player'&&$('guide').hidden){e.preventDefault();e.stopPropagation();}
    },{capture:true,passive:false});
    document.addEventListener('click',function(e){
        if(e.target.closest&&e.target.closest('button')&&(e.button!==0||scrollCancelledClick)){e.preventDefault();e.stopImmediatePropagation();}
    },true);
    document.addEventListener('mousemove',function(e){
        if(screen==='player')reveal();
        if(e.clientX===pointerX&&e.clientY===pointerY)return;pointerX=e.clientX;pointerY=e.clientY;
        if(Scrolling.pointerHeld(e))return;
        // While a search field is being typed into, the Magic Remote pointer passes over tiles on its way to the LG keyboard;
        // taking focus from the field would close the keyboard, so hover never moves focus then.
        var field=document.activeElement;if(field&&field.tagName==='INPUT'&&!field.readOnly&&/^(text|search)$/.test(field.type))return;
        // In dialogs the pointer moves focus, so hover and remote focus never highlight two options at once.
        var control=modal&&e.target.closest&&e.target.closest('#'+modal+' button:not(:disabled),#'+modal+' select');
        if(control&&control!==document.activeElement)control.focus({preventScroll:true});
        var card=e.target.closest&&e.target.closest('.channel-card,.library-card,.guide-item');
        if(!card||modal){pointerChannel=null;return;}
        if(card.dataset.channel){pointerChannel=card;if(focusedChannel!==card.dataset.channel){focusedChannel=card.dataset.channel;markChannel();queueChannelHero();}return;}
        pointerChannel=null;if(card===document.activeElement)return;
        pointerFocusing=true;try{card.focus({preventScroll:true});}finally{pointerFocusing=false;}
    });
    var channelOK=null,channelOKTimer;
    function cancelChannelOK(){clearTimeout(channelOKTimer);channelOK=null;}
    document.addEventListener('keyup',function(e){
        if(e.keyCode!==13&&e.key!=='Enter'||!channelOK)return;
        e.preventDefault();var press=channelOK;cancelChannelOK();
        if(!press.held&&screen==='channels'&&!modal&&$('guide').hidden&&document.activeElement===press.target)press.target.click();
    });
    document.addEventListener('focusin',function(e){if(channelOK&&!channelOK.held&&channelOK.target!==e.target)cancelChannelOK();});
    window.addEventListener('blur',cancelChannelOK);
    function editSearch(input){if(input.readOnly){input.blur();input.readOnly=false;input.focus();}}
    document.querySelectorAll('input[type="search"]').forEach(function(input){input.readOnly=true;input.addEventListener('blur',function(){input.readOnly=true;});input.addEventListener('click',function(){editSearch(input);});});
    document.addEventListener('keydown', function (e) {
        var active=document.activeElement,search=active.matches('input[type="search"]');
        if(search&&(e.keyCode===13||e.key==='Enter')){e.preventDefault();editSearch(active);return;}
        if(search&&(e.keyCode===461||e.key==='Escape')){e.preventDefault();active.readOnly=true;focusControl($(active.id==='library-search'?'library-back':'guide-next'));return;}
        if(channelOK&&e.keyCode!==13&&e.key!=='Enter')cancelChannelOK();
        if (e.keyCode === 461 || e.key === 'Escape') { e.preventDefault();pendingTune=null;if(channelDigits){clearChannelNumber();return;}back(); return; }
        if(remoteChannelKey(e))return;
        if((e.keyCode===13||e.key==='Enter')&&(channelOK||screen==='channels'&&!modal&&$('guide').hidden&&document.activeElement.dataset.channel)){
            e.preventDefault();if(e.repeat||channelOK)return;
            var press={target:document.activeElement,held:false};channelOK=press;
            channelOKTimer=setTimeout(function(){if(channelOK!==press)return;press.held=true;focusedChannel=press.target.dataset.channel;openChannelMenu();},500);return;
        }
        var color=e.keyCode===403||e.key==='ColorF0Red'?'watch-button':e.keyCode===404||e.key==='ColorF1Green'?'guide-button':e.keyCode===405||e.key==='ColorF2Yellow'?'favorite-shortcut':null;
        if(color){if(screen==='channels'&&!modal&&$('guide').hidden){e.preventDefault();if(!e.repeat)$(color).click();}return;}
        if(e.keyCode===406||e.key==='ColorF3Blue'){e.preventDefault();if($('guide').hidden){if(screen==='channels')openChannelMenu();else if(screen==='player'&&player)settings();}return;}
        if (screen === 'player') {
            if (e.keyCode === 19 || e.key === 'MediaPlayPause') { e.preventDefault(); pause(); return; }
            if (e.keyCode === 415) { e.preventDefault(); if ($('video').paused) pause(); return; }
            if (e.keyCode === 413) { e.preventDefault(); backToChannels().catch(notice); return; }
            if (e.keyCode === 412 || e.keyCode === 417) { e.preventDefault(); seek(e.keyCode === 412 ? -10 : 10); return; }
            if (!modal && $('guide').hidden && $('player-controls').classList.contains('controls-hidden')) { reveal(); $('pause-button').focus(); if ([13, 37, 38, 39, 40].indexOf(e.keyCode) >= 0) { e.preventDefault(); return; } }
            reveal();
        }
        if ([37, 38, 39, 40].indexOf(e.keyCode) < 0) return;
        if(active.tagName==='SELECT'){
            if(active.id!=='channel-sort'&&active.id!=='library-sort')return;
            e.preventDefault();
            if(e.keyCode===38||e.keyCode===40){var index=Math.max(0,Math.min(active.options.length-1,active.selectedIndex+(e.keyCode===38?-1:1)));if(index!==active.selectedIndex){active.selectedIndex=index;active.dispatchEvent(new Event('change',{bubbles:true}));}return;}
        }
        // The LG keyboard delivers every typed letter as a keydown; only leaving the field (Up/Down) ends editing, otherwise
        // the field would turn read-only and the keyboard would close after the first letter.
        if(search&&(e.keyCode===38||e.keyCode===40))active.readOnly=true;
        if(active.classList.contains('library-card')&&(e.keyCode===38||e.keyCode===40)){
            var rows=libraryRows(),index=rows.findIndex(function(row){return row.nodes.indexOf(active)>=0;}),row=rows[index+(e.keyCode===38?-1:1)],rowCard=index>=0&&row?row.nodes[Math.min(rows[index].nodes.indexOf(active),row.nodes.length-1)]:null;
            if(rowCard){e.preventDefault();focusControl(rowCard,e.keyCode===40?1:-1);if(e.keyCode===40&&index+1===rows.length-1)scrollLibrary($('library-results').scrollHeight);else if(e.keyCode===38&&index===1)scrollLibrary(0);return;}
            if(e.keyCode===40){e.preventDefault();scrollLibrary($('library-results').scrollHeight);return;}
        }
        if (screen === 'channels' && !modal && $('guide').hidden && document.activeElement.dataset.channel && prefs.sort!=='thematic') {
            var cards = channelCards(), index = cards.indexOf(document.activeElement), column = index % 6, next = index;
            if (e.keyCode === 37 && column > 0) next--;
            if (e.keyCode === 39 && column < 5 && index + 1 < cards.length) next++;
            if (e.keyCode === 38) next = index >= 6 ? index - 6 : -1;
            if (e.keyCode === 40 && index + 6 < cards.length) next += 6;
            e.preventDefault(); if (next < 0) focusControl($('filter-' + channelMode)); else if (next !== index) focusControl(cards[next]); return;
        }
        if (!$('guide').hidden && document.activeElement.classList.contains('guide-item') && (e.keyCode===38 || e.keyCode===40)) { e.preventDefault(); var row=guideNeighbour(document.activeElement,e.keyCode===40); if(row){focusControl(row);Scrolling.reveal($('guide-results'),row);} else extendGuide(e.keyCode===38?-1:1,true); return; }
        if (document.activeElement === $('timeline') && (e.keyCode === 37 || e.keyCode === 39)) { e.preventDefault(); seek(e.keyCode === 37 ? -10 : 10); return; }
        if (document.activeElement.tagName === 'INPUT' && !search && (e.keyCode === 37 || e.keyCode === 39)) return;
        var root = modal ? $(modal) : !$('guide').hidden ? $('guide') : screen === 'player' ? $('player-controls') : $('shell');
        var controls = Array.prototype.filter.call(root.querySelectorAll(screen === 'web-login' ? 'button,input,iframe' : 'button,input,select'), function (n) { return !n.disabled && n.offsetWidth > 0 && getComputedStyle(n).visibility !== 'hidden'; });
        var from = document.activeElement.getBoundingClientRect(), x = from.left + from.width / 2, y = from.top + from.height / 2, best, score = Infinity;
        controls.forEach(function (n) { if (n === document.activeElement) return; var r = n.getBoundingClientRect(), dx = r.left + r.width / 2 - x, dy = r.top + r.height / 2 - y, primary = e.keyCode === 37 ? -dx : e.keyCode === 39 ? dx : e.keyCode === 38 ? -dy : dy, perpendicular = e.keyCode === 37 || e.keyCode === 39 ? Math.abs(dy) : Math.abs(dx); if (primary > 8 && primary + perpendicular * 3 < score) { best = n; score = primary + perpendicular * 3; } });
        if (best) { e.preventDefault(); focusControl(best); if(!best.classList.contains('library-card')&&!best.dataset.channel) best.scrollIntoView({block: 'nearest'}); }
    });
    document.addEventListener('visibilitychange', function () {
        if(document.hidden){cancelChannelOK();clearChannelNumber();pendingTune=null;closeGuide();if(screen==='player')backToChannels().catch(notice);}
        else if(screen!=='login'&&screen!=='web-login')rpc('status').then(function(status){if(!status.loggedIn)return start();syncClock();refreshPrograms();}).catch(notice);
    });
    // Session keepalive every 5–15 min, randomized per call; configuration reloads only on Refresh.
    (function keepAlive() { setTimeout(function () { if (!document.hidden) rpc('status').catch(function () {}); keepAlive(); }, 300000 + Math.random() * 600000); }());
    setInterval(function () { if (!document.hidden && channelItems.length) refreshPrograms(); }, 60000);
    setInterval(tick, 500);
    function start() { return officialLogin(undefined,undefined,true).catch(notice).then(function () { $('splash').hidden = true; }); }
    start();
}());
