(function (root) {
    'use strict';
    function preferences(value) {
        value = value || {};
        function ids(items) { return Array.isArray(items) ? items.filter(function (id, i) { return typeof id === 'string' && id.length <= 128 && items.indexOf(id) === i; }).slice(0, 2000) : []; }
        var sorts=value.librarySort||{},channelSort=value.channelSort||{},allowed=['alphabetical','thematic','favorites-first'],legacy=allowed.indexOf(value.sort)>=0?value.sort:'alphabetical';
        return {favorites: ids(value.favorites), hidden: ids(value.hidden), sort:legacy,channelSort:{all:allowed.indexOf(channelSort.all)>=0?channelSort.all:legacy,favorites:allowed.indexOf(channelSort.favorites)>=0?channelSort.favorites:legacy,hidden:allowed.indexOf(channelSort.hidden)>=0?channelSort.hidden:legacy}, librarySort:{series:sorts.series==='genres'?'genres':'alphabetical',shows:sorts.shows==='genres'?'genres':'alphabetical'}, subtitleSize: [50, 75, 100, 150, 200].indexOf(value.subtitleSize) >= 0 ? value.subtitleSize : 100};
    }
    function channels(items, prefs, mode) {
        var compare=new Intl.Collator('pl',{sensitivity:'base',numeric:true}).compare;
        function name(c){return String(c.title||'').replace(/\s+(?:(?:SD|HD|FHD|UHD|4K|8K)\s*)+$/i,'').trim();}
        return items.filter(function (c) { return mode === 'hidden' ? prefs.hidden.indexOf(c.id) >= 0 : prefs.hidden.indexOf(c.id) < 0 && (mode !== 'favorites' || prefs.favorites.indexOf(c.id) >= 0); }).sort(function(a,b){
            var priority=prefs.sort==='favorites-first'?(prefs.favorites.indexOf(b.id)>=0)-(prefs.favorites.indexOf(a.id)>=0):prefs.sort==='thematic'?compare(a.category||'\uffff',b.category||'\uffff'):0;
            return priority||compare(name(a),name(b))||compare(a.title,b.title)||compare(a.id,b.id);
        });
    }
    function fold(text) { return String(text || '').toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l'); }
    function playbackTime(seconds){
        if(!Number.isFinite(seconds)||seconds<0)return null;
        seconds=Math.floor(seconds);
        return [Math.floor(seconds/3600),Math.floor(seconds%3600/60),seconds%60].map(function(value){return String(value).padStart(2,'0');}).join(':');
    }
    function episodeTitle(title,parent,count){
        var value=title.trim(),prefix=(parent||'').trim();
        if(!prefix)return title;
        var words=prefix.split(/[\s.,…:;!?"'’„”«»()\[\]{}\/–—-]+/).filter(Boolean);
        if(!words.length)return title;
        var separator='[\\s.,…:;!?"\'’„”«»()\\[\\]{}\\/–—-]',pattern=new RegExp('^'+words.map(function(word){return word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join(separator+'+'),'i'),match;
        while((match=value.match(pattern))){
            var rest=value.slice(match[0].length),edition=rest.replace(/^\s+\d+\s*[:–—-]\s*(?=(?:odcinek|odc\.|epizod|część|sezon)(?:\s|\d|$))/i,'');
            if(edition!==rest)rest=edition;
            else if(!/^\s*[.,…:;!?"'’„”«»()\[\]{}\/–—-]/.test(rest)&&!/^\s+(?:odcinek|odc\.|epizod|część|sezon)(?:\s|\d|$)/i.test(rest))break;
            rest=rest.replace(new RegExp('^'+separator+'+'),'');if(!rest)break;value=rest;
        }
        if(!value||value===title.trim()||count===1&&/^\d+$/.test(value))return title;
        return value.charAt(0).toLocaleUpperCase('pl')+value.slice(1);
    }
    function seasonNumber(item){return item.season&&Number.isInteger(item.season.number)&&item.season.number>=0?item.season.number:Infinity;}
    function catalogue(items,sort){var compare=new Intl.Collator('pl',{sensitivity:'base',numeric:true}).compare;return items.slice().sort(function(a,b){return (sort==='seasons'?seasonNumber(a)-seasonNumber(b)||(Number.isInteger(a.episodeNumber)?a.episodeNumber:Infinity)-(Number.isInteger(b.episodeNumber)?b.episodeNumber:Infinity):sort==='genres'?compare((a.genres||[])[0]||'\uffff',(b.genres||[])[0]||'\uffff'):0)||compare(a.title,b.title)||compare(a.id,b.id);});}
    function catalogueGroups(items,sort){
        var groups=[];
        catalogue(items,sort).forEach(function(item){
            var key=sort==='genres'?(item.genres||[])[0]||'':sort==='seasons'?(Number.isFinite(seasonNumber(item))?String(seasonNumber(item)):''):'';
            var group=groups[groups.length-1];
            if(!group||group.key!==key){group={key:key,items:[]};groups.push(group);}
            group.items.push(item);
        });
        return groups;
    }
    function search(items, query) {
        var words = fold(query).trim().split(/\s+/).filter(Boolean);
        return items.filter(function (item) { var text = fold((item.title || '') + ' ' + (item.description || '') + ' ' + (item.channelTitle || '')); return words.every(function (word) { return text.indexOf(word) >= 0; }); });
    }
    function seek(value, range) { return Number.isFinite(value) && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end >= range.start ? Math.max(range.start, Math.min(range.end, value)) : null; }
    function at(items, time) { return items.find(function (item) { return item.start <= time && time < item.end; }) || null; }
    function buffer(range, playheadEpoch, currentTime) {
        if (!range || !Number.isFinite(playheadEpoch) || !Number.isFinite(currentTime) || !Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) return null;
        var origin = playheadEpoch - currentTime * 1000;
        return {start: origin + range.start * 1000, end: origin + range.end * 1000, origin: origin};
    }
    // Position (s) of a programme start in the live buffer. A programme that began before the buffer but still runs inside
    // it (end after the buffer start) starts at the earliest buffered moment; one that ended before the buffer is null.
    function programmePosition(start, window, end) {
        if (!window || !Number.isFinite(start)) return null;
        if (start >= window.start && start < window.end) return (start - window.origin) / 1000;
        return start < window.start && Number.isFinite(end) && end > window.start ? (window.start - window.origin) / 1000 : null;
    }
    function segments(items, window) {
        if (!window) return [];
        return items.filter(function (p) { return p.end > window.start && p.start < window.end; }).map(function (p) { return {title:p.title, start:Math.max(p.start,window.start), left:(Math.max(p.start,window.start)-window.start)/(window.end-window.start)*100, width:(Math.min(p.end,window.end)-Math.max(p.start,window.start))/(window.end-window.start)*100}; });
    }
    // A list saved by NetiosData: its items while younger than maxAge, otherwise null (absent, empty, malformed or expired).
    function savedList(saved, maxAge, now) {
        var items = saved && saved.value && saved.value.items;
        return Array.isArray(items) && items.length && Number.isFinite(saved.at) && now - saved.at >= 0 && now - saved.at < maxAge ? items : null;
    }
    var model = {preferences: preferences, savedList: savedList, channels: channels, catalogue:catalogue, catalogueGroups:catalogueGroups, episodeTitle:episodeTitle, playbackTime:playbackTime, search: search, seek: seek, at: at, buffer:buffer, programmePosition:programmePosition, segments:segments};
    if (typeof module !== 'undefined') module.exports = model; else root.TVModel = model;
}(this));
