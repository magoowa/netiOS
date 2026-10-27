'use strict';
require('./compat');
var https = require('https');
var crypto = require('crypto');
var URL = require('url').URL;
function mediaUrl(value, allowRedirector) {
    try {
        var url = new URL(value);
        if (!/^https?:$/.test(url.protocol) || !(/(^|\.)pluscdn\.pl$/.test(url.hostname) || allowRedirector === true && url.hostname === 'redirector.redefine.pl') || url.username || url.password || (url.port && url.port !== '443')) return null;
        url.protocol = 'https:';
        return url.toString();
    } catch (error) { return null; }
}
function logoUrl(channel) {
    var images = (channel.gallery || []).filter(function (image) { var p = image.customParams || {}; return p.appTheme === 'dark' && p.backgroundEffect === 'transparent'; });
    var image = images.find(function (i) { return i.aspect && i.aspect.width === 16; }) || images[0];
    return image && mediaUrl(image.src) || null;
}
function program(item, channel) {
    var start = Date.parse(item.startTime), end = Date.parse(item.endTime);
    if (typeof item.title !== 'string' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return {id: String(item.id || ''), channelId: channel.id, channelTitle: channel.title, title: item.title.slice(0, 300), description: typeof item.description === 'string' ? item.description.slice(0, 6000) : '', start: start, end: end};
}

function token(session, namespace, method) {
    var data = [session.id, session.keyExpirationTime, namespace, method].join('|');
    var key = Buffer.from(session.key.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    var signature = crypto.createHmac('sha256', key).update(data).digest('base64').replace(/\+/g, '-').replace(/\//g, '_');
    return data + '|' + signature;
}
function productKey(product) {
    return product && ['id', 'type', 'subType'].every(function (key) { return typeof product[key] === 'string' && product[key].length > 0 && product[key].length <= 256; }) ? JSON.stringify([product.type, product.subType, product.id]) : null;
}
function validSession(data) {
    return data && data.session && typeof data.session.id === 'string' && typeof data.session.key === 'string' && Number.isFinite(data.session.keyExpirationTime) && data.session.keyExpirationTime * 1000 > Date.now() && Array.isArray(data.accessGroups);
}
function Provider(transport) {
    this.transport = transport || request;
    this.identity = {clientId: crypto.randomBytes(16).toString('hex'), deviceId: {type: 'other', value: crypto.randomBytes(16).toString('hex')}, userAgentData: {portal: 'netiago2', deviceType: 'tv', application: 'browser', player: 'html', build: 1, os: 'webos', osInfo: ''}, ua: 'netiago2_tv_webos_browser_html/1'};
    this.auth = null;
    this.channels = [];
    this.playing = null;
    this.generation = 0;
    this.catalogueTotal = 0;
}
function request(namespace, body) {
    return new Promise(function (resolve, reject) {
        var data = JSON.stringify(body);
        var req = https.request({hostname: 'b2c-www.redefine.pl', path: '/rpc/' + namespace + '/', method: 'POST', headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)}}, function (response) {
            var chunks = [], size = 0;
            response.on('data', function (chunk) { size += chunk.length; if (size > 8 * 1024 * 1024) response.destroy(new Error('RESPONSE_LIMIT')); else chunks.push(chunk); });
            response.on('error', function () { reject(new Error('NETWORK')); });
            response.on('end', function () {
                if (response.statusCode !== 200) return reject(new Error('HTTP_' + response.statusCode));
                try { var parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); parsed.serverTimestamp = Date.parse(response.headers.date); resolve(parsed); } catch (error) { reject(new Error('INVALID_RESPONSE')); }
            });
        });
        req.setTimeout(20000, function () { req.destroy(); });
        req.on('error', function () { reject(new Error('NETWORK')); });
        req.end(data);
    });
}
Provider.prototype.rpc = function (namespace, method, extra, unsigned) {
    var self = this;
    if (!unsigned && self.auth && method !== 'getSession' && method !== 'logout' && self.auth.session.keyExpirationTime * 1000 - Date.now() < 120000) {
        var generation = self.generation;
        if (!self.refreshing) {
            var previous = self.auth;
            var pending = self.rpc('auth', 'getSession', {}).then(function (auth) {
                if (self.auth !== previous) throw new Error('STALE_REQUEST');
                if (!validSession(auth) || auth.profileId !== previous.profileId) throw new Error('INVALID_SESSION');
                self.auth = {session: auth.session, accessGroups: auth.accessGroups, profileId: auth.profileId, parentalControls: auth.parentalControls || {}, accountKey: previous.accountKey};
            });
            self.refreshing = pending.then(function () { if (self.refreshing === renewal) self.refreshing = null; }, function (error) { if (self.refreshing === renewal) self.refreshing = null; throw error; });
            var renewal = self.refreshing;
        }
        return self.refreshing.then(function () {
            if (generation !== self.generation) throw new Error('STALE_REQUEST');
            if (self.auth.session.keyExpirationTime * 1000 - Date.now() < 120000) throw new Error('INVALID_SESSION');
            return self.rpc(namespace, method, extra, unsigned);
        });
    }
    var params = Object.assign({}, this.identity, extra || {});
    if (!unsigned) {
        if (!this.auth || !this.auth.session) return Promise.reject(new Error('LOGIN_REQUIRED'));
        params.authData = {authProvider: 'native', sessionToken: token(this.auth.session, namespace, method)};
    }
    return this.transport(namespace, {jsonrpc: '2.0', id: 1, method: method, params: params}).then(function (response) {
        if (Number.isFinite(response.serverTimestamp)) self.clockSample = {epoch: response.serverTimestamp, at: process.hrtime()};
        if (response.error) {
            var kind = response.error.data && response.error.data.type;
            var captchaErrors = {13458: 'CAPTCHA_REQUIRED', 13461: 'CAPTCHA_LOW_SCORE', 13452: 'CAPTCHA_INVALID'};
            var error = new Error(captchaErrors[response.error.code] || (kind === 'CaptchaRequiredException' ? 'CAPTCHA_REQUIRED' : 'RPC_' + response.error.code));
            throw error;
        }
        if (!Object.prototype.hasOwnProperty.call(response, 'result')) throw new Error('INVALID_RESPONSE');
        return response.result;
    });
};
Provider.prototype.importSession = function (data) {
    if (!validSession(data)) throw new Error('INVALID_SESSION');
    if (data.identity) {
        var id = data.identity;
        if (!id.deviceId || typeof id.deviceId.value !== 'string' || typeof id.clientId !== 'string' || !id.userAgentData || id.userAgentData.portal !== 'netiago2' || typeof id.ua !== 'string') throw new Error('INVALID_SESSION');
        this.identity = {deviceId: id.deviceId, clientId: id.clientId, userAgentData: id.userAgentData, ua: id.ua};
    }
    var accountKey = this.auth && this.auth.accountKey;
    this.auth = {session: data.session, accessGroups: data.accessGroups, profileId: data.profileId, parentalControls: data.parentalControls || {}};
    if (data.user && ['string', 'number'].indexOf(typeof data.user.id) >= 0) this.auth.accountKey = crypto.createHash('sha256').update(String(data.user.id)).digest('hex');
    else if (typeof data.accountKey === 'string' && /^[a-f0-9]{64}$/.test(data.accountKey)) this.auth.accountKey = data.accountKey;
    else if (accountKey) this.auth.accountKey = accountKey;
    this.channels = []; this.vodCategories=null;this.vodMedia=null;this.catalogScans=null;this.rootCatalogs=null;
    this.generation++;
};
Provider.prototype.login = function (username, password, captcha) {
    var self = this;
    if (typeof username !== 'string' || !username.trim() || username.length > 256 || typeof password !== 'string' || !password || password.length > 1024) return Promise.reject(new Error('INVALID_CREDENTIALS'));
    if (captcha !== undefined && (!captcha || ['recaptcha_enterprise_v3', 'recaptcha_enterprise_v2_challenge_checkbox'].indexOf(captcha.type) < 0 || typeof captcha.value !== 'string' || !captcha.value.trim() || captcha.value.length > 16384)) return Promise.reject(new Error('INVALID_CAPTCHA'));
    self.clear();
    var params = {authData: {login: username.trim(), password: password, authProvider: 'netia', deviceId: Object.assign({name: 'Netia GO webOS'}, self.identity.deviceId)}};
    if (captcha !== undefined) params.captcha = {type: captcha.type, value: captcha.value};
    return self.rpc('auth/2.0', 'login', params, true).then(function (auth) { self.importSession(auth); return true; });
};
Provider.prototype.acceptFrameSession = function (data) {
    var self = this;
    if (!data || !validSession({session: data.session, accessGroups: []}) || data.session.id.length > 1024 || data.session.key.length > 4096 || !/^[A-Za-z0-9+/_=-]+$/.test(data.session.key) || ['clientId', 'deviceId'].some(function (k) { return typeof data[k] !== 'string' || !data[k] || data[k].length > 256; })) return Promise.reject(new Error('INVALID_SESSION'));
    self.clear();
    var generation = self.generation;
    self.identity.clientId = data.clientId; self.identity.deviceId = {type: 'other', value: data.deviceId};
    self.auth = {session: {id: data.session.id, key: data.session.key, keyExpirationTime: data.session.keyExpirationTime}, accessGroups: []};
    return self.rpc('auth', 'getSession', {}).then(function (auth) {
        if (generation !== self.generation) throw new Error('STALE_REQUEST');
        self.importSession(auth); return true;
    }).catch(function (error) { if (generation === self.generation) self.clear(); throw error; });
};
Provider.prototype.profiles = function () { return this.rpc('auth', 'getProfiles', {}).then(function (profiles) { if (!Array.isArray(profiles)) throw new Error('INVALID_RESPONSE'); return profiles.map(function (p) { return {id: p.id, name: p.name}; }); }); };
Provider.prototype.select = function (id) {
    var self = this;
    if (typeof id !== 'string' || !id || id.length > 128) return Promise.reject(new Error('INVALID_PROFILE'));
    self.generation++; self.channels = []; self.vodCategories=null;self.vodMedia=null;self.catalogScans=null;self.rootCatalogs=null;self.playing = null;
    return self.profiles().then(function (profiles) {
        if (!profiles.some(function (p) { return p.id === id; })) throw new Error('INVALID_PROFILE');
        return self.rpc('auth', 'setSessionProfile', {profileId: id});
    }).then(function (auth) { self.importSession(auth); return true; });
};
Provider.prototype.list = function () {
    var self = this, all = [], offset = 0, generation = self.generation;
    if (!self.auth || !self.auth.profileId) return Promise.reject(new Error('PROFILE_REQUIRED'));
    self.channels = [];
    function access(candidates) {
        var granted = Object.create(null), index = 0;
        function batch() {
            var channels = candidates.slice(index, index + 40); index += channels.length;
            if (!channels.length) return Promise.resolve();
            var keys = channels.map(function (c) { return productKey(c.product); });
            return self.rpc('drm', 'checkProductsAccess', {products: channels.map(function (c) { return c.product; })}).then(function (items) {
                if (generation !== self.generation) throw new Error('STALE_REQUEST');
                if (!Array.isArray(items)) throw new Error('INVALID_RESPONSE');
                items.forEach(function (item) {
                    var key = item && productKey(item.product);
                    if (keys.indexOf(key) < 0 || !item.access || typeof item.access.status !== 'number') throw new Error('INVALID_RESPONSE');
                    granted[key] = granted[key] !== false && item.access.status === 0;
                });
                return batch();
            });
        }
        return batch().then(function () {
            if (generation !== self.generation) throw new Error('STALE_REQUEST');
            self.channels = candidates.filter(function (c) { return granted[productKey(c.product)] === true; });
            var compare = new Intl.Collator('pl', {sensitivity: 'base', numeric: true}).compare;
            self.channels.sort(function (a, b) { return compare(a.title, b.title) || String(a.id).localeCompare(String(b.id)); });
            return self.channels.map(function (c) { return {id: c.id, title: c.title, logo: logoUrl(c), lcn:Number.isInteger(c.lcn)&&c.lcn>0?c.lcn:null,sourceOrder:candidates.indexOf(c),category: Array.isArray(c.genres)&&typeof c.genres[0]==='string'?c.genres[0].slice(0,80):null}; });
        });
    }
    function page() {
        return self.rpc('navigation', 'getTvChannels', {offset: offset, limit: 100, filters: []}).then(function (result) {
            if (generation !== self.generation) throw new Error('STALE_REQUEST');
            if (!result || !Array.isArray(result.results) || !Number.isFinite(result.total)) throw new Error('INVALID_RESPONSE');
            all = all.concat(result.results); offset += result.results.length;
            if (offset < result.total) { if (!result.results.length || offset > 10000) throw new Error('INVALID_PAGINATION'); return page(); }
            self.catalogueTotal = result.total;
            return access(all.filter(function (c) { return c.published === true && c.mediaType === 'tv' && productKey(c.product); }));
        });
    }
    var loading = page();
    self.channelLoad = loading; loading.then(function () { if (self.channelLoad === loading) self.channelLoad = null; }, function () { if (self.channelLoad === loading) self.channelLoad = null; });
    return loading;
};
// The app shows its saved channel list at once and asks for Netia's list in the background, so a guide or playback
// request can arrive before this session knows the channels: wait for that load (or start one), then decide.
Provider.prototype.knownChannel = function (id) {
    var self = this, generation = self.generation;
    function find() { return self.channels.find(function (c) { return c.id === id; }); }
    if (find()) return Promise.resolve(find());
    var load = self.channelLoad || (self.channels.length ? null : self.list());
    if (!load) return Promise.resolve(null);
    return load.then(function () { if (generation !== self.generation) throw new Error('STALE_REQUEST'); return find() || null; });
};
// Category grants are provider OR expressions; unknown syntax is never treated as included.
function categoryGranted(expression, groups) {
    return typeof expression==='string' && /^[a-zA-Z0-9_:.-]+(?:\+[a-zA-Z0-9_:.-]+)*$/.test(expression) && expression.split('+').some(function(tag){return groups.indexOf(tag)>=0;});
}
function catalogBackdrop(item){
    var image=(Array.isArray(item.gallery)?item.gallery:[]).find(function(image){
        var p=image.customParams||{},aspect=image.aspect||{};
        return p.display==='background'&&p.appTheme==='dark'&&aspect.width===16&&aspect.height===9&&mediaUrl(image.src);
    });
    return image?mediaUrl(image.src):null;
}
Provider.prototype.catalog = function(kind, id, offset) {
    var self=this, generation=self.generation,parentId=null;
    if(!self.auth||!self.auth.profileId)return Promise.reject(new Error('PROFILE_REQUIRED'));
    if(['series','shows'].indexOf(kind)<0 || !Number.isInteger(offset) || offset<0 || offset>10000)return Promise.reject(new Error('INVALID_CATALOG'));
    self.vodCategories=self.vodCategories||Object.create(null);self.vodMedia=self.vodMedia||Object.create(null);
    function root(){
        if(id!==undefined)return self.knownCategory(kind,id).then(function(){return id;});
        return self.rpc('navigation','getHomeMenu',{}).then(function(menu){
            if(!Array.isArray(menu))throw new Error('INVALID_RESPONSE');
            var item=menu.find(function(x){return x.name===(kind==='series'?'Seriale':'Programy') && x.place && x.place.type==='category';});
            if(!item)throw new Error('CATALOG_UNAVAILABLE');return String(item.place.value);
        });
    }
    return Promise.resolve().then(root).then(function(catid){parentId=String(catid);return self.rpc('navigation','getCategoryContent',{catid:Number(catid),offset:offset,limit:100,filters:[]});}).then(function(result){
        if(generation!==self.generation)throw new Error('STALE_REQUEST');
        if(!result||!Array.isArray(result.results)||!Number.isFinite(result.total)||!Number.isInteger(result.limit)||result.limit<=0)throw new Error('INVALID_RESPONSE');
        var rows=result.results.map(function(x){return x.object||x;}),media=rows.filter(function(x){return x.mediaType==='vod'&&x.published===true&&productKey(x.product);}),granted=Object.create(null),at=0;
        function access(){var batch=media.slice(at,at+40);at+=batch.length;if(!batch.length)return Promise.resolve();return self.rpc('drm','checkProductsAccess',{products:batch.map(function(x){return x.product;})}).then(function(items){
            if(generation!==self.generation)throw new Error('STALE_REQUEST');if(!Array.isArray(items))throw new Error('INVALID_RESPONSE');
            items.forEach(function(x){var key=productKey(x.product);if(!key||!x.access||typeof x.access.status!=='number')throw new Error('INVALID_RESPONSE');granted[key]=granted[key]!==false&&x.access.status===0;});return access();
        });}
        return access().then(function(){
            if(generation!==self.generation)throw new Error('STALE_REQUEST');
            var items=rows.filter(function(x){return x.mediaType==='vod'?granted[productKey(x.product)]===true:typeof x.name==='string'&&categoryGranted(x.grantExpression,self.auth.accessGroups);}).map(function(x){
                var category=x.mediaType!=='vod',key=String(x.id),title=category?x.name:x.title;
                if(!key||key.length>128||typeof title!=='string')throw new Error('INVALID_RESPONSE');
                if(!category)self.vodMedia[key]=x;
                var image=(x.thumbnails||[]).find(function(i){return i.size&&i.size.width>=272&&i.size.width<=768&&mediaUrl(i.src);});
                var item={id:key,title:title.slice(0,300),description:typeof x.description==='string'?x.description.slice(0,6000):'',image:image?mediaUrl(image.src):null,category:category,parentId:parentId,backdrop:null,season:null,episodeNumber:null};
                if(image&&Number.isFinite(image.size.height)&&image.size.height>0)item.imageSize={width:image.size.width,height:image.size.height};
                item.backdrop=catalogBackdrop(x);
                if(Number.isInteger(x.ageGroup)&&x.ageGroup>=0&&x.ageGroup<=18)item.ageGroup=x.ageGroup;
                if(Array.isArray(x.accessibilityFeatures))item.closedCaptions=x.accessibilityFeatures.indexOf('N')>=0;
                if(!category){
                    var parent=x.category;
                    if(parent&&['string','number'].indexOf(typeof parent.id)>=0&&String(parent.id).length<=128){
                        item.parentId=String(parent.id);
                        if(Number.isInteger(parent.seasonNumber)&&parent.seasonNumber>=0)item.season={id:String(parent.id),number:parent.seasonNumber};
                        if(Array.isArray(parent.categoryPath))item.categoryPath=parent.categoryPath.filter(function(id){return ['string','number'].indexOf(typeof id)>=0&&String(id).length<=128;}).map(function(id){return {id:String(id)};});
                    }
                    if(Number.isInteger(x.episodeNumber)&&x.episodeNumber>=0)item.episodeNumber=x.episodeNumber;
                }
                if(Array.isArray(x.genres))item.genres=x.genres.filter(function(genre){return typeof genre==='string'&&genre.length>0&&genre.length<=100;}).slice(0,10);
                if(!category)item.publishedAt=Number.isFinite(Date.parse(x.publicationDate))?Date.parse(x.publicationDate):null;
                if(category)self.vodCategories[key]=item;
                return item;
            });
            return {items:items,next:offset+result.limit<result.total?offset+result.limit:null};
        });
    });
};
// Category ids are learnt from catalogue pages. The app may show a series or show list from its saved copy, so this
// session may not have paged through it yet: page the root catalogue once (shared by concurrent callers) and check again.
Provider.prototype.knownCategory = function(kind,id) {
    var self=this,generation=self.generation;
    if(typeof id!=='string'||!id||id.length>128)return Promise.reject(new Error('INVALID_CATEGORY'));
    if(self.vodCategories&&self.vodCategories[id])return Promise.resolve();
    var loads=self.rootCatalogs=self.rootCatalogs||Object.create(null);
    if(!loads[kind]){
        var load=loads[kind]=(function page(offset){return self.catalog(kind,undefined,offset).then(function(data){return data.next===null?null:page(data.next);});}(0));
        load.catch(function(){if(self.rootCatalogs&&self.rootCatalogs[kind]===load)delete self.rootCatalogs[kind];});
    }
    return loads[kind].then(function(){
        if(generation!==self.generation)throw new Error('STALE_REQUEST');
        if(!self.vodCategories||!self.vodCategories[id])throw new Error('INVALID_CATEGORY');
    });
};
// Missing season numbers stay unknown; category names are not parsed as numbering.
Provider.prototype.scanCatalog = function(kind,id,refresh) {
    var self=this,generation=self.generation,queue=[{id:id,path:[]}],visited=Object.create(null),seen=Object.create(null),items=[],latest=null,latestImage=null;
    if(['series','shows'].indexOf(kind)<0)return Promise.reject(new Error('INVALID_CATALOG'));
    var cache=self.catalogScans=self.catalogScans||Object.create(null),key=kind+':'+id;
    if(!refresh&&cache[key])return cache[key];
    function category(){
        if(generation!==self.generation)throw new Error('STALE_REQUEST');
        if(!queue.length)return {items:items,latest:latest,latestImage:latestImage};
        var next=queue.shift();if(visited[next.id])return category();visited[next.id]=true;
        function page(offset){return self.catalog(kind,next.id,offset).then(function(data){
            if(generation!==self.generation)throw new Error('STALE_REQUEST');
            data.items.forEach(function(item){
                if(item.category){if(!visited[item.id])queue.push({id:item.id,path:next.path.concat([{id:item.id,title:item.title}])});}
                else {
                    if(Number.isFinite(item.publishedAt)&&item.publishedAt>(self.clockSample?self.clockSample.epoch:Date.now()))return;
                    if(!seen[item.id]){seen[item.id]=true;items.push(Object.assign({},item,{categoryPath:item.categoryPath||next.path}));}
                    if(Number.isFinite(item.publishedAt)&&item.publishedAt<=(self.clockSample?self.clockSample.epoch:Date.now())){
                        if(!latest||item.publishedAt>latest.publishedAt)latest=item;
                        if(item.image&&(!latestImage||item.publishedAt>latestImage.publishedAt))latestImage=item;
                    }
                }
            });
            if(data.next!==null){if(!Number.isInteger(data.next)||data.next<=offset)throw new Error('INVALID_PAGINATION');return page(data.next);}
            return category();
        });}
        return page(0);
    }
    var pending=self.knownCategory(kind,id).then(category).catch(function(error){if(cache[key]===pending)delete cache[key];throw error;});
    cache[key]=pending;return pending;
};
Provider.prototype.catalogDetails = function(kind,id,refresh) {
    var self=this,generation=self.generation;
    return self.scanCatalog(kind,id,refresh).then(function(scan){
        if(generation!==self.generation)throw new Error('STALE_REQUEST');
        var own=self.vodCategories[id],latest=scan.latest;
        return {id:id,title:own.title||'',description:own.description||latest&&latest.description||'',image:own.image||latest&&latest.image||null,
            backdrop:own.backdrop||latest&&latest.backdrop||null,season:null,metadataLimited:scan.items.some(function(item){return !item.season;}),latestEpisodeId:latest&&latest.id||null,items:scan.items,
            genres:own.genres&&own.genres.length?own.genres:latest&&latest.genres||[],ageGroup:own.ageGroup!==undefined?own.ageGroup:latest&&latest.ageGroup!==undefined?latest.ageGroup:null,
            closedCaptions:own.closedCaptions!==undefined?own.closedCaptions:scan.items.some(function(item){return item.closedCaptions===true;})?true:scan.items.some(function(item){return item.closedCaptions===false;})?false:null,
            hideDescription:scan.items.length===1&&scan.items[0].title===own.title&&scan.items[0].description===own.description};
    });
};
Provider.prototype.catalogArtwork = function(kind,id) {
    var self=this,generation=self.generation;
    return self.scanCatalog(kind,id).then(function(scan){if(generation!==self.generation)throw new Error('STALE_REQUEST');return scan.latestImage&&scan.latestImage.image||null;});
};
Provider.prototype.programs = function (id, date) {
    var self = this, generation = self.generation, result = [], offset = 0;
    if (!self.auth || !self.auth.profileId) return Promise.reject(new Error('PROFILE_REQUIRED'));
    var selected = id === undefined ? self.channels : self.channels.filter(function (c) { return c.id === id; });
    if (id !== undefined && !selected.length) return self.knownChannel(id).then(function (channel) { if (!channel) throw new Error('NOT_ENTITLED'); return self.programs(id, date); });
    if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return Promise.reject(new Error('INVALID_DATE'));
    function batch() {
        var channels = selected.slice(offset, offset + 12); offset += channels.length;
        if (!channels.length) return Promise.resolve(result);
        var params = {channelIds: channels.map(function (c) { return c.id; })};
        if (date) params.date = date; else { params.offset = 0; params.limit = 1; }
        return self.rpc('navigation', date ? 'getChannelsProgram' : 'getChannelsCurrentProgram', params).then(function (data) {
            if (generation !== self.generation) throw new Error('STALE_REQUEST');
            if (!data || typeof data !== 'object') throw new Error('INVALID_RESPONSE');
            channels.forEach(function (channel) {
                var items = data[channel.id] || [];
                if (!Array.isArray(items) || items.length > 2000) throw new Error('INVALID_RESPONSE');
                items.forEach(function (item) { var p = item && program(item, channel); if (p) result.push(p); });
            });
            return batch();
        });
    }
    return batch().then(function (items) { return items.sort(function (a, b) { return a.start - b.start || a.channelTitle.localeCompare(b.channelTitle, 'pl'); }); });
};
Provider.prototype.play = function (id, capabilities, kind) {
    var self = this, channel = kind==='vod' ? self.vodMedia && self.vodMedia[id] : self.channels.find(function (c) { return c.id === id; }), generation = self.generation;
    self.playbackDiagnostic=null;
    if (!channel && kind !== 'vod') return self.knownChannel(id).then(function (known) { if (!known) throw new Error('NOT_ENTITLED'); return self.play(id, capabilities, kind); });
    if (!channel) return Promise.reject(new Error('NOT_ENTITLED'));
    if (!capabilities || capabilities.widevine !== true || typeof capabilities.userAgent !== 'string' || capabilities.userAgent.length > 1024) return Promise.reject(new Error('WIDEVINE_REQUIRED'));
    if (self.auth.parentalControls && Object.keys(self.auth.parentalControls).length) return Promise.reject(new Error('PARENTAL_CONTROL_REQUIRED'));
    var mediaAgent = {portal: 'netiago2', deviceType: 'tv', application: 'browser', player: 'html', build: 1, os: 'webos', osInfo: capabilities.userAgent, widevine: true};
    self.mediaAgent = mediaAgent;
    return self.rpc('navigation', 'prePlayData', {cpid: channel.cpid, mediaId: channel.id, userAgentData: mediaAgent, ua: 'netiago2_tv_webos_browser_html/1 (' + capabilities.userAgent + ') (webOS; widevine=true)'}).then(function (result) {
        if (generation !== self.generation) throw new Error('STALE_REQUEST');
        var sources = result && result.mediaItem && result.mediaItem.playback && result.mediaItem.playback.mediaSources;
        if (!Array.isArray(sources)) throw new Error('INVALID_RESPONSE');
        var source = sources.filter(function (s) { return s.accessMethod === 'dash' && s.granted === true && s.authorizationServices && s.authorizationServices.widevine && mediaUrl(s.url, kind==='vod'); }).sort(function (a, b) { return parseInt(b.quality, 10) - parseInt(a.quality, 10); })[0];
        if (!source) {
            self.playbackDiagnostic=sources.map(function(s){var auth=s.authorizationServices||{};return {
                method:['dash','direct','hls','hls_timeshift','ss-tv','smooth','http'].indexOf(s.accessMethod)>=0?s.accessMethod:'other',
                granted:s.granted===true,widevine:!!auth.widevine,playready:!!auth.playready,
                format:['mp4','dash'].indexOf(s.fileFormat)>=0?s.fileFormat:'other',pseudo:!!auth.pseudo,pseudoVersion:auth.pseudo&&Number.isFinite(parseFloat(auth.pseudo.version))?parseFloat(auth.pseudo.version):null,
                addressApproved:!!mediaUrl(s.url,kind==='vod')
            };});
            var direct=kind==='vod'&&sources.filter(function(s){
                var auth=s.authorizationServices||{},types=Array.isArray(s.drmTypes)?s.drmTypes:[];
                if(s.granted!==true||s.accessMethod!=='direct'||s.fileFormat!=='mp4'||Object.keys(auth).some(function(name){return name!=='pseudo';})||types.some(function(name){return name!=='pseudo';}))return false;
                return auth.pseudo?parseFloat(auth.pseudo.version)>=2&&(typeof s.id==='string'||Number.isFinite(s.id)):!!mediaUrl(s.url,true);
            }).sort(function(a,b){return (parseInt(b.quality,10)||0)-(parseInt(a.quality,10)||0);})[0];
            if(!direct)throw new Error('UNSUPPORTED_STREAM');
            var directMedia=function(value){
                if(generation!==self.generation)throw new Error('STALE_REQUEST');
                var url=mediaUrl(value,true);if(!url)throw new Error('UNSUPPORTED_STREAM');
                self.playing=null;self.playbackDiagnostic=null;return {url:url,title:channel.title,drm:null,mimeType:'video/mp4'};
            };
            if(!direct.authorizationServices||!direct.authorizationServices.pseudo)return directMedia(direct.url);
            // The official player authorizes pseudo v2 through the signed DRM API.
            return self.rpc('drm','getPseudoLicense',{cpid:channel.cpid,mediaId:channel.id,sourceId:direct.id,userAgentData:mediaAgent,deviceId:Object.assign({name:'Netia GO webOS'},self.identity.deviceId)}).then(function(license){return directMedia(license&&license.url);});
        }
        self.playing = {cpid: channel.cpid, mediaId: channel.id, sourceId: source.id, keyId: source.keyId};
        return {url: mediaUrl(source.url, kind==='vod'), title: channel.title, drm: 'widevine'};
    });
};
Provider.prototype.license = function (challenge) {
    var self = this, playing = self.playing;
    if (!playing || typeof challenge !== 'string' || challenge.length > 1400000 || !/^[A-Za-z0-9+/_=-]+$/.test(challenge)) return Promise.reject(new Error('INVALID_CHALLENGE'));
    return self.rpc('drm', 'getWidevineLicense', Object.assign({}, playing, {userAgentData: self.mediaAgent || self.identity.userAgentData, object: challenge.replace(/\+/g, '-').replace(/\//g, '_'), deviceId: Object.assign({name: 'Netia GO webOS'}, self.identity.deviceId)})).then(function (result) {
        if (self.playing !== playing) throw new Error('STALE_REQUEST');
        if (result.accessPolicy && result.accessPolicy.cac) throw new Error('UNSUPPORTED_ACCESS_POLICY');
        var license = result.object && result.object.license;
        if (typeof license !== 'string' || license.length > 1400000 || !/^[A-Za-z0-9+/_=-]+$/.test(license)) throw new Error('INVALID_RESPONSE');
        return license;
    });
};
Provider.prototype.clear = function () { this.playbackDiagnostic=null; this.vodCategories=null;this.vodMedia=null;this.catalogScans=null;this.rootCatalogs=null;this.auth = null; this.channels = []; this.playing = null; this.generation++; };
exports.Provider = Provider;
exports.token = token;

exports.categoryGranted = categoryGranted;
