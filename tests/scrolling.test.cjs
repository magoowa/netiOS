'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function load(){
 const source=fs.readFileSync('app/main.js','utf8'),clock={now:0},context={Math,Date:{now:()=>clock.now},document:{},requestAnimationFrame(){}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('    var Scrolling=(function(){'),source.indexOf('    Scrolling.indicator(')),context);
 return {Scrolling:context.Scrolling,clock};
}
const wheel=deltaY=>({deltaY,deltaMode:0,clientX:500,clientY:500});
test('each remote notch moves one row whatever delta size the remote sends',()=>{
 for(const delta of [53,100,120]){const {Scrolling,clock}=load(),state={};const moves=[];for(let i=0;i<5;i++){clock.now+=40;moves.push(Scrolling.steps(state,wheel(delta),600));}assert.deepEqual(moves,[1,1,1,1,1],'delta '+delta);}
});
test('a stream of tiny deltas accumulates instead of skipping a row per event; reversal and pauses restart at once',()=>{
 const {Scrolling,clock}=load(),state={};let rows=0;for(let i=0;i<60;i++){clock.now+=5;rows+=Scrolling.steps(state,wheel(1),600);}
 assert.equal(rows,2,'60 one-pixel events are one row plus 59/40 of another');
 clock.now+=5;assert.equal(Scrolling.steps(state,wheel(-1),600),-1);clock.now+=1000;assert.equal(Scrolling.steps(state,wheel(-1),600),-1);
 const fast={};clock.now+=1000;Scrolling.steps(fast,wheel(120),600);clock.now+=10;assert.equal(Scrolling.steps(fast,wheel(1200),600),3,'A fast spin moves at most three rows per event');
});
test('pointer drift after a wheel is ignored briefly; a deliberate move, a timeout or a release ends the hold',()=>{
 const {Scrolling,clock}=load(),at=(x,y)=>({clientX:x,clientY:y});
 Scrolling.holdPointer(at(500,500));assert.equal(Scrolling.pointerHeld(at(510,505)),true);
 assert.equal(Scrolling.pointerHeld(at(540,500)),false);assert.equal(Scrolling.pointerHeld(at(500,500)),false,'Once released it stays released');
 Scrolling.holdPointer(at(500,500));clock.now+=4001;assert.equal(Scrolling.pointerHeld(at(502,501)),false,'The hold lapses after four seconds');
 Scrolling.holdPointer(at(500,500));Scrolling.releasePointer();assert.equal(Scrolling.pointerHeld(at(501,500)),false,'Screens, dialogs and the D-pad release it');
});
test('rows keep the column across rows of different lengths',()=>{
 const {Scrolling}=load(),cards=[0,0,0,100,100,200,200,200].map((offsetTop,i)=>({offsetTop,i})),rows=Scrolling.rows(cards);
 assert.equal(rows.length,3);assert.equal(Scrolling.moveRows(rows,cards[2],1).i,4,'Column 3 clamps to the shorter row');assert.equal(Scrolling.moveRows(rows,cards[4],1).i,6);assert.equal(Scrolling.moveRows(rows,cards[7],5).i,7,'Movement stops at the last row');
});
function animated(){
 const source=fs.readFileSync('app/main.js','utf8'),clock={now:0,frames:[]},context={Math,Date:{now:()=>clock.now},performance:{now:()=>clock.now},document:{documentElement:{classList:{toggle(){}}}},requestAnimationFrame:fn=>{clock.frames.push(fn);return clock.frames.length;},cancelAnimationFrame:id=>{clock.frames[id-1]=null;}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('    var Scrolling=(function(){'),source.indexOf('    Scrolling.indicator(')),context);
 const list={scrollTop:0,scrollHeight:5000,clientHeight:500};
 function run(ms){const end=clock.now+ms,seen=[];while(clock.now<end){clock.now+=16;const batch=clock.frames.splice(0);clock.frames=[];batch.forEach(fn=>fn&&fn(clock.now));seen.push(list.scrollTop);}return seen;}
 return {Scrolling:context.Scrolling,list,run,clock};
}
test('smooth scrolling chases its target monotonically, in whole pixels, never faster than about 67 px a frame',()=>{
 const {Scrolling,list,run}=animated();Scrolling.setSmooth(true);Scrolling.to(list,600);
 assert.equal(Scrolling.target(list),600,'Callers aim from the destination while the animation runs');
 const seen=run(700);assert(seen.length>8);assert(seen.every((top,i)=>Number.isInteger(top)&&(!i||top>=seen[i-1])),'Never moves backwards');
 const steps=seen.map((top,i)=>i?top-seen[i-1]:top).filter(Boolean);assert(Math.max(...steps)<=4*16+1,'Speed is capped: '+Math.max(...steps));assert(steps[steps.length-1]<steps[0],'Gentle stop');assert.equal(list.scrollTop,600);assert.equal(Scrolling.target(list),600);
});
test('a new target mid-flight continues from the current position; prepending shifts the whole motion; turning it off jumps',()=>{
 const {Scrolling,list,run}=animated();Scrolling.setSmooth(true);Scrolling.to(list,600);run(80);const middle=list.scrollTop;
 Scrolling.to(list,1200);const next=run(16)[0];assert(next>=middle,'Retargeting does not jump back to the start');assert(next-middle<=4*16+1,'Retargeting far away does not leap');run(900);assert.equal(list.scrollTop,1200);
 Scrolling.to(list,0);run(48);const before=list.scrollTop;Scrolling.shift(list,300);assert.equal(list.scrollTop,before+300);assert.equal(Scrolling.target(list),300);run(900);assert.equal(list.scrollTop,300);
 Scrolling.to(list,2000);run(32);Scrolling.setSmooth(false);assert.equal(list.scrollTop,2000,'Disabling finishes at the destination at once');
 Scrolling.to(list,4800);assert.equal(list.scrollTop,4500,'Targets are clamped to the scroll extent');
});
test('LG Magic Remote: merged events move as many rows as detents they hold, whichever arrives first',()=>{
 for(const sequence of [[53,159,53,212],[159,53,53]]){const {Scrolling,clock}=load(),state={};const moves=sequence.map(delta=>{clock.now+=30;return Scrolling.steps(state,wheel(delta),600);});
  const expected=sequence.map((delta,i)=>i===0&&delta>53?1:Math.min(3,Math.round(delta/53)));assert.deepEqual(moves,expected,JSON.stringify(sequence));}
 const {Scrolling,clock}=load(),state={};clock.now+=30;Scrolling.steps(state,wheel(53),600);clock.now+=30;assert.equal(Scrolling.steps(state,wheel(-159),600),-1,'A reversal starts with one row');clock.now+=30;assert.equal(Scrolling.steps(state,wheel(-159),600),-3);
});
test('layered lists move their content by transform during a motion and set scrollTop once, after it has stopped',()=>{
 const {Scrolling,list,run}=animated(),grid={style:{transform:''},nextElementSibling:null},hero={style:{transform:''},nextElementSibling:grid};
 list.firstElementChild=hero;list.getBoundingClientRect=()=>({top:100});Scrolling.layered(list);Scrolling.setSmooth(true);
 Scrolling.to(list,600);const seen=run(120);assert.equal(list.scrollTop,0,'scrollTop stays still while moving');
 const shiftNow=Number(/translate3d\(0,(-?\d+)px/.exec(grid.style.transform)[1]);assert(shiftNow<0&&shiftNow>-600,'Content moves up by transform');assert.equal(hero.style.transform,grid.style.transform,'Every child moves together');
 assert.equal(Scrolling.visualTop(list),-shiftNow,'Visual position includes the transform');assert.equal(Scrolling.target(list),600);
 const card={getBoundingClientRect:()=>({top:100+300+shiftNow})};assert.equal(Scrolling.contentTop(list,card),300,'Content positions are stable during a motion');
 run(700);assert.equal(list.scrollTop,600,'scrollTop lands on the destination');assert.equal(grid.style.transform,'','The transform is cleared in the same step');assert.equal(Scrolling.visualTop(list),600);
 Scrolling.to(list,1200);run(48);Scrolling.to(list,100,false);assert.equal(list.scrollTop,100);assert.equal(grid.style.transform,'','An immediate jump clears the transform');
});
test('a fast spin far ahead glides at the speed cap instead of covering the distance in a few frames',()=>{
 const {Scrolling,list,run}=animated();Scrolling.setSmooth(true);Scrolling.to(list,3000);const seen=run(1400);
 const steps=seen.map((top,i)=>i?top-seen[i-1]:top);assert(steps.every(step=>step>=0&&step<=4*16+1),'Every frame moves forward at most ~67 px');assert.equal(list.scrollTop,3000);
});
