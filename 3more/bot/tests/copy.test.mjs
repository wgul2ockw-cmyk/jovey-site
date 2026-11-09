import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../connect.js',import.meta.url),'utf8');
function setup(reject=false){
 let click,next=1;const timers=new Map(),status={textContent:''},details={open:false};
 const field={value:'Read the online guide.',closest:()=>details,focus(){this.focused=true;},select(){this.selected=true;}};
 const button={textContent:'Copy starter prompt',dataset:{copyTarget:'starter'},parentElement:{querySelector:()=>status},closest(){return this;}};
 runInNewContext(script,{WeakMap,document:{addEventListener:(name,fn)=>click=fn,getElementById:()=>field,querySelector:()=>status},navigator:{clipboard:{writeText:async()=>{if(reject)throw Error('denied');}}},setTimeout:fn=>{const id=next++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
 return {button,field,details,status,timers,click:()=>click({target:button})};
}
test('rapid repeated copies restore the original label after the last timer',async()=>{const ui=setup();await ui.click();await ui.click();assert.equal(ui.button.textContent,'Copied');assert.equal(ui.timers.size,1);for(const fn of ui.timers.values())fn();assert.equal(ui.button.textContent,'Copy starter prompt');});
test('clipboard denial reveals a closed fallback before focusing and selecting its text',async()=>{const ui=setup(true);ui.field.focus=function(){assert.equal(ui.details.open,true);this.focused=true;};await ui.click();assert.equal(ui.details.open,true);assert.equal(ui.field.focused,true);assert.equal(ui.field.selected,true);assert.equal(ui.button.textContent,'Copy starter prompt');assert.match(ui.status.textContent,/Select and copy/);assert.equal(ui.timers.size,0);});
