(function (root) {
    'use strict';
    var strings = typeof module !== 'undefined' ? require('./strings.json') : root.NETIOS_STRINGS;
    function text(key, values) {
        if (typeof strings[key] !== 'string') throw new Error('MISSING_TEXT_' + key);
        return strings[key].replace(/\{(\w+)\}/g, function (match, name) { return values && values[name] !== undefined ? String(values[name]) : match; });
    }
    if (typeof module !== 'undefined') module.exports = text;
    else {
        root.T = text;
        ['text', 'placeholder', 'label', 'title', 'alt', 'href'].forEach(function (kind) {
            Array.prototype.forEach.call(document.querySelectorAll('[data-' + kind + ']'), function (node) {
                var value = text(node.getAttribute('data-' + kind));
                if (kind === 'text') node.textContent = value;
                else node.setAttribute(kind === 'label' ? 'aria-label' : kind, value);
            });
        });
    }
}(this));
