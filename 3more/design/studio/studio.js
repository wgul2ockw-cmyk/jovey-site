// Published output only. Editing and generation belong to the authorized bot workflow.
export const models=Object.freeze([
 {id:'drying-example',name:'Drying module',label:'Agent-authored concept',icon:'♧',color:'#ae8f58',path:'./examples/drying-module/jovey-styled.glb',evidence:'./examples/drying-module/receipt.json',source:'Original agent-authored Blender geometry. Prepared example; not live AI generation.'},
 {id:'research',name:'Research campus',label:'Procedural template',icon:'⌂',color:'#9a84b5',path:'./models/research.glb',evidence:'./skills/jovey-facility-workflow/references/catalog.json',source:'Original procedural Blender template.'},
 {id:'production',name:'Production facility',label:'Procedural template',icon:'▥',color:'#7b9d9b',path:'./models/production.glb',evidence:'./skills/jovey-facility-workflow/references/catalog.json',source:'Original procedural Blender template.'},
 {id:'greenhouse',name:'Greenhouse',label:'Procedural template',icon:'♧',color:'#90aa7b',path:'./models/greenhouse.glb',evidence:'./skills/jovey-facility-workflow/references/catalog.json',source:'Original procedural Blender template.'},
 {id:'warehouse',name:'Warehouse',label:'Procedural template',icon:'▱',color:'#b5a282',path:'./models/warehouse.glb',evidence:'./skills/jovey-facility-workflow/references/catalog.json',source:'Original procedural Blender template.'}
]);
export function mountLibrary(root){
 const doc=root.ownerDocument,$=id=>root.querySelector('#'+id),list=$('model-list');
 let epoch=0,selected=null,disposed=false;
 const make=(tag,text,cls)=>{const e=doc.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const cards=new Map();
 function select(id){
  const model=models.find(m=>m.id===id);if(!model||disposed)return false;
  selected=id;const turn=++epoch;
  for(const [key,card]of cards)card.setAttribute('aria-pressed',String(key===id));
  $('model-name').textContent=model.name;$('model-kind').textContent=model.label;
  $('model-source').textContent=model.source;$('model-evidence').setAttribute('href',model.evidence);
  $('viewer-status').textContent='Loading model…';
  const viewer=doc.createElement('model-viewer');
  for(const [key,value]of Object.entries({src:model.path,'camera-controls':'','shadow-intensity':'1','environment-image':'neutral',exposure:'1',loading:'eager','interaction-prompt':'none',alt:model.name+' concept. Drag to orbit; scroll to zoom.'}))viewer.setAttribute(key,value);
  viewer.addEventListener('load',()=>{if(turn===epoch&&!disposed)$('viewer-status').textContent='Drag to orbit · Scroll to zoom';});
  viewer.addEventListener('error',()=>{if(turn===epoch&&!disposed)$('viewer-status').textContent='Model unavailable. Select a model to retry.';});
  $('viewer-host').replaceChildren(viewer);return true;
 }
 list.replaceChildren();
 for(const model of models){
  const card=make('button',null,'model-card');card.type='button';card.style.setProperty('--model-color',model.color);card.setAttribute('aria-label','View '+model.name);card.setAttribute('aria-pressed','false');
  const icon=make('span',model.icon);icon.setAttribute('aria-hidden','true');const text=make('span',null,'model-copy');text.append(make('strong',model.name),make('small',model.label));card.append(icon,text);card.addEventListener('click',()=>select(model.id));cards.set(model.id,card);list.append(card);
 }
 const reset=()=>select(selected);$('reset-view').addEventListener('click',reset);select(models[0].id);
 return {select,destroy(){disposed=true;epoch++;$('reset-view').removeEventListener('click',reset);$('viewer-host').replaceChildren();list.replaceChildren();}};
}
if(typeof document!=='undefined'){const root=document.querySelector('[data-model-library]');if(root)mountLibrary(root);}
