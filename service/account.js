'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), promisify = require('util').promisify, vault = require('./vault');
module.exports = function (directory) {
    var read = promisify(fs.readFile), write = promisify(fs.writeFile), remove = promisify(fs.unlink);
    var keyFile = path.join(directory, 'account.key'), recordFile = path.join(directory, 'account.vault');
    function key() {
        return read(keyFile, 'utf8').then(function (value) { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('ACCOUNT_KEY'); return value; });
    }
    function sanitize(value) {
        if (!value || typeof value.username !== 'string' || !value.username.trim() || value.username.length > 256) throw new Error('INVALID_CREDENTIALS');
        var profile=value.profile;
        if(profile && (typeof profile.id!=='string'||!profile.id||profile.id.length>256||typeof profile.name!=='string'||profile.name.length>256))throw new Error('INVALID_PROFILE');
        var clean={username:value.username,profile:profile?{id:profile.id,name:profile.name}:null,remember:value.remember===true || value.remember===undefined && typeof value.password==='string' && !!value.password};
        if(clean.remember && value.password!==undefined){
            if(typeof value.password!=='string'||!value.password||value.password.length>1024)throw new Error('INVALID_CREDENTIALS');
            clean.password=value.password;
        }
        return clean;
    }
    var store = {
        load: function () { return read(recordFile, 'utf8').then(function (text) { if (text.length > 262144) throw new Error('VAULT_INVALID'); return key().then(function (secret) { return vault.open(JSON.parse(text), secret); }); }).then(sanitize).catch(function (error) { if (error.code === 'ENOENT') return null; throw error; }); },
        save: function (credentials) {
            try { credentials=sanitize(credentials); } catch(error){return Promise.reject(error);}
            return promisify(fs.mkdir)(directory, 448).catch(function (e) { if (e.code !== 'EEXIST') throw e; }).then(function () {
                return write(keyFile, crypto.randomBytes(32).toString('hex'), {mode: 384, flag: 'wx'}).catch(function (e) { if (e.code !== 'EEXIST') throw e; });
            }).then(key).then(function (secret) { return vault.seal(credentials, secret); }).then(function (record) {
                var temp = recordFile + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
                return write(temp, JSON.stringify(record), {mode: 384, flag: 'wx'}).then(function () { return promisify(fs.rename)(temp, recordFile); }).catch(function (error) { return remove(temp).catch(function () {}).then(function () { throw error; }); });
            });
        },
        signOut: function () { return store.load().then(function(saved){if(saved)return store.save({username:saved.username,profile:saved.profile,remember:false});}); },
        forget: function () { return remove(recordFile).catch(function (e) { if (e.code !== 'ENOENT') throw e; }); }
    };
    return store;
};
