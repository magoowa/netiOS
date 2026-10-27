'use strict';
// webOS 4.x runs services on Node 0.12, which lacks a few APIs the service relies on; webOS 5+ (Node 8) has them all.
var url = require('url'), util = require('util');
if (!Object.assign) Object.assign = function (target) {
    for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; if (source != null) for (var key in source) if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key]; }
    return target;
};
if (!Array.prototype.find) Object.defineProperty(Array.prototype, 'find', {configurable: true, writable: true, value: function (test, self) {
    for (var i = 0; i < this.length; i++) if (test.call(self, this[i], i, this)) return this[i];
}});
// Node 4.0-4.4 inherits Uint8Array.from as Buffer.from, which ignores encodings.
if (!Buffer.from || Buffer.from === Uint8Array.from) Buffer.from = function (value, encoding) { return new Buffer(value, encoding); };
if (!util.promisify) util.promisify = function (fn) {
    return function () {
        var self = this, args = Array.prototype.slice.call(arguments);
        return new Promise(function (resolve, reject) { fn.apply(self, args.concat(function (error, value) { if (error) reject(error); else resolve(value); })); });
    };
};
// Only the parts of WHATWG URL the provider uses: absolute URLs, the read-only parts and a writable protocol.
if (!url.URL) url.URL = function URL(value) {
    var parsed = url.parse(String(value));
    if (!parsed.protocol || !parsed.hostname) throw new TypeError('Invalid URL');
    var auth = (parsed.auth || '').split(':');
    this.protocol = parsed.protocol; this.hostname = parsed.hostname; this.port = parsed.port || '';
    this.username = auth[0] || ''; this.password = auth.slice(1).join(':');
    this.pathname = parsed.pathname || '/'; this.search = parsed.search || ''; this.hash = parsed.hash || '';
};
url.URL.prototype.toString = function () {
    return url.format({protocol: this.protocol, slashes: true, auth: this.username ? this.username + (this.password ? ':' + this.password : '') : null,
        hostname: this.hostname, port: this.port || null, pathname: this.pathname, search: this.search, hash: this.hash});
};
