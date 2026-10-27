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
// Node 0.12's built-in root list (2015) lacks DigiCert Global Root G2, which signs Netia's API, so every request failed with
// SELF_SIGNED_CERT_IN_CHAIN. There, HTTPS trusts the TV's own, current system bundle instead; verification stays on.
if (/^v0\./.test(process.version)) {
    var bundle = null;
    try { bundle = require('fs').readFileSync('/etc/ssl/certs/ca-certificates.crt', 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g); } catch (error) { bundle = null; }
    if (bundle && bundle.length) {
        var https = require('https'), request = https.request;
        https.request = function (options, callback) {
            if (options && typeof options === 'object' && !options.ca) options = Object.assign({}, options, {ca: bundle});
            return request.call(https, options, callback);
        };
    }
}
// Polish, case-insensitive, numeric-aware comparison. webOS 4's Node is built without Intl, so there it orders Polish
// letters after their base letter and compares digit runs as numbers (the order Intl.Collator('pl', base, numeric) gives).
exports.compare = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('pl', {sensitivity: 'base', numeric: true}).compare : function (a, b) {
    function parts(value) {
        // Polish letters sort right after their base letter (ą after a, ź before ż): base + a character above 'z'.
        return String(value).toLowerCase().replace(/[ąćęłńóśźż]/g, function (c) { return ['a{', 'c{', 'e{', 'l{', 'n{', 'o{', 's{', 'z{', 'z|']['ąćęłńóśźż'.indexOf(c)]; }).match(/\d+|\D+/g) || [];
    }
    var x = parts(a), y = parts(b);
    for (var i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] === y[i]) continue;
        var nx = /^\d/.test(x[i]), ny = /^\d/.test(y[i]);
        if (nx && ny) return Number(x[i]) - Number(y[i]) || x[i].length - y[i].length;
        return x[i] < y[i] ? -1 : 1;
    }
    return x.length - y.length;
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
