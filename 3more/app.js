import {renderRoadmap} from './roadmap.js';
const $ = id => document.getElementById(id);
let projects=[];
let rawProjects=[];
let teamUpdates=[];
let publicationRevision=0;
function displayProject(p){
 const unknown=label=>({title:label+' unknown',detail:'Not defined yet. The team can explore this without committing to an answer.'});
 return {...p,progressKnown:p.progressKnown??p.roadmap?.progressKnown??true,description:p.description??'Project details not defined yet.',goal:p.goal??'Vision unknown',outcome:p.outcome??'End goal not defined yet',previous:p.previous??unknown('Previous step'),next:p.next??unknown('Next step'),meeting:p.meeting?{...p.meeting,decision:p.meeting.decision??'No decision recorded',openQuestion:p.meeting.openQuestion??'No open question recorded'}:{...unknown('Meeting'),decision:'No decision recorded',openQuestion:'Meeting has not been recorded.'}};
}
let progressGroup='personal';
let mainView='progress';
let calendarFilter='all';
let selectedId=null;
let selectedStep='next';
let signature='';
let loading=false;
let progressDisplay='roadmap';
let roadmapProjectId='all';
function openRoadmap(project){
  roadmapProjectId=project.id;progressGroup=project.kind;progressDisplay='roadmap';
  if($('project-dialog').open)$('project-dialog').close();
  history.replaceState(null,'','#roadmap-'+project.id);setMainView('progress');$('progress-view').scrollIntoView({block:'start'});
}
function element(tag,text,className) {
  const node=document.createElement(tag);
  if(text!==undefined) node.textContent=text;
  if(className) node.className=className;
  return node;
}
function labeled(title,hint) {
  const row=element('div',undefined,'section-title');
  row.append(element('h2',title));
  if(hint) row.append(element('span',hint,'hint'));
  return row;
}
function svgElement(tag,attributes,text) {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [name,value] of Object.entries(attributes)) node.setAttribute(name,String(value));
  if(text!==undefined) node.textContent=text;
  return node;
}
function drawMap(project) {
  const svg=svgElement('svg',{viewBox:'0 0 400 225',role:'img','aria-label':'Dependencies feed the next action, which leads to the project goal.',class:'map'});
  const defs=svgElement('defs',{}),marker=svgElement('marker',{id:'arrowhead',markerWidth:7,markerHeight:7,refX:5,refY:3,orient:'auto'});
  marker.append(svgElement('path',{d:'M0 0 L6 3 L0 6',fill:'#b2a0c9'}));defs.append(marker);svg.append(defs);
  const count=project.dependencies.length;
  project.dependencies.forEach((dependency,index)=>{
    const x=200+(index-(count-1)/2)*(360/count);
    svg.append(svgElement('path',{d:`M ${x} 50 C ${x} 80 200 75 200 105`,fill:'none',stroke:'#d9cee9','stroke-width':1.4,'marker-end':'url(#arrowhead)'}));
    svg.append(svgElement('circle',{cx:x,cy:30,r:19,fill:'#f7f4fc',stroke:'#e5dced'}));
    svg.append(svgElement('text',{x,y:34,'text-anchor':'middle'},String(index+1)));
  });
  svg.append(svgElement('rect',{x:121,y:105,width:158,height:43,rx:9,fill:'#f0e9fb',stroke:'#d6c5ed'}));
  svg.append(svgElement('text',{x:200,y:130,'text-anchor':'middle'},'Next action'));
  svg.append(svgElement('path',{d:'M200 148 L200 175',stroke:'#b2a0c9','stroke-width':1.4,'marker-end':'url(#arrowhead)'}));
  svg.append(svgElement('rect',{x:135,y:180,width:130,height:34,rx:17,fill:'#9174bc'}));
  const goal=svgElement('text',{x:200,y:201,'text-anchor':'middle'},'End goal');goal.style.fill='white';svg.append(goal);
  return svg;
}
function stageChart(project) {
  const panel=element('section',undefined,'panel');
  panel.append(labeled('Milestone path',project.progressKnown===false?'Progress unknown':`${project.completedStages} of ${project.stages.length} stages complete`));
  const chart=element('div',undefined,'chart');
  chart.setAttribute('role','img');
  chart.setAttribute('aria-label',project.progressKnown===false?'Progress unknown':`${project.completedStages} of ${project.stages.length} stages complete${project.dataMode==='mock'?' in this example':''}`);
  project.stages.forEach((stage,index)=>chart.append(element('span',undefined,'chart-segment '+(index<project.completedStages?'done':index===project.currentStage?'current':''))));
  const legend=element('div',undefined,'legend');
  for(const [label,style] of [['Complete','done'],['Current','current'],['Ahead','']]) {
    const item=element('span');item.append(element('i',undefined,style),document.createTextNode(label));legend.append(item);
  }
  const milestones=element('div',undefined,'milestones');
  project.stages.forEach((stage,index)=>{
    const state=project.progressKnown===false?'':index<project.completedStages?'done':index===project.currentStage?'current':'';
    const row=element('div',undefined,'milestone '+state);
    row.append(element('i',state==='done'?'✓':String(index+1)),element('span',stage));
    if(state==='current') row.append(element('small','Now'));
    milestones.append(row);
  });
  if(!project.stages.length)milestones.append(element('p','Plan not defined yet.','empty'));
  panel.append(chart,legend,milestones);return panel;
}
function renderDetail(project) {
  const content=$('step-detail');content.replaceChildren();
  const descriptions={previous:'Previous step',meeting:'Meeting',next:'Next step',goal:'End goal'};
  const item=selectedStep==='goal'?{title:project.goal,detail:project.outcome}:project[selectedStep];
  const left=element('div');left.append(element('div',descriptions[selectedStep],'eyebrow'),element('h3',item.title),element('p',item.detail));
  const right=element('div',undefined,'decision');
  right.append(element('div','Meeting outcome','eyebrow'),element('h3',project.meeting.decision),element('p',project.meeting.openQuestion));
  content.append(left,right);
  for(const button of $('journey').children) button.setAttribute('aria-pressed',String(button.dataset.step===selectedStep));
}
function renderProject() {
  const project=projects.find(p=>p.id===selectedId);if(!project)return;
  const main=$('project-detail');main.replaceChildren();
  if(project.roadmap){const action=element('button','Explore 3D facility roadmap ↗','roadmap-link');action.onclick=()=>openRoadmap(project);main.append(action);}
  const heading=element('div',undefined,'heading'),name=element('div');
  name.append(element('div',project.kind+' / project map','eyebrow'),element('h2',project.name),element('p',project.description,'intro'));
  heading.append(name,element('span',project.dataMode==='mock'?'Sample AI update':project.dataMode==='planning'?'Proposed plan':'Source-backed update','prototype'));
  const goal=element('section',undefined,'goal'),goalText=element('div');
  goalText.append(element('div','End goal','eyebrow'),element('p',project.goal));
  goal.append(element('span','◎','goal-symbol'),goalText);
  const journey=element('div',undefined,'journey');journey.id='journey';
  const steps=[['previous','Previous step'],['meeting','Meeting'],['next','Next step'],['goal','End goal']];
  steps.forEach(([key,label],index)=>{
    const button=element('button',undefined,'stage');button.dataset.step=key;button.setAttribute('aria-controls','step-detail');
    const top=element('span',undefined,'stage-top');top.append(element('span',String(index+1).padStart(2,'0'),'step-number'),element('span',label,'step-label'));
    button.append(top,element('strong',key==='goal'?project.outcome:project[key].title));
    button.onclick=()=>{selectedStep=key;renderDetail(project);};journey.append(button);
  });
  const detail=element('section',undefined,'detail');detail.id='step-detail';detail.setAttribute('aria-live','polite');
  const bottom=element('div',undefined,'bottom-grid');
  const map=element('section',undefined,'panel');map.append(labeled('What moves this forward','Dependency map'),drawMap(project));
  const dependencies=element('div',undefined,'map-list');project.dependencies.forEach((dependency,index)=>dependencies.append(element('span',`${index+1} · ${dependency}`)));
  map.append(dependencies);bottom.append(stageChart(project),map);
  const evidence=element('section',undefined,'evidence');
  evidence.append(element('div','Latest AI publication','eyebrow'),element('p',project.updateNote,'update-note'));
  const when=project.updatedAt?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(project.updatedAt)):'Prototype snapshot';
  evidence.append(element('span',`${when} · Revision ${project.revision}`));
  const links=element('div',undefined,'evidence-links');
  for(const source of project.sources) {
    const link=element('a',source.label+' ↗');link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);
  }
  if(!project.sources.length) links.append(element('span',project.dataMode==='mock'?'Illustrative content · Real meeting and task sources are not connected.':'Planning record · Evidence links have not been added.'));
  if(project.url){const link=element('a','Project reference ↗');link.href=project.url;link.target='_blank';link.rel='noopener noreferrer';links.append(link);}
  evidence.append(links);
  const questions=element('section',undefined,'open-questions');
  for(const q of project.questions||[]){questions.append(element('h3',q.question),element('p',q.answer??'Open — answer unknown'));}
  main.append(heading,peopleFor(project),questions,goal,labeled('The project story','Select a step for detail'),journey,detail,bottom,evidence,element('p','AI publications appear automatically. This view is read-only.','footer-note'));
  renderDetail(project);
  main.querySelector('.heading h2').id='project-dialog-title';
}
function progress(project) {
  return project.progressKnown===false||!project.stages.length?null:Math.round(100*project.completedStages/project.stages.length);
}
function peopleFor(project) {
  const row=element('div',undefined,'people');
  row.setAttribute('aria-label','Assigned people');
  const assignees=project.assignees||[];
  if(!assignees.length){row.append(element('span','Unassigned','person-name'));return row;}
  for(const person of assignees) {
    const item=element('span',undefined,'person');
    const initials=person.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase();
    const avatar=element('span',initials,'avatar');avatar.setAttribute('aria-hidden','true');
    item.append(avatar,element('span',person.name,'person-name'));
    item.title=person.role+(person.isPlaceholder?' · Role placeholder':'');row.append(item);
  }
  if(assignees.some(person=>person.isPlaceholder))row.append(element('span','Role placeholder','placeholder-note'));
  return row;
}
function openProject(project) {
  selectedId=project.id;selectedStep='next';renderProject();
  if(!$('project-dialog').open)$('project-dialog').showModal();
}
function makeLegend() {
  const legend=element('div',undefined,'legend');
  for(const [name,state] of [['Complete','done'],['Current','current'],['Ahead','']]){
    const item=element('span');item.append(element('i',undefined,state),document.createTextNode(name));legend.append(item);
  }
  return legend;
}
function renderOverview() {
  const scope=projects.filter(project=>project.kind===progressGroup);
  const groupTitle=progressGroup==='personal'?'Personal':'Team';
  const measured=scope.filter(p=>p.progressKnown!==false&&p.stages.length);
  const total=measured.reduce((sum,project)=>sum+project.stages.length,0);
  const completed=measured.reduce((sum,project)=>sum+project.completedStages,0);
  const percent=total?Math.round(100*completed/total):0;
  const panel=element('section',undefined,'summary-panel');
  const top=element('div',undefined,'summary-top'),heading=element('div');
  heading.append(element('h2',groupTitle+' progress'),element('p','Progress from the first milestone to the end goal.','summary-subtitle'));
  const overall=element('div',undefined,'overall'),ring=element('div',undefined,'ring');
  ring.style.setProperty('--progress',percent+'%');ring.append(element('span',total?percent+'%':'—'));
  ring.setAttribute('role','img');ring.setAttribute('aria-label',!total?'Progress unknown':`${completed} of ${total} milestones completed across ${progressGroup} projects`);
  const overallCopy=element('div');overallCopy.append(element('strong',`${completed} / ${total} milestones`),element('small',`${scope.length-measured.length} projects have unknown progress`));
  overall.append(ring,overallCopy);top.append(heading,overall);
  const stats=element('div',undefined,'summary-stats');
  for(const [value,label] of [[scope.length,'projects'],[completed,'complete'],[total-completed,'remaining']]) {
    const item=element('span');item.append(element('b',String(value)),document.createTextNode(label));stats.append(item);
  }
  stats.append(makeLegend());
  const scroll=element('div',undefined,'tracking-scroll'),chart=element('div',undefined,'tracking-chart');
  scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label',groupTitle+' project milestone paths. Scroll horizontally on smaller screens.');
  const chartHead=element('div',undefined,'tracking-head');
  chartHead.append(element('span','Project'),element('span','Milestone path → end goal'),element('span','Done'));chart.append(chartHead);
  for(const project of scope) {
    const row=element('div',undefined,'tracking-row'),name=element('button',undefined,'chart-name');
    name.dataset.focus='chart-'+project.id;name.setAttribute('aria-label','View '+project.name);
    name.append(element('span',undefined,'project-dot '+project.kind),element('span',project.name,'name'));
    name.onclick=()=>openProject(project);
    const track=element('div',undefined,'track');track.setAttribute('role','img');
    track.setAttribute('aria-label',project.progressKnown===false?project.name+', progress unknown':`${project.name}, ${project.completedStages} of ${project.stages.length} milestones completed. Current stage ${project.stages[project.currentStage]||'Complete'}.`);
    project.stages.forEach((stage,index)=>{
      const state=project.progressKnown===false?'':index<project.completedStages?'done':index===project.currentStage?'current':'';
      const segment=element('span',(state==='done'?'✓ ':'')+stage,'track-step '+state);
      segment.title=stage+' · '+(state==='done'?'Complete':state==='current'?'Current':'Ahead');track.append(segment);
    });
    if(!project.stages.length)track.append(element('span','Plan not defined yet','track-step'));
    row.append(name,track,element('span',(progress(project)===null?'Unknown':progress(project)+'%'),'track-value'));chart.append(row);
  }
  scroll.append(chart);
  panel.append(top,stats,scroll,element('div','Progress counts completed milestones. Each milestone has equal weight.','portfolio-footer'));
  $('overview').replaceChildren(panel);
  $('data-badge').textContent=projects.some(p=>p.dataMode==='mock')?'Includes sample data':'Source-backed updates';
}
function renderCards() {
  const visible=projects.filter(project=>progressDisplay==='roadmap'?project.roadmap&&(roadmapProjectId==='all'||project.id===roadmapProjectId):project.kind===progressGroup);
  const cards=visible.map(project=>{
    const card=element('article',undefined,'project-card'),top=element('div',undefined,'card-top');
    top.append(element('span',project.icon,'card-icon'),element('span',project.kind==='team'?'Team':'Personal','kind'));
    const name=element('button',undefined,'project-name');name.dataset.focus='card-'+project.id;
    name.append(element('span',project.name),element('span','↗'));name.setAttribute('aria-label','Open '+project.name);name.onclick=()=>openProject(project);
    const progressRow=element('div',undefined,'card-progress'),track=element('div',undefined,'mini-track'),fill=element('span');
    fill.style.width=(progress(project)??0)+'%';track.append(fill);
    progressRow.append(track,element('small',(progress(project)===null?'Unknown':progress(project)+'%')));
    const next=element('div',undefined,'next-action');next.append(element('div','Next step','eyebrow'),element('p',project.next.title));
    card.append(top,name,element('p',project.goal,'card-goal'),progressRow,next,peopleFor(project));
    if(project.roadmap){const action=element('button','Explore 3D roadmap ↗','roadmap-link');action.onclick=()=>openRoadmap(project);card.append(action);}return card;
  });
  $('project-cards').replaceChildren(...cards);
  if(!visible.length)$('project-cards').append(element('p','No projects in this view yet.','empty'));

}
function renderNav() {
  for(const kind of ['personal','team']) {
    const subset=projects.filter(project=>project.kind===kind);
    $(kind+'-count').textContent=subset.length;
    $(kind+'-nav').replaceChildren(...subset.map(project=>{
      const button=element('button');button.dataset.focus='nav-'+project.id;
      button.append(element('span',project.icon,'project-icon'),element('span',project.name));
      button.onclick=()=>openProject(project);return button;
    }));
  }
}
let sidebarCollapsed=window.matchMedia('(max-width:700px)').matches;
try {const saved=localStorage.getItem('jovey-sidebar-collapsed');if(saved!==null)sidebarCollapsed=saved==='true';}catch{}
function setSidebar() {
  $('shell').classList.toggle('collapsed',sidebarCollapsed);
  $('sidebar-content').hidden=sidebarCollapsed;
  $('sidebar-toggle').setAttribute('aria-expanded',String(!sidebarCollapsed));
  $('sidebar-toggle').setAttribute('aria-label',sidebarCollapsed?'Expand sidebar':'Collapse sidebar');
  $('sidebar-toggle').title=sidebarCollapsed?'Expand sidebar':'Collapse sidebar';
}
$('sidebar-toggle').onclick=()=>{
  sidebarCollapsed=!sidebarCollapsed;setSidebar();
  try{localStorage.setItem('jovey-sidebar-collapsed',String(sidebarCollapsed));}catch{}
};
setSidebar();

