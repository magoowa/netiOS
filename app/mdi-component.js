(function () {
    'use strict';
    var ns='http://www.w3.org/2000/svg',bounds=Object.create(null),metrics=Object.create(null);
    var measuring=document.createElementNS(ns,'svg');
    measuring.setAttribute('width','24');measuring.setAttribute('height','24');
    measuring.setAttribute('class','mdi-measure');
    measuring.setAttribute('aria-hidden','true');document.body.appendChild(measuring);
    function capRatio(font){
        var key=font.fontStyle+' '+font.fontWeight+' '+font.fontFamily;
        if(metrics[key])return metrics[key];
        // Chromium 68 has neither cap units nor full TextMetrics; rasterize the font's H once.
        var canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1200;
        var context=canvas.getContext('2d');context.font=font.fontStyle+' '+font.fontWeight+' 1000px '+font.fontFamily;
        context.fillText('H',0,1000);var pixels=context.getImageData(0,0,1200,1200).data,top=1200,bottom=-1;
        for(var y=0;y<1200;y++)for(var x=0;x<1200;x++)if(pixels[(y*1200+x)*4+3]){top=Math.min(top,y);bottom=y;break;}
        return metrics[key]=bottom>=top?(bottom-top+1)/1000:0.7;
    }
    function fit(svg){
        var path=svg.querySelector('path'),d=path.getAttribute('d'),box=bounds[d];
        if(!box){var probe=path.cloneNode(true);measuring.appendChild(probe);var b=probe.getBBox();measuring.removeChild(probe);box=bounds[d]={x:b.x,y:b.y,width:b.width,height:b.height};}
        if(!box.width||!box.height)throw new Error('ICON_GEOMETRY');
        svg.setAttribute('viewBox',[box.x,box.y,box.width,box.height].join(' '));
        svg.style.setProperty('--mdi-aspect',String(box.width/box.height));
        if(!CSS.supports('height','1cap'))svg.style.setProperty('--mdi-cap-height',capRatio(getComputedStyle(svg))+'em');
    }
    function icon(name){
        var svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
        svg.setAttribute('class','mdi');svg.setAttribute('aria-hidden','true');path.setAttribute('d',MDI[name]);svg.appendChild(path);return svg;
    }
    function content(name,label,indicator){
        var span=document.createElement('span');span.className='mdi-content';
        if(name)span.appendChild(icon(name));
        if(label){if(name)gap(span);var text=document.createElement('span');text.className='icon-label';text.textContent=label;span.appendChild(text);}
        if(indicator){gap(span);span.appendChild(icon(indicator));}return span;
    }
    function gap(parent){var space=document.createElement('span');space.className='mdi-gap';space.setAttribute('aria-hidden','true');parent.appendChild(space);}
    function refresh(root){Array.prototype.forEach.call(root.querySelectorAll('svg.mdi'),fit);}
    function set(host,name,label){
        label=label?label.trim():'';
        if(host.dataset.currentIcon===name&&host.dataset.iconLabel===label)return;
        host.dataset.currentIcon=name;host.dataset.iconLabel=label;host.textContent='';
        host.classList.add('mdi-control');host.classList.toggle('mdi-only',!label);
        host.appendChild(content(name,label));refresh(host);
    }
    function selects(){Array.prototype.forEach.call(document.querySelectorAll('select'),function(select){
        var host=select.parentNode;
        if(!host.classList.contains('sort-control')){host=document.createElement('span');select.parentNode.insertBefore(host,select);host.appendChild(select);}
        host.classList.add('mdi-select');var overlay=document.createElement('span');overlay.className='mdi-select-content';overlay.setAttribute('aria-hidden','true');host.appendChild(overlay);
        function update(){overlay.textContent='';overlay.appendChild(content(null,select.options[select.selectedIndex].textContent,select.id==='oled-minutes'?'sort-clock-ascending-outline':'sort'));refresh(overlay);}
        select.addEventListener('change',update);select.mdiUpdate=update;update();
    });}
    window.NetiosIcons={set:set,selects:selects};
    function fontsReady(){metrics=Object.create(null);refresh(document);}
    document.fonts.ready.then(fontsReady);document.fonts.addEventListener('loadingdone',fontsReady);
}());
