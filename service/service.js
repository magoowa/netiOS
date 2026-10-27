'use strict';
require('./compat');
var Service = require('webos-service');
var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var promisify = require('util').promisify;
var vault = require('./vault');
var Provider = require('./provider').Provider;
var APP = 'com.netiago.webos';
var service = new Service(APP + '.service');
var provider = new Provider();
var storage = '/media/internal/' + APP;
var account = require('./account')(storage);
var userConfig = require('./user-config')(storage);
var file = path.join(storage, 'credentials.vault');
var read = promisify(fs.readFile), write = promisify(fs.writeFile), rename = promisify(fs.rename), unlink = promisify(fs.unlink);
var activity, lastSeen = Date.now(), credentials = null, rememberedProfile = null, busy = false;

function own(sender) { return sender === APP || sender === APP + '.service'; }
function clearMemory() { provider.clear(); credentials = null; rememberedProfile = null; }
function keepAlive() {
    lastSeen = Date.now();
    if (!activity) service.activityManager.create('account-session', function (a) { activity = a; });
}
setInterval(function () {
    if (activity && !provider.auth && Date.now() - lastSeen > 60000) {
        clearMemory(); service.activityManager.complete(activity, function () {}); activity = null;
    }
}, 15000).unref();
function register(name, action, mutates) {
    service.register(name, function (message) {
        if (!own(message.sender)) return message.respond({returnValue: false, errorCode: 'FORBIDDEN'});
        if (mutates && busy) return message.respond({returnValue: false, errorCode: 'BUSY'});
        if (mutates) busy = true;
        keepAlive();
        Promise.resolve().then(function () { return action(message.payload || {}); }).then(function (data) {
            if (mutates) busy = false;
            message.respond({returnValue: true, data: data === undefined ? null : data});
        }, function (error) {
            if (mutates) busy = false;
            var code = /^[A-Z_0-9-]+$/.test(error.message) ? error.message : 'INTERNAL_ERROR';
            message.respond({returnValue: false, errorCode: code});
        });
    });
}
register('status', function () {
    return read(file).then(function () { return true; }, function (e) { if (e.code === 'ENOENT') return false; throw new Error('VAULT_READ'); }).then(function (saved) { return {loggedIn: !!provider.auth, saved: saved, rememberedProfile: rememberedProfile, catalogueTotal: provider.catalogueTotal, playbackDiagnostic: provider.playbackDiagnostic || null, preferenceKey: provider.auth && provider.auth.profileId ? crypto.createHash('sha256').update((provider.auth.accountKey || (credentials ? credentials.username : '')) + '\0' + provider.auth.profileId).digest('hex') : null}; });
});
// Diagnostics: service memory and the size of its own files (account record, configuration); no file contents.
register('resources', function () {
    var readdir = promisify(fs.readdir), stat = promisify(fs.stat);
    return readdir(storage).catch(function () { return []; }).then(function (names) {
        return Promise.all(names.map(function (name) { return stat(path.join(storage, name)).then(function (info) { return info.isFile() ? info.size : 0; }, function () { return 0; }); }));
    }).then(function (sizes) {
        var memory = process.memoryUsage();
        return {rss: memory.rss, heap: memory.heapUsed, storage: sizes.reduce(function (sum, size) { return sum + size; }, 0)};
    });
});
// Performance panel: whole-TV CPU load from /proc/stat between two calls, RAM from /proc/meminfo, and this service's own
// memory. Anything the system does not expose is returned as null and shown as N/D, never estimated.
var cpuSample = null;
register('performance', function () {
    return Promise.all([read('/proc/stat', 'utf8').catch(function () { return null; }), read('/proc/meminfo', 'utf8').catch(function () { return null; })]).then(function (files) {
        var cpu = null, memory = null, stat = files[0] && /^cpu\s+([\d\s]+)/.exec(files[0]), info = files[1];
        if (stat) {
            var ticks = stat[1].trim().split(/\s+/).map(Number), idle = ticks[3] + (ticks[4] || 0), total = ticks.reduce(function (sum, value) { return sum + value; }, 0);
            if (cpuSample && total > cpuSample.total) cpu = Math.max(0, Math.min(100, Math.round(100 * (1 - (idle - cpuSample.idle) / (total - cpuSample.total)))));
            cpuSample = {idle: idle, total: total};
        }
        var totalMatch = info && /MemTotal:\s+(\d+)/.exec(info), availableMatch = info && /MemAvailable:\s+(\d+)/.exec(info);
        if (totalMatch && availableMatch) memory = {total: Number(totalMatch[1]) * 1024, available: Number(availableMatch[1]) * 1024};
        return {cpu: cpu, memory: memory, serviceRss: process.memoryUsage().rss};
    });
});
register('login', function (p) { clearMemory(); return provider.login(p.username, p.password, p.captcha).then(function () { credentials = {username: p.username, password: p.password}; return true; }); }, true);
register('rememberedAccount', function () { return account.load().then(function (saved) { rememberedProfile = saved && saved.profile ? saved.profile.id : null; return saved; }); });
// One-time session handed over from a browser where the user logged in at go.netia.pl (tools/installer, -ImportSession):
// the official form cannot run on webOS 4's Chromium 53. The file is removed on first read; acceptFrameSession validates it.
register('importedSession', function () {
    var imported = path.join(storage, 'import-session.json');
    return read(imported, 'utf8').then(function (text) {
        return unlink(imported).then(function () {
            var data; try { data = text.length <= 65536 && JSON.parse(text); } catch (error) { data = null; }
            if (!data || typeof data !== 'object') throw new Error('INVALID_SESSION');
            return {session: data.session, clientId: data.clientId, deviceId: data.deviceId};
        });
    }, function (error) { if (error.code === 'ENOENT') return null; throw new Error('IMPORT_READ'); });
}, true);
register('acceptFrameSession', function (p) {
    if ((p.username !== undefined || p.password !== undefined) && (typeof p.username !== 'string' || !p.username.trim() || p.username.length > 256 || p.password !== undefined && (typeof p.password !== 'string' || !p.password || p.password.length > 1024))) throw new Error('INVALID_CREDENTIALS');
    if(p.remember!==undefined && typeof p.remember!=='boolean')throw new Error('INVALID_CREDENTIALS');
    clearMemory();
    return provider.acceptFrameSession(p).then(function () {
        return account.load().then(function (saved) {
            credentials = p.username === undefined ? saved && {username: saved.username, password: saved.password} : {username: p.username, password: p.password};
            var profile = saved && credentials && saved.username === credentials.username ? saved.profile : null;
            rememberedProfile = profile ? profile.id : null;
            var remember=p.remember===undefined?!!(saved && saved.remember):p.remember;
            if(remember && credentials && !credentials.password && saved && saved.username===credentials.username && saved.password)credentials.password=saved.password;
            var persist=credentials ? account.save(Object.assign({}, credentials, {profile: profile,remember:remember})) : Promise.resolve();
            return persist.then(function(){if(!remember)return unlink(file).catch(function(error){if(error.code!=='ENOENT')throw error;});}).then(function(){return true;});
        });
    });
}, true);
register('profiles', function () { return provider.profiles(); });
register('profilePreference', function () { return account.load().then(function (saved) { return saved && saved.profile || null; }); });
register('selectProfile', function (p) {
    return provider.profiles().then(function (items) {
        var profile = items.find(function (item) { return item.id === p.id; });
        if (!profile) throw new Error('INVALID_PROFILE');
        return provider.select(p.id).then(function () {
            rememberedProfile = p.remember === true ? p.id : null;
            return account.load().then(function (saved) { if (!saved) return true; return account.save(Object.assign({}, saved, {profile: p.remember === true ? profile : null})).then(function () { return true; }); });
        });
    });
}, true);
register('channels', function () { return provider.list(); });
register('userConfig', function(p){return userConfig(p.defaults);});
register('catalog', function(p){return provider.catalog(p.kind,p.id,p.offset===undefined?0:p.offset);});
register('catalogArtwork', function(p){return provider.catalogArtwork(p.kind,p.id);});
register('catalogDetails', function(p){return provider.catalogDetails(p.kind,p.id,p.refresh===true);});
register('programs', function (p) { return provider.programs(p.id, p.date); });
register('clock', function () {
    return provider.rpc('system', 'getConfiguration', {}, true).then(function () {
        if (!provider.clockSample) throw new Error('CLOCK_UNAVAILABLE');
        var elapsed = process.hrtime(provider.clockSample.at);
        return {epoch: provider.clockSample.epoch + elapsed[0] * 1000 + elapsed[1] / 1000000};
    });
});
register('play', function (p) { return provider.play(p.id, {widevine: p.widevine, userAgent: p.userAgent}, p.kind); }, true);
register('license', function (p) { return provider.license(p.challenge); });
register('stop', function () { provider.playing = null; provider.generation++; return true; }, true);
register('save', function (p) {
    if (!provider.auth || !credentials) throw new Error('LOGIN_REQUIRED');
    return vault.seal({identity: provider.identity, auth: provider.auth, credentials: credentials, rememberedProfile: rememberedProfile}, p.passphrase).then(function (record) {
        return promisify(fs.mkdir)(storage, 448).catch(function (e) { if (e.code !== 'EEXIST') throw e; }).then(function () {
            var temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
            return write(temp, JSON.stringify(record), {mode: 384, flag: 'wx'}).then(function () {
                return promisify(fs.open)(temp, 'r+').then(function (fd) {
                    return promisify(fs.fsync)(fd).then(function () { return promisify(fs.close)(fd); }, function (e) { return promisify(fs.close)(fd).then(function () { throw e; }); });
                });
            }).then(function () { return rename(temp, file); }).catch(function (e) { return unlink(temp).catch(function () {}).then(function () { throw e; }); });
        });
    }).then(function () { return true; });
}, true);
register('unlock', function (p) {
    clearMemory();
    return read(file, 'utf8').then(function (text) { if (text.length > 262144) throw new Error('VAULT_INVALID'); return vault.open(JSON.parse(text), p.passphrase); }).then(function (data) {
        credentials = data.credentials; rememberedProfile = data.rememberedProfile;
        if (data.auth.session.keyExpirationTime * 1000 <= Date.now()) {
            provider.identity = data.identity;
            return provider.login(credentials.username, credentials.password);
        }
        provider.importSession(Object.assign({}, data.auth, {identity: data.identity}));
        return provider.rpc('auth', 'getSession', {}).then(function (auth) { provider.importSession(auth); return true; });
    }).catch(function (e) { clearMemory(); throw e; });
}, true);
register('logout', function () {
    var revoke = provider.auth ? provider.rpc('auth', 'logout', {}).catch(function () {}) : Promise.resolve();
    clearMemory();
    return account.signOut().then(function () { return unlink(file); }).catch(function (e) { if (e.code !== 'ENOENT') throw new Error('VAULT_DELETE'); }).then(function () { return revoke; }).then(function () { return true; });
}, true);
register('lock', function () { clearMemory(); return true; }, true);
