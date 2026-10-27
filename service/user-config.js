'use strict';
require('./compat');
var fs=require('fs'),path=require('path'),crypto=require('crypto'),promisify=require('util').promisify,validate=require('./config-model');
module.exports=function(directory){
    var file=path.join(directory,'user-config.json'),read=promisify(fs.readFile),write=promisify(fs.writeFile);
    function result(text){if(text.length>1048576)throw new Error('CONFIG_INVALID');var value;try{value=validate(JSON.parse(text));}catch(error){throw new Error('CONFIG_INVALID');}return {settings:value,revision:crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')};}
    return function(defaults){return read(file,'utf8').catch(function(error){
        if(error.code!=='ENOENT')throw new Error('CONFIG_ACCESS');
        var text=JSON.stringify(validate(defaults),null,2)+'\n';
        return promisify(fs.mkdir)(directory,448).catch(function(error){if(error.code!=='EEXIST')throw error;}).then(function(){return write(file,text,{mode:384,flag:'wx'}).catch(function(error){if(error.code!=='EEXIST')throw error;});}).then(function(){return read(file,'utf8');});
    }).then(result);};
};
