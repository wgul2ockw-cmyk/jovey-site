import {createHash} from 'node:crypto';
import {check,validate,toolList} from './schema.mjs';
export {toolList};
const bots=['chatgpt','claude','grok'];
function fail(message){throw new Error(message);}
export function validateSnapshot(snapshot){
 if(snapshot.schemaVersion!==1||!Number.isInteger(snapshot.revision)||snapshot.revision<1||!Array.isArray(snapshot.projects)||!Array.isArray(snapshot.updates)||!snapshot.botCursors)fail('Invalid dashboard snapshot');
 const ids=new Set();for(const p of snapshot.projects){if(!/^[a-z][a-z0-9-]{0,39}$/.test(p.id)||['constructor','prototype'].includes(p.id)||ids.has(p.id)||!Number.isInteger(p.revision)||p.revision<0)fail('Invalid or duplicate project identity');validate(p);ids.add(p.id);}
 if(Buffer.byteLength(JSON.stringify(snapshot))>900000)fail('Snapshot is too large; archive older history before publishing.');
 return snapshot;
}
export function readUpdates(snapshot,botId){
 const seen=botId?snapshot.botCursors[botId]||{}:{},cursor=Object.fromEntries(snapshot.projects.map(p=>[p.id,p.revision]));
 const updates=snapshot.updates.filter(u=>u.revision>(seen[u.projectId]||0)).sort((a,b)=>b.at.localeCompare(a.at)||b.revision-a.revision);
 const historyGaps=snapshot.projects.filter(p=>{const baseline=Math.max(seen[p.id]||0,snapshot.notificationStartRevisions?.[p.id]||0);const first=snapshot.updates.filter(u=>u.projectId===p.id).sort((a,b)=>a.revision-b.revision)[0];return p.revision>baseline&&(!first||first.revision>baseline+1);}).map(p=>p.id);
 return {botId:botId||null,updates,cursor,historyGaps,mode:'github-shared-inbox',externalDelivery:'not-connected',retention:'Latest 250 publications. Reread projects if history is missing.'};
}
export function applyTool(input,name,args={},actor='Authorized GitHub bot',now=new Date().toISOString()){
 const definition=toolList.find(t=>t.name===name);if(!definition)fail('Unknown tool');check(args,definition.inputSchema);validateSnapshot(input);
 if(name==='read_project_dashboard')return {snapshot:input,result:{projects:input.projects,revision:input.revision},changed:false};
 if(name==='read_team_updates')return {snapshot:input,result:readUpdates(input,args.botId),changed:false};
 const snapshot=structuredClone(input);
 if(name==='acknowledge_team_updates'){
  const published=Object.fromEntries(snapshot.projects.map(p=>[p.id,p.revision])),cursor={...(snapshot.botCursors[args.botId]||{})};
  for(const [id,revision]of Object.entries(args.cursor)){if(published[id]===undefined||revision>published[id])fail('Cursor exceeds published revision');cursor[id]=Math.max(cursor[id]||0,revision);}
  const changed=JSON.stringify(cursor)!==JSON.stringify(snapshot.botCursors[args.botId]||{});if(changed){snapshot.botCursors[args.botId]=cursor;snapshot.revision++;snapshot.updatedAt=now;}
  return {snapshot,result:{botId:args.botId,cursor},changed};
 }
 const fingerprint=createHash('sha256').update(JSON.stringify({name,args})).digest('hex');
 const previous=(snapshot.appliedUpdates||[]).find(u=>u.projectId===args.projectId&&u.updateId===args.updateId);
 if(previous){if(previous.fingerprint!==fingerprint)fail('Update ID already used for different content');return {snapshot:input,result:previous.result,changed:false};}
 let p=snapshot.projects.find(p=>p.id===args.projectId),fields;
 if(name==='create_project'){
  if(p)fail('Project ID already exists. Read and edit it instead.');
  p={id:args.projectId,name:args.name,kind:args.kind,description:args.description??null,icon:'◇',goal:null,previous:null,meeting:null,next:null,outcome:null,stages:[],completedStages:0,currentStage:0,progressKnown:false,dependencies:[],sources:[],dataMode:'planning',updateNote:'Project created. Vision, next step and schedule remain open until defined.',assignees:args.assignees||[],events:[],questions:[],roadmap:args.roadmap??null,revision:1,updatedAt:now};
  snapshot.projects.push(p);fields=['project'];
 }else{
  if(!p)fail('Unknown project');if(p.revision!==args.expectedRevision)fail('Revision changed. Reread before retrying.');
  const {projectId,expectedRevision,updateId,updateNote,...rest}=args;let patch;
  if(name==='publish_project_update')patch=args.patch;
  else if(name==='upsert_calendar_event'||name==='remove_calendar_event'){
   const events=(p.events||[]).filter(e=>e.id!==(args.event?.id||args.eventId));if(name==='upsert_calendar_event')events.push(args.event);patch={events,updateNote};
  }else patch={...rest,updateNote};
  if(!patch||!Object.keys(patch).length)fail('Empty update');
  Object.assign(p,patch,{revision:p.revision+1,updatedAt:now});fields=Object.keys(patch);
 }
 validate(p);
 const event={id:p.id+':'+p.revision,projectId:p.id,projectName:p.name,revision:p.revision,at:now,actor,type:name==='create_project'?'created':'updated',fields,summary:p.updateNote,recipients:bots,delivery:'github-shared-inbox'};
 snapshot.updates=[...snapshot.updates,event].slice(-250);snapshot.revision++;snapshot.updatedAt=now;
 const result={projectId:p.id,revision:p.revision,updatedAt:p.updatedAt,notification:{id:event.id,status:'available-after-github-publication',externalDelivery:'not-connected'}};
 snapshot.appliedUpdates=[...(snapshot.appliedUpdates||[]),{projectId:p.id,updateId:args.updateId,fingerprint,result}].slice(-250);
 validateSnapshot(snapshot);return {snapshot,result,changed:true};
}
