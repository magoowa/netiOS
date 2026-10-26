(function(root){
    'use strict';
    function validate(value){
        function fields(object,names){if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(function(key){return names.indexOf(key)<0;}))throw new Error('CONFIG_INVALID');}
        function choices(object,names,allowed){fields(object,names);names.forEach(function(key){if(allowed.indexOf(object[key])<0)throw new Error('CONFIG_INVALID');});return object;}
        fields(value,['version','channelSort','librarySort','oledMinutes','subtitleSize','channels']);
        if(value.version!==1||[30,60,90,120].indexOf(value.oledMinutes)<0||[50,75,100,150,200].indexOf(value.subtitleSize)<0||!Array.isArray(value.channels)||value.channels.length>2000)throw new Error('CONFIG_INVALID');
        if(value.channelSort&&typeof value.channelSort==='object')['all','favorites','hidden'].forEach(function(key){if(value.channelSort[key]==='default')value.channelSort[key]='alphabetical';});
        choices(value.channelSort,['all','favorites','hidden'],['alphabetical','thematic','favorites-first']);choices(value.librarySort,['series','shows'],['alphabetical','genres']);
        var ids=Object.create(null);
        value.channels.forEach(function(channel){fields(channel,['id','name','favorite','hidden']);if(typeof channel.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(channel.id)||ids[channel.id]||typeof channel.name!=='string'||!channel.name.trim()||channel.name.length>200||/[\x00-\x1f\x7f]/.test(channel.name)||typeof channel.favorite!=='boolean'||typeof channel.hidden!=='boolean')throw new Error('CONFIG_INVALID');ids[channel.id]=true;});
        return value;
    }
    if(typeof module!=='undefined')module.exports=validate;else root.validateNetiosConfig=validate;
}(this));
