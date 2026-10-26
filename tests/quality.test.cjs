'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const highestQuality = require('../app/quality');
test('highest quality prefers resolution, then bitrate, without changing the supplied tracks', () => {
    const tracks = [{id: 1, height: 720, width: 1280, bandwidth: 9000000}, {id: 2, height: 1080, width: 1920, bandwidth: 3000000}, {id: 3, height: 1080, width: 1920, bandwidth: 6000000}];
    assert.equal(highestQuality(tracks).id, 3);
    assert.deepEqual(tracks.map(t => t.id), [1, 2, 3]);
    assert.equal(highestQuality([]), null);
});
