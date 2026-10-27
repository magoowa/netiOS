'use strict';
require('./compat');
var crypto = require('crypto');
var ITERATIONS = 600000;
function derive(passphrase, salt) {
    if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 256) {
        return Promise.reject(new Error('VAULT_PASSPHRASE'));
    }
    return new Promise(function (resolve, reject) {
        crypto.pbkdf2(passphrase, salt, ITERATIONS, 32, 'sha256', function (error, key) {
            if (error) reject(new Error('VAULT_CRYPTO')); else resolve(key);
        });
    });
}
exports.seal = function (value, passphrase) {
    var salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
    return derive(passphrase, salt).then(function (key) {
        try {
            var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            cipher.setAAD(Buffer.from('netiago-vault-v1'));
            var data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
            return {version: 1, iterations: ITERATIONS, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64')};
        } finally { key.fill(0); }
    });
};
exports.open = function (record, passphrase) {
    if (!record || record.version !== 1 || record.iterations !== ITERATIONS || typeof record.data !== 'string' || record.data.length > 131072) return Promise.reject(new Error('VAULT_INVALID'));
    var salt = Buffer.from(record.salt || '', 'base64'), iv = Buffer.from(record.iv || '', 'base64'), tag = Buffer.from(record.tag || '', 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16) return Promise.reject(new Error('VAULT_INVALID'));
    return derive(passphrase, salt).then(function (key) {
        try {
            var cipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            cipher.setAAD(Buffer.from('netiago-vault-v1'));
            cipher.setAuthTag(tag);
            return JSON.parse(Buffer.concat([cipher.update(Buffer.from(record.data, 'base64')), cipher.final()]).toString('utf8'));
        } catch (error) { throw new Error('VAULT_UNLOCK'); }
        finally { key.fill(0); }
    });
};