$('close-dialog').onclick=()=>$('project-dialog').close();

async function refresh() {
  if(loading)return;loading=true;
  try {
    const response=await fetch('./data/dashboard.json?v='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error('Could not load updates');
    const data=await response.json();
    if(!Array.isArray(data.projects))throw new Error('Invalid project data');
    teamUpdates=Array.isArray(data.updates)?data.updates:[];publicationRevision=data.revision||0;
    const nextSignature=JSON.stringify([publicationRevision,data.projects.map(p=>[p.id,p.revision])]);
    if(signature!==nextSignature) {
      const focused=document.activeElement?.dataset.focus;
      rawProjects=data.projects;projects=data.projects.map(displayProject);signature=nextSignature;renderNav();renderProgress();
      if(mainView==='calendar')renderCalendar();

      refreshEventDialog();
      if($('project-dialog').open)renderProject();
      if(focused)document.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
    }
    if(mainView==='bots')renderBotHub();
    $('sync-status').textContent='Published version '+publicationRevision+' · Checking for updates automatically';
  } catch {
    $('sync-status').textContent=projects.length?'Connection interrupted · Last update shown':'Updates unavailable · Retrying automatically';
    if(!projects.length)$('overview').replaceChildren(element('p','Project updates could not be loaded. This page will retry automatically.','loading'));
  } finally {loading=false;}
}
function todayKey() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function dateFromKey(key) { return new Date(key+'T00:00:00Z'); }
function keyFromDate(date) { return date.toISOString().slice(0,10); }
const initialToday=todayKey();
let calendarMonth=dateFromKey(initialToday.slice(0,7)+'-01');
let selectedDay=initialToday;
let selectedEvent=null;
const formatDay=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const formatMonth=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',month:'long',year:'numeric'});
function calendarEvents() {
  return projects.flatMap(project=>(project.events||[]).map(event=>({...event,project})))
    .filter(event=>calendarFilter==='all'||event.project.kind===calendarFilter)
    .sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
}
function renderProgress() {
  renderOverview();
  const candidates=projects.filter(project=>project.roadmap);
  if(roadmapProjectId!=='all'&&!candidates.some(project=>project.id===roadmapProjectId))roadmapProjectId='all';
  const selected=roadmapProjectId==='all'?candidates:candidates.filter(project=>project.id===roadmapProjectId);
  $('progress-display-options').hidden=!candidates.length;
  const showRoadmap=progressDisplay==='roadmap'&&selected.length>0;
  $('overview').hidden=showRoadmap;$('roadmap-view').hidden=!showRoadmap;
  $('roadmap-projects').hidden=!showRoadmap;
  $('roadmap-projects').replaceChildren(...[{id:'all',name:'All roadmaps'},...candidates].map(project=>{const option=element('button',project.name);option.dataset.roadmapProject=project.id;option.setAttribute('aria-pressed',String(project.id===roadmapProjectId));option.onclick=()=>{roadmapProjectId=project.id;history.replaceState(null,'','#roadmap-'+project.id);renderProgress();};return option;}));
  if(showRoadmap)renderRoadmap($('roadmap-view'),selected);
  document.querySelector('.scope-tabs').hidden=showRoadmap;
  for(const button of document.querySelectorAll('[data-progress-display]'))button.setAttribute('aria-pressed',String(button.dataset.progressDisplay===(showRoadmap?'roadmap':'milestones')));
  const groupTitle=progressGroup==='personal'?'Personal':'Team';
  $('progress-scope-label').textContent=showRoadmap?candidates.length+' of '+projects.length+' projects mapped':groupTitle+' projects';
  $('cards-heading').textContent=showRoadmap?'Projects on the map':groupTitle+' projects & people';
  if(mainView==='progress')$('page-intro').textContent=showRoadmap?'All project roadmaps in one interactive view.':'Personal and team projects, each with their own view.';
  renderCards();
  for(const group of ['personal','team'])$('progress-'+group+'-count').textContent=projects.filter(project=>project.kind===group).length;
  for(const button of document.querySelectorAll('[data-progress-group]'))button.setAttribute('aria-pressed',String(button.dataset.progressGroup===progressGroup));
}
function setMainView(view) {
  mainView=view;
  const isProgress=view==='progress';
  if(view==='bots')history.replaceState(null,'','#bots');else if(view==='calendar')history.replaceState(null,'','#calendar');else if(progressDisplay==='roadmap')history.replaceState(null,'','#roadmap-'+roadmapProjectId);
  $('progress-view').hidden=!isProgress;$('calendar-view').hidden=view!=='calendar';$('bots-view').hidden=view!=='bots';
  $('page-title').textContent=isProgress?'Progress track':view==='bots'?'Team bots':'Calendar';
  $('page-intro').textContent=isProgress?'Personal and team projects, each with their own view.':'Meetings and milestones across all personal and team projects.';
  $('breadcrumb-view').textContent=$('page-title').textContent;
  for(const button of document.querySelectorAll('[data-main-view]')) {
    const active=button.dataset.mainView===view;
    if(button.closest('.main-tabs'))button.setAttribute('aria-pressed',String(active));
    else if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
  }
  if(view==='bots'){$('page-intro').textContent='One shared project memory. Every bot follows the same rules.';renderBotHub();}
  else if(projects.length){if(isProgress)renderProgress();else renderCalendar();}
}
function renderCalendar() {
  $('calendar-month').textContent=formatMonth.format(calendarMonth);
  const monthKey=keyFromDate(calendarMonth).slice(0,7);
  const events=calendarEvents();
  const monthEvents=events.filter(event=>event.date.startsWith(monthKey));
  $('calendar-count').textContent=monthEvents.length+' '+(monthEvents.length===1?'event':'events')+' this month';
  $('calendar-note').textContent=events.some(event=>event.isMock)
    ?'Includes example dates for this prototype. Dates are shown in Asia/Bangkok.'
    :'Project dates are shown in Asia/Bangkok. AI publications update this calendar.';
  for(const button of document.querySelectorAll('[data-calendar-filter]'))button.setAttribute('aria-pressed',String(button.dataset.calendarFilter===calendarFilter));
  const grid=$('month-grid');grid.replaceChildren();
  for(const day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])grid.append(element('div',day,'weekday'));
  const offset=(calendarMonth.getUTCDay()+6)%7;
  const daysInMonth=new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth()+1,0)).getUTCDate();
  const cellCount=Math.ceil((offset+daysInMonth)/7)*7;
  const today=todayKey();
  for(let index=0;index<cellCount;index++) {
    const date=new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth(),index-offset+1));
    const key=keyFromDate(date),isCurrentMonth=key.startsWith(monthKey);
    const cell=element('div',undefined,'calendar-day'+(isCurrentMonth?'':' outside')+(key===selectedDay?' selected':''));
    cell.dataset.date=key;
    const header=element('div',undefined,'day-header');
    const button=element('button',String(date.getUTCDate()),'day-number'+(key===today?' today':''));
    button.dataset.focus='day-'+key;
    button.setAttribute('aria-label',formatDay.format(date));button.setAttribute('aria-pressed',String(key===selectedDay));
    if(key===today)button.setAttribute('aria-current','date');
    button.onclick=()=>{
      selectedDay=key;renderCalendar();
      document.querySelector(`[data-focus="day-${key}"]`)?.focus({preventScroll:true});
    };
    header.append(button);cell.append(header);
    const dayEvents=events.filter(event=>event.date===key);
    for(const event of dayEvents.slice(0,2)) {
      const item=element('button',undefined,'calendar-event '+event.project.kind);
      item.dataset.focus='event-'+event.project.id+'-'+event.id;
      item.append(element('span',(event.status==='proposed'?'Proposed · ':'')+event.title),element('span',event.project.name,'event-project'));
      item.setAttribute('aria-label',event.title+' · '+event.project.name+' · '+event.date+(event.isMock?' · Example date':event.status==='proposed'?' · Proposed date':''));
      item.title=event.title+' · '+event.project.name;item.onclick=()=>openEvent(event);
      cell.append(item);
    }
    if(dayEvents.length>2){const more=element('button','+'+(dayEvents.length-2)+' more','calendar-more');more.onclick=()=>{selectedDay=key;renderCalendar();$('agenda').scrollIntoView({block:'nearest'});};cell.append(more);}
    grid.append(cell);
  }
  renderAgenda(events);
}
function renderAgenda(events) {
  const agenda=$('agenda'),matches=events.filter(event=>event.date===selectedDay);
  const heading=element('div',undefined,'agenda-heading');heading.append(element('h2',formatDay.format(dateFromKey(selectedDay))),element('span',matches.length+' scheduled'));
  agenda.replaceChildren(heading);
  if(!matches.length)agenda.append(element('p','No project events on this day.','agenda-empty'));
  for(const event of matches) {
    const row=element('div',undefined,'agenda-item'),copy=element('div',undefined,'agenda-copy');
    const title=element('button',event.title,'agenda-title');title.onclick=()=>openEvent(event);title.dataset.focus='agenda-'+event.project.id+'-'+event.id;
    copy.append(title,element('div',event.project.name+' · '+event.type,'agenda-meta'));
    row.append(element('span',event.type==='meeting'?'◷':'◇','agenda-kind '+event.project.kind),copy);
    if(event.isMock||event.status==='proposed')row.append(element('span',event.isMock?'Example date':'Proposed date','agenda-sample'));
    agenda.append(row);
  }
}
function showEvent(event) {
  $('event-type').textContent=event.type;
  $('event-title').textContent=event.title;
  $('event-date').textContent=formatDay.format(dateFromKey(event.date));
  $('event-project').textContent=event.project.name+' · '+(event.project.kind==='team'?'Team':'Personal');
  $('event-details').textContent=event.details;
  $('event-people').replaceChildren(peopleFor(event.project));
  $('event-sample').textContent=event.isMock?'Example date · Not a confirmed appointment':event.status==='proposed'?'Proposed date · Not a confirmed appointment':'Published project date';
  $('event-open-project').onclick=()=>{$('event-dialog').close();openProject(event.project);};
}
function openEvent(event) {
  selectedEvent={projectId:event.project.id,eventId:event.id};
  showEvent(event);$('event-dialog').showModal();
}
function refreshEventDialog() {
  if(!$('event-dialog').open||!selectedEvent)return;
  const project=projects.find(project=>project.id===selectedEvent.projectId);
  const event=project?.events?.find(event=>event.id===selectedEvent.eventId);
  if(event)showEvent({...event,project});else $('event-dialog').close();
}
function shiftMonth(amount) {
  calendarMonth=new Date(Date.UTC(calendarMonth.getUTCFullYear(),calendarMonth.getUTCMonth()+amount,1));
  selectedDay=keyFromDate(calendarMonth);renderCalendar();
}
$('month-previous').onclick=()=>shiftMonth(-1);
$('month-next').onclick=()=>shiftMonth(1);
$('month-today').onclick=()=>{selectedDay=todayKey();calendarMonth=dateFromKey(selectedDay.slice(0,7)+'-01');renderCalendar();};
$('close-event-dialog').onclick=()=>$('event-dialog').close();
for(const button of document.querySelectorAll('[data-main-view]'))button.onclick=()=>setMainView(button.dataset.mainView);
for(const button of document.querySelectorAll('[data-progress-group]'))button.onclick=()=>{progressGroup=button.dataset.progressGroup;renderProgress();};
for(const button of document.querySelectorAll('[data-progress-display]'))button.onclick=()=>{progressDisplay=button.dataset.progressDisplay;if(progressDisplay==='roadmap')history.replaceState(null,'','#roadmap-'+roadmapProjectId);else history.replaceState(null,'',location.pathname+location.search);renderProgress();};
$('roadmap-view').addEventListener('roadmap-project-filter',event=>{roadmapProjectId=event.detail.projectId;history.replaceState(null,'','#roadmap-'+roadmapProjectId);renderProgress();});
for(const button of document.querySelectorAll('[data-calendar-filter]'))button.onclick=()=>{calendarFilter=button.dataset.calendarFilter;renderCalendar();};
function readRoadmapLink(){if(location.hash.startsWith('#roadmap-')){roadmapProjectId=location.hash.slice(9);progressGroup=projects.find(project=>project.id===roadmapProjectId)?.kind||'team';progressDisplay='roadmap';return true;}return false;}
readRoadmapLink();
window.addEventListener('hashchange',()=>{if(readRoadmapLink())setMainView('progress');});
setMainView(location.hash==='#bots'?'bots':location.hash==='#calendar'?'calendar':'progress');
refresh();
setInterval(()=>{if(!document.hidden)refresh();},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});

async function renderBotHub(){
 const list=$('bot-updates');
 const count=rawProjects.filter(p=>p.goal==null||p.next==null||p.progressKnown===false||p.roadmap?.progressKnown===false||(p.questions||[]).some(q=>q.answer==null)).length;
 $('unknown-count').textContent=count+' projects have open questions or unconfirmed progress';
 try{
  const data={updates:teamUpdates};
  list.replaceChildren();
  if(!data.updates.length)list.append(element('p','No bot updates yet. The next project change will appear here automatically.','empty'));
  for(const item of data.updates.slice(0,40)){
   const card=element('article',undefined,'bot-update');const top=element('div',undefined,'bot-update-top');
   const name=element('button',item.projectName);name.onclick=()=>{const p=projects.find(p=>p.id===item.projectId);if(p)openProject(p);};
   top.append(name,element('span','Revision '+item.revision));card.append(top,element('p',item.summary),element('small',new Date(item.at).toLocaleString()+' · '+item.actor),element('small','Available to ChatGPT · Claude · Grok'));list.append(card);
  }
 }catch{list.replaceChildren(element('p','The update inbox is unavailable. Try again shortly.','empty'));}
}
