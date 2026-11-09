const NS='http://www.w3.org/2000/svg';
const palettes={strain:['#5d9a87','#e7f3ed','#b8d7c8','#91bca8'],reactor:['#678faa','#e9f3f9','#bdd6e7','#8dafc6'],extract:['#b69a5b','#fbf4e2','#ead9ab','#d0b97e'],powder:['#9276be','#f2ecfa','#d5c4eb','#b59bd4'],market:['#bd8175','#fbeee8','#e9c4b6','#d4a18e'],factory:['#78858b','#f0f3f4','#c6d1d5','#9eafb6']};
Object.assign(palettes,{pedagogy:['#c97c42','#fff0db','#edc494','#dba978'],teachers:['#486c95','#edf3fa','#bdd0e3','#90acc8'],kitchen:['#719778','#edf4e8','#c7dcc0','#9fbe97'],erp:['#7d83b3','#f0effb','#cecbed','#a7a9cf'],campus:['#aa8a5d','#fcf4e6','#e9d4b2','#ceb58c']});
palettes.facility=['#8b82aa','#f6f2fb','#ddd4eb','#b7a9d0'];
Object.assign(palettes,{strain:['#4f8157','#d8e5ca','#a7ce9b','#659b6d'],reactor:['#397e83','#cce3de','#83bfc0','#4e9a9e'],extract:['#927333','#f4e5b6','#e4c669','#ac893b'],powder:['#6f5687','#e6dceb','#b9a4d0','#79638f'],market:['#a47c2f','#f2e2b1','#dbbd63','#b39142'],factory:['#397e83','#d3e6e2','#8bbfbd','#559597'],facility:['#6f5687','#e6dceb','#b9a4d0','#79638f']});
const positions={strain:[-230,-130],reactor:[0,-130],extract:[230,-130],market:[-230,130],factory:[0,130],powder:[230,130],pedagogy:[-230,-130],teachers:[0,-130],kitchen:[230,-130],erp:[-200,130],campus:[100,130]};
let selected='strain',phase='now',yaw=Math.PI/6,zoom=1;
let currentProject=null,root=null;
let growthAmounts=new Map(),animationFrame=0;
let searchQuery='',panX=0,panY=0,cameraMode='orbit';
export function makePortfolio(projects){
  const available=projects.filter(project=>project?.roadmap?.streams?.length);
  if(!available.length)return null;
  const streams=available.flatMap((project,index)=>project.roadmap.streams.map((stream,streamIndex)=>({...stream,id:project.id+':'+stream.id,sourceId:stream.id,dependsOn:stream.dependsOn.map(id=>project.id+':'+id),owner:project,position:[(project.roadmap.streams.some(s=>s.kind==='facility')||new Set(project.roadmap.streams.map(s=>s.kind)).size<project.roadmap.streams.length?(streamIndex%3-1)*230:positions[stream.kind][0])+(index-(available.length-1)/2)*800,(project.roadmap.streams.some(s=>s.kind==='facility')||new Set(project.roadmap.streams.map(s=>s.kind)).size<project.roadmap.streams.length?Math.floor(streamIndex/3)*260-130:positions[stream.kind][1])]})));
  return {...available[0],id:available.map(p=>p.id).join('+'),name:available.length>1?'All roadmaps':available[0].name,_projects:available,roadmap:{...available[0].roadmap,theme:available.length>1?'portfolio':available[0].roadmap.theme,streams}};
}
function isPortfolio(){return currentProject?._projects?.length>1;}
function known(stream){return ownerOf(stream).roadmap.progressKnown!==false&&stream.progressKnown!==false&&stream.stages.length>0;}
function locationOf(stream){return stream.position||positions[stream.kind];}
function ownerOf(stream){return stream.owner||currentProject;}
function matchesSearch(stream){return (stream.name+' '+ownerOf(stream).name+' '+stream.goal).toLowerCase().includes(searchQuery.toLowerCase().trim());}
function focusProject(projectId){root.dispatchEvent(new CustomEvent('roadmap-project-filter',{bubbles:true,detail:{projectId}}));}
const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
const svg=(tag,attrs={},text)=>{const node=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
function button(text,label,handler,cls=''){const node=el('button',text,cls);node.type='button';if(label)node.setAttribute('aria-label',label);node.onclick=handler;return node;}
function shownSteps(stream){
  if(phase.startsWith('project-step:')){const [,projectId,step]=phase.split(':');return ownerOf(stream).id===projectId?(ownerOf(stream).roadmap.streams.findIndex(s=>s.id===stream.sourceId)<Number(step)?stream.stages.length:0):stream.completedStages;}
  if(phase.startsWith('step-'))return currentProject.roadmap.streams.indexOf(stream)<Number(phase.slice(5))?stream.stages.length:0;
  return phase==='goal'?stream.stages.length:Math.min(stream.stages.length,stream.completedStages+(phase==='next'?1:0));
}
function projectPoint(x,y,z=0){const fit=isPortfolio()?Math.min(.58,1.16/currentProject._projects.length):1;return [500+panX+(x*Math.cos(yaw)-y*Math.sin(yaw))*zoom*fit,(isPortfolio()?230:282)+panY+((x*Math.sin(yaw)+y*Math.cos(yaw))*.46-z*.95)*zoom*fit];}
function depth(x,y){return x*Math.sin(yaw)+y*Math.cos(yaw);}
const points=vertices=>vertices.map(point=>projectPoint(...point).map(n=>n.toFixed(2)).join(',')).join(' ');
function polygon(group,vertices,fill,stroke='#fff',extra={}){group.append(svg('polygon',{points:points(vertices),fill,stroke,'stroke-width':.8,'stroke-linejoin':'round',...extra}));}
function line(group,vertices,color,width=1,extra={}){group.append(svg('polyline',{points:points(vertices),fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round',...extra}));}
function box(group,x,y,z,w,d,h,colors){
  const a=[x,y,z],b=[x+w,y,z],c=[x+w,y+d,z],e=[x,y+d,z];
  const top=p=>[p[0],p[1],p[2]+h];
  const sides=[[a,b],[b,c],[c,e],[e,a]].sort((u,v)=>(depth(...u[0])+depth(...u[1]))-(depth(...v[0])+depth(...v[1])));
  for(const [u,v] of sides)polygon(group,[u,v,top(v),top(u)],depth(v[0]-u[0],v[1]-u[1])>0?colors[2]:colors[3]);
  polygon(group,[top(a),top(b),top(c),top(e)],colors[1]);
}
function cylinder(group,x,y,z,r,h,colors){
  const ring=Array.from({length:16},(_,i)=>[x+Math.cos(i*Math.PI/8)*r,y+Math.sin(i*Math.PI/8)*r,z]);
  const faces=ring.map((point,i)=>[point,ring[(i+1)%16]]).sort((u,v)=>(depth(...u[0])+depth(...u[1]))-(depth(...v[0])+depth(...v[1])));
  for(const [a,b] of faces)polygon(group,[a,b,[b[0],b[1],z+h],[a[0],a[1],z+h]],depth(a[0]-x,a[1]-y)>0?colors[2]:colors[3],colors[2]);
  polygon(group,ring.map(point=>[point[0],point[1],z+h]),colors[1],colors[3]);
  line(group,[[x,y,z+h],[x,y,z+h+10]],colors[0],2);
}
function building(group,stream){
  const [cx,cy]=locationOf(stream),colors=palettes[stream.kind],amount=growthAmounts.get(stream.id)??shownSteps(stream)/(stream.stages.length||1);
  const h=14+amount*65,baseZ=8;
  // Planned footprint remains visible while each independent facility grows.
  polygon(group,[[cx-72,cy-55,4],[cx+72,cy-55,4],[cx+72,cy+55,4],[cx-72,cy+55,4]],colors[1],selected===stream.id?colors[0]:'#deded8',{'stroke-width':selected===stream.id?2:1});
  if(stream.kind==='pedagogy'){
    box(group,cx-61,cy-35,baseZ,122,70,h*.68,colors);
    box(group,cx-19,cy-40,baseZ+h*.68,38,80,10+amount*15,colors);
    for(let i=0;i<4;i++)box(group,cx-50+i*28,cy+36,baseZ+3,17,3,Math.max(7,h*.4),['#748da2','#eaf3f9','#b7cedd','#a4bfce']);
    const flag=projectPoint(cx,cy,baseZ+h*.68+37);group.append(svg('text',{x:flag[0],y:flag[1],'text-anchor':'middle',fill:colors[0],'font-size':13,'font-weight':600},'AP'));
  }else if(stream.kind==='teachers'){
    box(group,cx-55,cy-35,baseZ,110,70,h*.84,colors);
    box(group,cx-65,cy+18,baseZ,130,19,11,colors);
    for(let i=0;i<4;i++){box(group,cx-46+i*28,cy+37,baseZ+12,16,3,h*.45,['#748da2','#f9fcff','#e3edf4','#bdcfdc']);}
    const sign=projectPoint(cx,cy,baseZ+h*.84+12);group.append(svg('text',{x:sign[0],y:sign[1],'text-anchor':'middle',fill:colors[0],'font-size':12,'font-weight':600},'KKU'));
  }else if(stream.kind==='kitchen'){
    box(group,cx-58,cy-32,baseZ,116,64,h*.5,colors);
    box(group,cx-40,cy-20,baseZ+h*.5,80,40,6,colors);
    for(let i=0;i<2;i++)cylinder(group,cx-21+i*40,cy,baseZ+h*.5+6,10,8+amount*13,colors);
    box(group,cx-39,cy+34,baseZ,78,18,7,colors);
  }else if(stream.kind==='erp'){
    box(group,cx-53,cy-34,baseZ,106,68,h*.7,colors);
    for(let i=0;i<3;i++)box(group,cx-39+i*27,cy-17,baseZ+h*.7,20,34,8+amount*20,colors);
    const p=projectPoint(cx,cy,baseZ+h*.7+40);group.append(svg('text',{x:p[0],y:p[1],'text-anchor':'middle',fill:colors[0],'font-size':12,'font-weight':600},'ERP'));
  }else if(stream.kind==='campus'){
    // Boarding and retail remain one strategic step, represented by two buildings.
    box(group,cx-66,cy-40,baseZ,53,75,h*1.05,colors);
    for(let level=0;level<Math.max(1,Math.ceil(amount*4));level++)for(let i=0;i<2;i++)box(group,cx-58+i*24,cy+36,baseZ+8+level*17,13,2,9,['#718ba0','#e8f2f9','#c1d8e6','#aac6d8']);
    box(group,cx-3,cy-36,baseZ,70,70,h*.48,colors);
    box(group,cx+4,cy-29,baseZ+h*.48,56,56,6,['#768e99','#eaf2f6','#bdcfd5','#a6bdc6']);
    for(let i=0;i<3;i++)box(group,cx+4+i*21,cy+35,baseZ+4,16,9,h*.32,colors);
  }else if(stream.kind==='reactor'){
    box(group,cx-53,cy-31,baseZ,106,62,7,colors);
    const vessels=amount<.5?1:amount<1?2:3;
    for(let i=0;i<vessels;i++)cylinder(group,cx-31+i*31,cy,baseZ+7,14,h+(i===1?12:0),colors);
    line(group,[[cx-46,cy+27,baseZ+17],[cx+45,cy+27,baseZ+17],[cx+45,cy+27,baseZ+37]],colors[0],3);
  }else if(stream.kind==='extract'){
    box(group,cx-51,cy-25,baseZ,65,51,h*.65,colors);
    cylinder(group,cx+34,cy,baseZ,18,h,colors);
    line(group,[[cx-16,cy,baseZ+h*.65],[cx-16,cy,baseZ+h+8],[cx+34,cy,baseZ+h+8],[cx+34,cy,baseZ+h]],colors[0],3);
    if(amount>.5)box(group,cx-36,cy-18,baseZ+h*.65,37,36,13,colors);
  }else if(stream.kind==='powder'){
    box(group,cx-52,cy-27,baseZ,70,54,h*.65,colors);
    cylinder(group,cx+36,cy-6,baseZ,16,h+10,colors);
    if(amount>.25)for(let i=0;i<Math.ceil(amount*3);i++)box(group,cx-45+i*21,cy+29,baseZ,16,17,14,colors);
  }else if(stream.kind==='factory'){
    box(group,cx-61,cy-39,baseZ,122,78,h*.74,colors);
    for(let i=0;i<3;i++)box(group,cx-54+i*38,cy-31,baseZ+h*.74,31,60,6+amount*10,colors);
    if(amount>.25){box(group,cx+38,cy-32,baseZ+h*.74,10,10,16+amount*24,colors);}
    if(amount>.5)for(let i=0;i<3;i++)box(group,cx-46+i*32,cy+40,baseZ,25,12,18,colors);
  }else if(stream.kind==='market'){
    box(group,cx-45,cy-29,baseZ,90,58,h*.75,colors);
    box(group,cx-34,cy-21,baseZ+h*.75,68,9,18+amount*13,colors);
    if(amount>.5)box(group,cx-30,cy+31,baseZ,60,17,9,colors);
  }else{
    box(group,cx-53,cy-30,baseZ,106,60,h*.7,colors);
    box(group,cx-43,cy-22,baseZ+h*.7,36,44,13+amount*22,colors);
    if(amount>.25)for(let i=0;i<Math.ceil(amount*3);i++)cylinder(group,cx+7+i*14,cy-4,baseZ+h*.7,5,14,colors);
  }
  if(amount===0){const p=projectPoint(cx,cy,baseZ+30);group.append(svg('text',{x:p[0],y:p[1],'text-anchor':'middle',fill:colors[0],'font-size':10},'PLANNED'));}
}
function renderScene(){
  const host=root.querySelector('.facility-scene');host.replaceChildren();
  const hint=root.querySelector('.facility-hint');if(hint)hint.textContent=cameraMode==='pan'?'Drag to pan · Fit returns to the full map':window.matchMedia('(max-width:700px)').matches?'Swipe across map · Filter a project to focus':'Drag to orbit · Select a building';
  const scene=svg('svg',{viewBox:'0 0 1000 '+(isPortfolio()?440:570),class:'facility-world',role:'group','aria-label':'Interactive 3D roadmap. Select a building, filter a project, or use the facility list below.'});
  const ground=svg('g',{'aria-hidden':'true'}),neutral=['#bcc5c2','#fafbf9','#e5e9e4','#d5dcd6'];
  const extra=(currentProject._projects.length-1)*400,limit=355+extra;
  box(ground,-limit,-245,-12,limit*2,490,12,neutral);
  for(let x=-limit+25;x<limit-5;x+=30)line(ground,[[x,-230,1],[x,230,1]],'#e9ede7',.7);
  for(let y=-230;y<240;y+=30)line(ground,[[-limit+15,y,1],[limit-15,y,1]],'#e9ede7',.7);
  // A shared service road links the campus; colored lines indicate handoffs.
  line(ground,[[-limit+25,0,2],[limit-25,0,2]],'#e4e8e2',25);line(ground,[[-limit+25,0,3],[limit-25,0,3]],'#fff',1.5,{'stroke-dasharray':'7 10'});
  currentProject._projects.forEach((project,index)=>{const dx=(index-(currentProject._projects.length-1)/2)*800;if(isPortfolio())polygon(ground,[[dx-345,-235,2],[dx+345,-235,2],[dx+345,235,2],[dx-345,235,2]],'none',project.roadmap.theme==='education'?'#e1c8a8':'#b9cfbf',{'stroke-width':1.4,'stroke-dasharray':'4 6'});});
  const streams=currentProject.roadmap.streams;
  for(const stream of streams){const [x,y]=locationOf(stream),midY=0;for(const dependency of stream.dependsOn){const from=streams.find(s=>s.id===dependency);if(!from)continue;const [fx,fy]=locationOf(from);const highlighted=selected===stream.id||selected===from.id;line(ground,[[fx,fy,5],[fx,midY,5],[x,midY,5],[x,y,5]],highlighted?palettes[stream.kind][0]:'#bdc8c2',highlighted?2.5:1.5,{'stroke-dasharray':'4 6',opacity:highlighted?1:.65});}}
  scene.append(ground);
  const structures=[...streams].sort((a,b)=>depth(...locationOf(a))-depth(...locationOf(b)));
  for(const stream of structures){
    const group=svg('g',{class:'facility-building',tabindex:matchesSearch(stream)?0:-1,role:'button','aria-label':ownerOf(stream).name+' · '+stream.name+', '+(!known(stream)?'progress unconfirmed':stream.completedStages+' of '+stream.stages.length+' stages complete')+'. View details.','aria-pressed':String(selected===stream.id),'data-facility':stream.id,opacity:matchesSearch(stream)?1:.18});
    building(group,stream);group.onclick=()=>selectFacility(stream.id);group.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();selectFacility(stream.id);}};scene.append(group);
  }
  // Screen-facing captions stay legible as the campus rotates.
  for(const stream of structures){
    const [cx,cy]=locationOf(stream),p=projectPoint(cx,cy+66,2),colors=palettes[stream.kind];
    const group=svg('g',{class:'facility-caption','aria-hidden':'true','data-facility':stream.id,opacity:matchesSearch(stream)?1:.18});
    const short={strain:'01 · Yeast strain',reactor:'02 · Bioreactor',extract:'03 · Yeast extract',powder:'04 · Protein powder',market:'05 · Marketing',factory:'06 · Real factory',pedagogy:'01 · AP & pedagogy',teachers:'02 · KKU teachers',kitchen:'03 · Central kitchen',erp:'04 · All ERP',campus:'05 · Boarding & mall'}[stream.kind]||stream.name.slice(0,22);
    const labelWidth=isPortfolio()?116:146;
    group.append(svg('rect',{x:p[0]-labelWidth/2,y:p[1],width:labelWidth,height:40,rx:7,fill:'#fff',stroke:selected===stream.id?colors[0]:'#e6e7e1','stroke-width':selected===stream.id?1.5:1}));
    group.append(svg('text',{x:p[0],y:p[1]+15,'text-anchor':'middle',fill:'#454a43','font-size':isPortfolio()?9.5:11,'font-weight':550},short));
    const count=shownSteps(stream),label=phase==='now'?(!known(stream)?'Progress unconfirmed':count===stream.stages.length?'Ready':count===0?'Planned':count+' / '+stream.stages.length+' complete'):'Preview · '+count+' / '+stream.stages.length;
    group.append(svg('text',{x:p[0],y:p[1]+29,'text-anchor':'middle',fill:colors[0],'font-size':9},label));group.onclick=()=>selectFacility(stream.id);scene.append(group);
  }
  if(isPortfolio())currentProject._projects.forEach((project,index)=>{const dx=(index-(currentProject._projects.length-1)/2)*800,p=projectPoint(dx,-230,145),color=project.roadmap.theme==='education'?'#c3a079':'#88a994',label=svg('g',{class:'district-label',role:'button',tabindex:0,'aria-label':'Focus '+project.name+' roadmap','data-map-project':project.id});label.append(svg('rect',{x:p[0]-80,y:p[1]-17,width:160,height:34,rx:6,fill:'#fff',stroke:color}));label.append(svg('text',{x:p[0],y:p[1]+4,'text-anchor':'middle',fill:'#626a66','font-size':12,'font-weight':550},project.name+' ↗'));label.onclick=()=>focusProject(project.id);label.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();focusProject(project.id);}};scene.append(label);});
  // Pointer capture belongs to the stable host, because SVG geometry is redrawn.
  host.style.touchAction=cameraMode==='pan'?'none':window.matchMedia('(max-width:700px)').matches?'auto':'pan-y';
  host.onpointerdown=event=>{if(event.button!==0||(event.pointerType==='touch'&&cameraMode==='orbit'))return;host.setPointerCapture(event.pointerId);host._drag={x:event.clientX,y:event.clientY,yaw,panX,panY,moved:false,target:event.target};};
  host.onpointermove=event=>{const drag=host._drag;if(!drag||event.buttons!==1)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)<7&&!drag.moved)return;drag.moved=true;if(cameraMode==='pan'){const bounds=host.querySelector('svg').getBoundingClientRect(),scale=Math.max(1000/bounds.width,(isPortfolio()?440:570)/bounds.height);panX=drag.panX+dx*scale;panY=drag.panY+dy*scale;}else yaw=drag.yaw+dx*.006;renderScene();};
  host.onpointerup=event=>{const drag=host._drag;host._drag=null;if(host.hasPointerCapture(event.pointerId))host.releasePointerCapture(event.pointerId);if(drag&&!drag.moved){const node=drag.target.closest('[data-facility]'),district=drag.target.closest('[data-map-project]');if(node)selectFacility(node.dataset.facility);else if(district)focusProject(district.dataset.mapProject);} };
  host.onpointercancel=()=>{host._drag=null;};
  host.append(scene);
}
function selectFacility(id){selected=id;renderScene();renderDetails();for(const node of root.querySelectorAll('[data-stream]'))node.setAttribute('aria-pressed',String(node.dataset.stream===id));}
function renderDetails(){
  const roadmap=currentProject.roadmap,stream=roadmap.streams.find(item=>item.id===selected)||roadmap.streams[0];selected=stream.id;
  const project=ownerOf(stream);
  const panel=root.querySelector('.facility-detail');panel.replaceChildren();panel.style.setProperty('--facility-color',palettes[stream.kind][0]);
  const title=el('div',undefined,'facility-detail-heading'),copy=el('div');copy.append(el('div',project.name+' / Selected workstream','eyebrow'),el('h3',stream.name));
  const hasProgress=known(stream);
  const metric=el('span',hasProgress?stream.completedStages+' / '+stream.stages.length+' completed':'Progress unconfirmed','facility-metric');title.append(copy,metric);panel.append(title);
  const stages=el('ol',undefined,'facility-stages');stream.stages.forEach((name,index)=>{const item=el('li',undefined,hasProgress?(index<stream.completedStages?'done':index===stream.completedStages?'current':''):'');item.append(el('span',hasProgress&&index<stream.completedStages?'✓':String(index+1),'facility-stage-dot'),el('span',name));if(hasProgress&&index===stream.completedStages)item.append(el('small','Now'));stages.append(item);});panel.append(stages);if(!stream.stages.length)panel.append(el('p','Steps have not been defined yet.','empty'));
  const columns=el('div',undefined,'facility-detail-columns');
  for(const [label,text] of [['Next step',hasProgress&&stream.completedStages===stream.stages.length?'All defined stages completed.':stream.next??'Next step unknown'],['End goal',stream.goal??'Vision unknown']]){const block=el('div');block.append(el('div',label,'eyebrow'),el('p',text));columns.append(block);}panel.append(columns);
  const handoffs=el('div',undefined,'facility-handoffs');handoffs.append(el('span','Connects with','eyebrow'));
  const related=roadmap.streams.filter(item=>stream.dependsOn.includes(item.id)||item.dependsOn.includes(stream.id));
  if(!related.length)handoffs.append(el('span','Independent workstream'));
  for(const item of related)handoffs.append(button(item.name,null,()=>selectFacility(item.id),'handoff-chip'));panel.append(handoffs);
  const people=el('div',undefined,'facility-team');people.append(el('span','Project team','eyebrow'));for(const person of project.assignees||[])people.append(el('span',person.name+(person.role&&!/unspecified|unassigned|team member|not assigned/i.test(person.role)?' · '+person.role:'')));if(!(project.assignees||[]).length)people.append(el('small','Unassigned'));panel.append(people);
  if(isPortfolio()&&project.roadmap.theme==='education'){
    const sequence=el('div',undefined,'education-sequence selected-sequence');sequence.setAttribute('aria-label','Preview Satit transformation steps');
    project.roadmap.streams.forEach((item,index)=>{const action=button(String(index+1)+' · '+item.name.replace(/^\d+\. /,''),null,()=>{selected=project.id+':'+item.id;phase='project-step:'+project.id+':'+(index+1);updatePreview(true);renderDetails();renderRail();},'education-step');action.setAttribute('aria-pressed',String(phase==='project-step:'+project.id+':'+(index+1)));sequence.append(action);});panel.append(sequence);
  }
  if(project.roadmap.vision){const vision=project.roadmap.vision,source=el('details',undefined,'vision-reference');source.append(el('summary',project.id==='satit'?'Vision & original KKUIDS reference':'Project vision'),el('p',vision.mission));for(const pillar of vision.pillars){const detail=el('p');detail.append(el('strong',pillar.title+' · '),document.createTextNode(pillar.detail));source.append(detail);}if(project.id==='satit'){const img=el('img');img.src='./assets/kkuid-vision.jpg';img.alt='User-supplied KKUIDS vision and strategic pillars';img.loading='lazy';source.append(img);}panel.append(source);}
  const summary=root.querySelector('.map-selection-summary');if(summary){summary.replaceChildren(el('span',project.name+' · '+stream.name),button('View details ↓',null,()=>panel.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})));}
}
function renderRail(){
  const rail=root.querySelector('.facility-rail');rail.replaceChildren();
  const streams=currentProject.roadmap.streams.filter(matchesSearch);
  for(const stream of streams){const item=button('',null,()=>selectFacility(stream.id),'facility-tab');item.dataset.stream=stream.id;item.setAttribute('aria-pressed',String(selected===stream.id));item.style.setProperty('--facility-color',palettes[stream.kind][0]);const title=el('span',stream.name);if(isPortfolio())title.prepend(el('em',ownerOf(stream).name));item.append(title,el('small',!known(stream)?'—':Math.round(100*stream.completedStages/(stream.stages.length||1))+'%'));const track=el('i');track.style.setProperty('--width',(100*stream.completedStages/(stream.stages.length||1))+'%');item.append(track);rail.append(item);}
  if(!streams.length)rail.append(el('p','No matching facilities. Clear the search to see everything.','empty'));
  root.querySelector('.map-match-count').textContent=searchQuery?streams.length+' matching facilities':currentProject._projects.length+' projects · '+streams.length+' workstreams';
  const summary=root.querySelector('.facility-directory>summary');if(summary)summary.textContent='Browse facilities · '+streams.length;
}
function updatePreview(animate=false){
  for(const node of root.querySelectorAll('[data-roadmap-phase]'))node.setAttribute('aria-pressed',String(node.dataset.roadmapPhase===phase));
  const education=currentProject.roadmap.theme==='education';
  root.querySelector('.facility-preview-note').textContent=phase==='now'?(isPortfolio()?'Shared roadmap · Select a workstream to see its evidence and progress status.':currentProject.roadmap.progressKnown===false?'Proposed roadmap · Actual progress has not been confirmed.':'Current roadmap · Select a facility to explore its steps.'):phase.startsWith('project-step:')?'Satit concept preview through step '+phase.split(':')[2]+' · Other project progress is unchanged.':phase.startsWith('step-')?'Concept preview through step '+phase.slice(5)+' · '+currentProject.roadmap.streams[Number(phase.slice(5))-1].name.replace(/^\d+\. /,'')+'. Saved progress is unchanged.':phase==='next'?'Future preview · Every workstream advances one stage. Saved progress is unchanged.':'End-goal preview · All visible facilities completed. Saved progress is unchanged.';
  for(const node of root.querySelectorAll('[data-strategy-step]'))node.setAttribute('aria-pressed',String(phase==='step-'+node.dataset.strategyStep));
  root.querySelector('.facility-preview-note').classList.toggle('is-preview',phase!=='now');
  cancelAnimationFrame(animationFrame);
  const from=new Map(growthAmounts),targets=new Map(currentProject.roadmap.streams.map(stream=>[stream.id,shownSteps(stream)/(stream.stages.length||1)]));
  if(animate&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const start=performance.now();
    const tick=now=>{const progress=Math.min(1,(now-start)/480),eased=1-Math.pow(1-progress,3);for(const [id,target] of targets)growthAmounts.set(id,(from.get(id)??target)+(target-(from.get(id)??target))*eased);renderScene();if(progress<1)animationFrame=requestAnimationFrame(tick);};
    animationFrame=requestAnimationFrame(tick);
  }else{growthAmounts=targets;renderScene();}
}
export function renderRoadmap(container,input){
  const project=makePortfolio(Array.isArray(input)?input:[input]);
  cancelAnimationFrame(animationFrame);
  if(currentProject?.id!==project?.id){phase='now';selected=project?.roadmap?.streams[0]?.id||'strain';yaw=project?._projects.length>1?Math.PI/12:Math.PI/6;zoom=1;panX=0;panY=0;searchQuery='';growthAmounts=new Map();}
  root=container;currentProject=project;root.replaceChildren();
  if(!project?.roadmap){root.append(el('p','A facility roadmap has not been published for this project.','empty'));return;}
  const roadmap=project.roadmap;if(!roadmap.streams.some(stream=>stream.id===selected))selected=roadmap.streams[0].id;
  const education=roadmap.theme==='education';root.classList.toggle('education-roadmap',education);root.classList.toggle('portfolio-roadmap',isPortfolio());
  const head=el('div',undefined,'facility-heading'),copy=el('div');copy.append(el('div',isPortfolio()?'Portfolio / Shared 3D map':project.name+' / '+(education?'Education transformation':'Living roadmap'),'eyebrow'),el('h2',isPortfolio()?'One map. Every roadmap.':education?'Transform Thai education.':'Grow the system. Reach the goal.'),el('p',isPortfolio()?'Explore projects together. Filter an area, find a facility, or select a building to see what happens next.':roadmap.goal??'Vision unknown — the roadmap can evolve as the team learns.'));head.append(copy);root.append(head);
  if(!isPortfolio()&&roadmap.vision){const vision=el('div',undefined,'education-vision');vision.append(el('strong',roadmap.vision.title));const pillars=el('div',undefined,'education-pillars');for(const pillar of roadmap.vision.pillars){const card=el('div');card.append(el('h3',pillar.title));pillars.append(card);}vision.append(pillars);root.append(vision);}
  const searchBar=el('div',undefined,'map-search-bar'),search=el('input');search.type='search';search.placeholder='Find a facility…';search.setAttribute('aria-label','Find a facility');search.value=searchQuery;
  const applySearch=()=>{searchQuery=search.value;const matches=roadmap.streams.filter(matchesSearch);if(matches.length&&!matches.some(s=>s.id===selected))selected=matches[0].id;renderScene();renderRail();renderDetails();if(searchQuery)root.querySelector('.facility-directory').open=true;};search.oninput=applySearch;searchBar.append(search,button('Clear','Clear facility search',()=>{search.value='';applySearch();}),el('span',undefined,'map-match-count'));root.append(searchBar);
  const board=el('section',undefined,'facility-board');board.setAttribute('aria-label',project.name+' spatial roadmap');
  const toolbar=el('div',undefined,'facility-toolbar'),phaseButtons=el('div',undefined,'facility-phases');phaseButtons.setAttribute('aria-label','Roadmap growth preview');
  for(const [id,label] of (education||isPortfolio()?[['now','Roadmap'],['goal','End goal']]:[['now','Now'],['next','Next phase'],['goal','End goal']])){const item=button(label,null,()=>{phase=id;updatePreview(true);});item.dataset.roadmapPhase=id;phaseButtons.append(item);}toolbar.append(phaseButtons);
  const complete=roadmap.streams.reduce((sum,item)=>sum+item.completedStages,0),total=roadmap.streams.reduce((sum,item)=>sum+item.stages.length,0);
  toolbar.append(el('span',isPortfolio()?'Select any building to explore':roadmap.progressKnown===false?roadmap.streams.length+' workstreams · Progress unconfirmed':complete+' / '+total+' facility stages complete','facility-overall'));board.append(toolbar);
  if(education){const sequence=el('div',undefined,'education-sequence');sequence.setAttribute('aria-label','Preview the five-step transformation sequence');const labels=['AP & pedagogy','KKU teachers','Central kitchen','All ERP','Boarding & mall'];roadmap.streams.forEach((stream,index)=>{const item=button('',null,()=>{selected=stream.id;phase='step-'+(index+1);updatePreview(true);renderDetails();for(const node of root.querySelectorAll('[data-stream]'))node.setAttribute('aria-pressed',String(node.dataset.stream===selected));},'education-step');item.dataset.strategyStep=index+1;item.append(el('span',String(index+1)),el('strong',labels[index]||stream.name));sequence.append(item);});board.append(sequence);}
  board.append(el('p',undefined,'facility-preview-note'));board.append(el('div',undefined,'facility-scene'));
  const bottom=el('div',undefined,'facility-scene-bottom');bottom.append(el('span',window.matchMedia('(max-width:700px)').matches?'Swipe across map · Use arrows to orbit':'Drag to orbit · Select a building','facility-hint'));
  const camera=el('div',undefined,'facility-camera');camera.setAttribute('aria-label','Map camera');
  const pan=button('Pan','Toggle map pan mode',()=>{cameraMode=cameraMode==='pan'?'orbit':'pan';pan.setAttribute('aria-pressed',String(cameraMode==='pan'));renderScene();});pan.setAttribute('aria-pressed',String(cameraMode==='pan'));camera.append(pan);
  for(const [label,aria,action] of [['↶','Rotate left',()=>yaw-=Math.PI/8],['↷','Rotate right',()=>yaw+=Math.PI/8],['−','Zoom out',()=>zoom=Math.max(.5,zoom-.2)],['+','Zoom in',()=>zoom=Math.min(2.4,zoom+.2)],['Fit','Fit map to view',()=>{yaw=isPortfolio()?Math.PI/12:Math.PI/6;zoom=1;panX=0;panY=0;}]])camera.append(button(label,aria,()=>{action();renderScene();}));bottom.append(camera);board.append(bottom);root.append(board);
  root.append(el('div',undefined,'map-selection-summary'));
  const rail=el('div',undefined,'facility-rail');rail.setAttribute('aria-label','Facility workstreams');
  const detail=el('section',undefined,'facility-detail');detail.setAttribute('aria-live','polite');root.append(detail);
  const directory=el('details',undefined,'facility-directory');directory.open=!isPortfolio();directory.append(el('summary','Browse facilities'),rail);root.append(directory);
  root.append(el('p',education?'Vision and five strategic steps supplied by you. Supporting milestones are proposed; progress and dates remain unconfirmed. Campus buildings are conceptual.':roadmap.isMock?'Illustrative facility stages and progress. A concept roadmap, not a construction plan. AI publications update this view.':roadmap.progressKnown===false?'Proposed facility footprints. Steps, vision and actual progress may still be unknown.':'Facility progress from AI publications. Building sizes represent stage completion, not physical dimensions.','facility-disclaimer'));
  updatePreview();renderDetails();renderRail();
}
