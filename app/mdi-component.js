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
        function update(){var chosen=select.options[select.selectedIndex];overlay.textContent='';if(!chosen)return;overlay.appendChild(content(null,chosen.textContent,select.id==='oled-minutes'?'sort-clock-ascending-outline':select.id==='autonext-seconds'?'clock-start':'sort'));refresh(overlay);}
        select.addEventListener('change',update);select.mdiUpdate=update;update();
        // The browser's own popup is square and cannot be styled; the list opens here instead.
        select.addEventListener('mousedown',function(e){if(e.button!==0)return;e.preventDefault();if(openMenu&&openMenu.select===select)closeMenu();else openList(select,host);});
    });}
    // An open select shows its options in a panel just below the field, rounded like the field itself. Up/Down move,
    // OK chooses, Back or any other key closes it; the remote never reaches the browser's popup.
    var openMenu=null;
    function closeMenu(focus){
        if(!openMenu)return;var menu=openMenu;openMenu=null;
        if(menu.panel.parentNode)menu.panel.parentNode.removeChild(menu.panel);menu.host.classList.remove('mdi-select-open');menu.host.parentNode.classList.remove('mdi-menu-open');
        ['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].forEach(function(key){menu.select.style[key]='';});
        if(focus!==false)menu.select.focus({preventScroll:true});
    }
    function openList(select,host){
        closeMenu(false);
        var style=getComputedStyle(select),panel=document.createElement('div'),radius=Math.min(parseFloat(style.borderTopLeftRadius)||0,select.offsetHeight/2);
        // The field opens downwards into one shape with the list: the field keeps its rounded top, the list continues its
        // sides under the field's bottom edge (the divider) and ends with the field's rounding. The values in the list start
        // where the value in the field does.
        select.style.borderTopLeftRadius=select.style.borderTopRightRadius=radius+'px';select.style.borderBottomLeftRadius=select.style.borderBottomRightRadius='0';
        panel.className='mdi-select-menu';panel.setAttribute('role','listbox');panel.style.borderRadius='0 0 '+radius+'px '+radius+'px';panel.style.borderColor=style.borderLeftColor;
        panel.style.left=select.offsetLeft+'px';panel.style.width=select.offsetWidth+'px';panel.style.top=(select.offsetTop+select.offsetHeight)+'px';
        var label=host.querySelector('.icon-label'),inset=label?Math.round(label.getBoundingClientRect().left-select.getBoundingClientRect().left):24;
        Array.prototype.forEach.call(select.options,function(option,index){
            var button=document.createElement('button');button.type='button';button.className='mdi-select-option';button.setAttribute('role','option');
            button.setAttribute('aria-selected',String(index===select.selectedIndex));button.textContent=option.textContent;button.style.borderRadius=Math.max(0,radius-8)+'px';button.style.paddingLeft=Math.max(0,inset-10)+'px';
            button.addEventListener('mousedown',function(e){e.preventDefault();});
            button.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();choose(index);});
            panel.appendChild(button);
        });
        function choose(index){var changed=select.selectedIndex!==index;select.selectedIndex=index;closeMenu();if(changed)select.dispatchEvent(new Event('change',{bubbles:true}));}
        host.appendChild(panel);host.classList.add('mdi-select-open');host.parentNode.classList.add('mdi-menu-open');openMenu={select:select,host:host,panel:panel,choose:choose};
        (panel.children[select.selectedIndex]||panel.firstChild).focus({preventScroll:true});
    }
    window.addEventListener('keydown',function(e){
        var active=document.activeElement;
        if(openMenu){
            var options=Array.prototype.slice.call(openMenu.panel.children),index=options.indexOf(active);
            e.preventDefault();e.stopImmediatePropagation();
            if(e.keyCode===38||e.keyCode===40){var next=options[Math.max(0,Math.min(options.length-1,(index<0?openMenu.select.selectedIndex:index)+(e.keyCode===38?-1:1)))];if(next)next.focus({preventScroll:true});return;}
            if(e.keyCode===13){if(index>=0)openMenu.choose(index);else closeMenu();return;}
            closeMenu();return;
        }
        if(e.keyCode===13&&active&&active.tagName==='SELECT'&&active.parentNode.classList.contains('mdi-select')){e.preventDefault();e.stopImmediatePropagation();openList(active,active.parentNode);}
    },true);
    document.addEventListener('mousedown',function(e){if(openMenu&&!openMenu.host.contains(e.target))closeMenu(false);},true);
    document.addEventListener('focusin',function(e){if(openMenu&&!openMenu.panel.contains(e.target)&&e.target!==openMenu.select)closeMenu(false);});
    window.NetiosIcons={set:set,selects:selects,closeMenu:closeMenu};
    function fontsReady(){metrics=Object.create(null);refresh(document);}
    document.fonts.ready.then(fontsReady);document.fonts.addEventListener('loadingdone',fontsReady);
}());
