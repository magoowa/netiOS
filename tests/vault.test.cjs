'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vault = require('../service/vault');
test('vault round trip, independent salt/nonce and no plaintext in stored record', async () => {
    const data = {username: 'synthetic-account', password: 'synthetic-secret'};
    const a = await vault.seal(data, 'synthetic vault passphrase');
    const b = await vault.seal(data, 'synthetic vault passphrase');
    assert.notEqual(a.salt, b.salt); assert.notEqual(a.iv, b.iv);
    assert.equal(JSON.stringify(a).includes(data.password), false);
    assert.equal(JSON.stringify(a).includes(data.username), false);
    assert.deepEqual(await vault.open(a, 'synthetic vault passphrase'), data);
    await assert.rejects(vault.open(a, 'wrong synthetic passphrase'), /VAULT_UNLOCK/);
    const bytes = Buffer.from(a.data, 'base64'); bytes[0] ^= 1;
    await assert.rejects(vault.open({...a, data: bytes.toString('base64')}, 'synthetic vault passphrase'), /VAULT_UNLOCK/);
});
test('invalid parameters are rejected before expensive key derivation', async () => {
    await assert.rejects(vault.seal({}, '1234'), /VAULT_PASSPHRASE/);
    await assert.rejects(vault.open({version: 1, iterations: 1}, 'synthetic vault passphrase'), /VAULT_INVALID/);
});
