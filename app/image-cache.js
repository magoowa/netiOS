(function () {
    'use strict';
    var pending = new Map(), memory = new Map(), queue = [], active = 0, disk = null, entries = new Map(), bytes = 0, writes = Promise.resolve();
    // Channel logos plus series and show thumbnails must fit together, or browsing a catalogue evicts the logos.
    var limit = 128 * 1024 * 1024, maxEntries = 2000, indexKey = 'netios-images-index', indexTimer = null;
    function readIndex() {
        try { var value = JSON.parse(localStorage.getItem(indexKey)); return value && typeof value === 'object' ? value : {}; } catch (error) { return {}; }
    }
    function saveIndex() {
        clearTimeout(indexTimer);
        indexTimer = setTimeout(function () {
            var value = {}; entries.forEach(function (size, url) { value[url] = size; });
            try { localStorage.setItem(indexKey, JSON.stringify(value)); } catch (error) {}
        }, 2000);
    }
    function open() {
        // Sizes come from a saved index; only entries missing from it are read, so startup does not open every image.
        if (!disk && typeof caches === 'undefined') disk = Promise.reject(new Error('CACHE_UNAVAILABLE'));
        if (!disk) disk = caches.open('netios-images-v1').then(function (cache) {
            var index = readIndex(), missing = false;
            return cache.keys().then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    if (typeof index[key.url] === 'number') { entries.set(key.url, index[key.url]); bytes += index[key.url]; return; }
                    missing = true;
                    return cache.match(key).then(function (response) {
                        var size = response && Number(response.headers.get('x-netios-size')) || 0;
                        entries.set(key.url, size); bytes += size;
                    });
                }));
            }).then(function () { if (missing || Object.keys(index).length !== entries.size) saveIndex(); return cache; });
        });
        return disk;
    }
    function store(cache, url, blob) {
        writes = writes.catch(function () {}).then(function () {
            return cache.put(url, new Response(blob, {headers: {'Content-Type': blob.type, 'x-netios-size': String(blob.size)}})).then(function () {
                bytes += blob.size - (entries.get(url) || 0); entries.delete(url); entries.set(url, blob.size);
                var remove = [];
                while (bytes > limit || entries.size > maxEntries) {
                    var oldest = entries.keys().next().value;
                    bytes -= entries.get(oldest); entries.delete(oldest); remove.push(cache.delete(oldest));
                }
                saveIndex();
                return Promise.all(remove);
            });
        });
        return writes.catch(function () {});
    }
    // Provider artwork arrives far larger than shown (channel logos are 2000×1125 for a 180 px tile); decoding that on
    // first paint stalls scrolling for hundreds of milliseconds. Images are shrunk once to the requested width and kept.
    // Channel logos are drawn inside a 16:9 canvas with transparent margins of varying size; trim removes them so every
    // logo can be sized by its visible shape.
    // createImageBitmap is the fast path; where it is missing or refuses the file, an <img> decodes it instead.
    function decode(blob) {
        var element = function () {
            return new Promise(function (resolve, reject) {
                var image = new Image(), address = URL.createObjectURL(blob);
                image.onload = function () { URL.revokeObjectURL(address); resolve({width: image.naturalWidth, height: image.naturalHeight, source: image}); };
                image.onerror = function () { URL.revokeObjectURL(address); reject(new Error('IMAGE_DECODE')); };
                image.src = address;
            });
        };
        if (typeof createImageBitmap !== 'function') return element();
        return createImageBitmap(blob).then(function (bitmap) { return {width: bitmap.width, height: bitmap.height, source: bitmap, close: function () { if (bitmap.close) bitmap.close(); }}; }, element);
    }
    function shrink(blob, width, trim) {
        if (!width && !trim) return Promise.resolve(blob);
        return decode(blob).then(function (decoded) {
            var bitmap = {width: decoded.width, height: decoded.height, close: decoded.close}, source = decoded.source;
            if (!trim && bitmap.width <= width) { if (bitmap.close) bitmap.close(); return blob; }
            var scale = width ? Math.min(1, width / bitmap.width) : 1, canvas = document.createElement('canvas'), context;
            canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            context = canvas.getContext('2d'); context.imageSmoothingQuality = 'high'; context.drawImage(source, 0, 0, canvas.width, canvas.height); if (bitmap.close) bitmap.close();
            if (trim) {
                var pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, left = canvas.width, top = canvas.height, right = -1, bottom = -1, x, y;
                for (y = 0; y < canvas.height; y++) for (x = 0; x < canvas.width; x++) if (pixels[(y * canvas.width + x) * 4 + 3] > 8) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; bottom = y; }
                if (right >= left) {
                    var cropped = document.createElement('canvas'); cropped.width = right - left + 1; cropped.height = bottom - top + 1;
                    cropped.getContext('2d').drawImage(canvas, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height); canvas = cropped;
                }
            }
            return new Promise(function (resolve) { canvas.toBlob(function (small) { resolve(small && small.size && /^image\//.test(small.type) ? small : blob); }, 'image/webp', 0.92); });
        }).catch(function () { return blob; });
    }
    function dataURL(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader(); reader.onload = function () { resolve(reader.result); }; reader.onerror = reject; reader.readAsDataURL(blob);
        });
    }
    function fetchImage(url) {
        // Chromium before 66 (webOS 4) has no AbortController: there the timeout only stops waiting for the reply.
        var controller = typeof AbortController === 'function' ? new AbortController() : null, timeout;
        var expired = new Promise(function (resolve, reject) { timeout = setTimeout(function () { if (controller) controller.abort(); reject(new Error('IMAGE_TIMEOUT')); }, 15000); });
        var options = {credentials: 'omit'}; if (controller) options.signal = controller.signal;
        return Promise.race([fetch(url, options).then(function (reply) {
            if (!reply.ok || !/^image\//i.test(reply.headers.get('content-type') || '')) throw new Error('IMAGE_RESPONSE');
            return reply.blob();
        }), expired]).then(function (blob) {
            clearTimeout(timeout); if (blob.size > 4 * 1024 * 1024) throw new Error('IMAGE_SIZE'); return blob;
        }, function (error) { clearTimeout(timeout); throw error; });
    }
    function download(job) {
        var cache, url = job.url, key = job.key;
        return open().catch(function () { return null; }).then(function (value) {
            cache = value; return cache && cache.match(key);
        }).then(function (response) {
            if (response) {
                // Recently shown images move to the end, so eviction removes the least recently used ones first.
                if (entries.has(key)) { var size = entries.get(key); entries.delete(key); entries.set(key, size); }
                return response.blob();
            }
            // A full-size copy from an older version is shrunk instead of downloaded again, then dropped.
            var original = cache && key !== url && entries.has(url) ? cache.match(url).then(function (copy) { return copy ? copy.blob() : fetchImage(url); }) : fetchImage(url);
            return original.then(function (blob) { return shrink(blob, job.width, job.trim); }).then(function (blob) {
                if (cache && key !== url && entries.has(url)) { bytes -= entries.get(url); entries.delete(url); cache.delete(url); }
                return (cache ? store(cache, key, blob) : Promise.resolve()).then(function () { return blob; });
            });
        }).then(dataURL);
    }
    function pump() {
        while (active < 4 && queue.length) {
            var job = queue.shift(); active++;
            (function (job) {
                download(job).then(function (src) {
                    // Enough for every channel logo, so switching profiles shows them without reading the cache again.
                    memory.set(job.key, src); if (memory.size > 256) memory.delete(memory.keys().next().value); job.resolve(src);
                }, function () { job.resolve(job.url); }).then(function () { pending.delete(job.key); active--; pump(); });
            }(job));
        }
    }
    // Cache API keys ignore URL fragments, so the width is a query parameter; the key is never fetched.
    function cacheKey(url, width, trim) { var extra = (width ? 'netios-width=' + width : '') + (trim ? (width ? '&' : '') + 'netios-trim=1' : ''); return extra ? url + (url.indexOf('?') < 0 ? '?' : '&') + extra : url; }
    window.NetiosImages = {discard: function (url, width, trim) {
        var key = cacheKey(url, width, trim); memory.delete(key); if (!entries.has(key)) return Promise.resolve();
        bytes -= entries.get(key); entries.delete(key); saveIndex(); return open().then(function (cache) { return cache.delete(key); }).catch(function () {});
    }, usage: function () {
        if (typeof caches === 'undefined') return Promise.resolve({files: 0, bytes: 0});
        return open().then(function () { return {files: entries.size, bytes: bytes}; }, function () { return {files: 0, bytes: 0}; });
    }, source: function (url, width, trim) {
        try {
            var parsed = new URL(url);
            if (parsed.protocol !== 'https:' || !/(^|\.)pluscdn\.pl$/.test(parsed.hostname) || parsed.username || parsed.password || parsed.port && parsed.port !== '443') return Promise.resolve(url);
        } catch (error) { return Promise.resolve(url); }
        var key = cacheKey(url, width, trim);
        if (memory.has(key)) return Promise.resolve(memory.get(key));
        if (!pending.has(key)) pending.set(key, new Promise(function (resolve) { queue.push({url: url, key: key, width: width || 0, trim: !!trim, resolve: resolve}); }));
        var result = pending.get(key); pump(); return result;
    }};
    // Loaded channel and catalogue lists, kept per profile so the next launch shows them without waiting for Netia.
    function dataRequest(key) { return 'https://netios.invalid/data/' + encodeURIComponent(key); }
    function dataCache() { return typeof caches === 'undefined' ? Promise.reject(new Error('CACHE_UNAVAILABLE')) : caches.open('netios-data-v1'); }
    window.NetiosData = {get: function (key) {
        return dataCache().then(function (cache) { return cache.match(dataRequest(key)); }).then(function (response) { return response ? response.json() : null; }).catch(function () { return null; });
    }, set: function (key, value) {
        var text = JSON.stringify({at: Date.now(), value: value});
        return dataCache().then(function (cache) { return cache.put(dataRequest(key), new Response(text, {headers: {'Content-Type': 'application/json', 'x-netios-size': String(text.length)}})); }).catch(function () {});
    }, remove: function (key) {
        return dataCache().then(function (cache) { return cache.delete(dataRequest(key)); }).catch(function () {});
    }, clear: function () {
        return typeof caches === 'undefined' ? Promise.resolve() : caches.delete('netios-data-v1').catch(function () {});
    }, usage: function () {
        return dataCache().then(function (cache) {
            return cache.keys().then(function (keys) { return Promise.all(keys.map(function (key) { return cache.match(key).then(function (response) { return response && Number(response.headers.get('x-netios-size')) || 0; }); })); });
        }).then(function (sizes) { return sizes.reduce(function (sum, size) { return sum + size; }, 0); }, function () { return 0; });
    }};
}());
