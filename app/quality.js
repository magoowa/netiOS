'use strict';
function highestQuality(tracks) {
    return tracks.slice().sort(function (a, b) {
        return (b.height || 0) - (a.height || 0) || (b.width || 0) - (a.width || 0) || (b.bandwidth || 0) - (a.bandwidth || 0);
    })[0] || null;
}
if (typeof module !== 'undefined') module.exports = highestQuality;
