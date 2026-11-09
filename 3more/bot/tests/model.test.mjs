import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyTool,readUpdates,validateSnapshot,toolList} from '../lib/model.mjs';
import {readGithub,writeGithub} from '../lib/github.mjs';
const seed=JSON.parse(readFileSync(new URL('../../data/dashboard.json',import.meta.url)));
const create={projectId:'test-project',updateId:'create-1',name:'Test project',kind:'team'};
const call=(state,name,args)=>applyTool(state,name,args,'Test bot','2026-11-09T02:00:00Z');
test('static snapshot validates and has no old host dependency or credentials',()=>{
 validateSnapshot(seed);assert.equal(seed.projects.length,9);assert.equal(seed.projects.every(p=>p.dataMode==='mock'),true);
 assert.doesNotMatch(JSON.stringify(seed),/chatgpt\.site|AGENT_WRITE_KEY|OAI-Sites-Authorization|github_pat_/);
 assert.equal(readUpdates(seed,'chatgpt').historyGaps.length,0);
 assert.equal(toolList.length,11);
});
test('create preserves unknowns, records one notice, and never mutates the input',()=>{
 const original=JSON.stringify(seed),r=call(seed,'create_project',create),p=r.snapshot.projects.at(-1);
 assert.equal(JSON.stringify(seed),original);assert.equal(p.goal,null);assert.equal(p.next,null);assert.equal(p.progressKnown,false);assert.deepEqual(p.events,[]);assert.deepEqual(p.stages,[]);
 assert.equal(r.snapshot.updates.length,1);assert.equal(r.snapshot.revision,seed.revision+1);
 const retry=call(r.snapshot,'create_project',create);assert.equal(retry.changed,false);assert.deepEqual(retry.result,r.result);
 assert.throws(()=>call(r.snapshot,'create_project',{...create,name:'Different'}),/already used/);
});
test('edit and retry are revision guarded; protected fields and unsafe source URLs fail',()=>{
 const created=call(seed,'create_project',create).snapshot;
 const edit={projectId:create.projectId,expectedRevision:1,updateId:'edit-1',patch:{name:'Renamed',goal:null,next:null,questions:[{id:'why',question:'Why?',answer:null}],updateNote:'Open question'}};
 const r=call(created,'publish_project_update',edit);assert.equal(r.snapshot.projects.at(-1).name,'Renamed');assert.equal(r.snapshot.updates.length,2);
 assert.equal(call(r.snapshot,'publish_project_update',edit).changed,false);
 assert.throws(()=>call(r.snapshot,'publish_project_update',{...edit,updateId:'stale'}),/Revision changed/);
 for(const patch of [{revision:999},{sources:[{label:'Bad',url:'javascript:alert(1)'}]},{completedStages:2}])assert.throws(()=>call(created,'publish_project_update',{...edit,patch}));
});
test('parallel facilities accept unknown stages and reject dependency cycles',()=>{
 const stream={id:'a',name:'Workspace',kind:'facility',stages:[],completedStages:0,next:null,goal:null,dependsOn:[]};
 const roadmap={goal:null,isMock:false,progressKnown:false,theme:'general',streams:[stream,{...stream,id:'b',dependsOn:['a']}]};
 const r=call(seed,'create_project',{...create,roadmap});assert.equal(r.snapshot.projects.at(-1).roadmap.streams.length,2);
 const bad=structuredClone(roadmap);bad.streams[0].dependsOn=['b'];assert.throws(()=>call(seed,'create_project',{...create,roadmap:bad}),/cycle/);
});
test('vision, assignment and calendar operations retain unrelated data',()=>{
 let state=call(seed,'create_project',create).snapshot;
 const rev=(revision,updateId)=>({projectId:create.projectId,expectedRevision:revision,updateId});
 state=call(state,'set_project_vision',{...rev(1,'vision'),goal:'A proposed goal',outcome:null,updateNote:'Proposed vision'}).snapshot;
 state=call(state,'assign_project_people',{...rev(2,'people'),assignees:[{name:'AUM',role:'Unspecified',isPlaceholder:false}],updateNote:'Team member assigned'}).snapshot;
 const event={id:'review',title:'Proposed review',date:'2027-01-02',type:'meeting',details:'Date to confirm',isMock:false,status:'proposed'};
 state=call(state,'upsert_calendar_event',{...rev(3,'event'),event,updateNote:'Proposed review'}).snapshot;
 state=call(state,'upsert_calendar_event',{...rev(4,'event-2'),event:{...event,id:'review-2'},updateNote:'Second proposal'}).snapshot;
 state=call(state,'remove_calendar_event',{...rev(5,'remove'),eventId:'review',updateNote:'First proposal removed'}).snapshot;
 const p=state.projects.at(-1);assert.equal(p.assignees[0].name,'AUM');assert.equal(p.goal,'A proposed goal');assert.equal(p.events.length,1);assert.equal(p.events[0].id,'review-2');
 assert.throws(()=>call(state,'upsert_calendar_event',{...rev(6,'bad-date'),event:{...event,date:'2026-02-30'},updateNote:'Bad'}),/date/);
});
test('bot acknowledgement is independent and never hides a concurrent later update',()=>{
 let state=call(seed,'create_project',create).snapshot;const inbox=readUpdates(state,'chatgpt');
 state=call(state,'publish_project_update',{projectId:create.projectId,expectedRevision:1,updateId:'later',patch:{updateNote:'Later update'}}).snapshot;
 state=call(state,'acknowledge_team_updates',{botId:'chatgpt',cursor:inbox.cursor}).snapshot;
 assert.equal(readUpdates(state,'chatgpt').updates.length,1);assert.equal(readUpdates(state,'claude').updates.length,2);
 const again=call(state,'acknowledge_team_updates',{botId:'chatgpt',cursor:inbox.cursor});assert.equal(again.changed,false);
 assert.throws(()=>call(state,'acknowledge_team_updates',{botId:'chatgpt',cursor:{'test-project':99}}),/exceeds/);
});
test('GitHub publication uses exact blob SHA and reports conflicts without force retry',async()=>{
 let requests=0;
 const fake=async(url,options)=>{requests++;assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer test');const body=JSON.parse(options.body);assert.equal(body.sha,'old-sha');assert.equal(body.branch,'main');assert.deepEqual(JSON.parse(Buffer.from(body.content,'base64')),seed);return Response.json({commit:{sha:'new-sha',html_url:'https://github.com/example/commit/new-sha'}});};
 const result=await writeGithub('test','old-sha',seed,'Test',fake);assert.equal(result.commit,'new-sha');assert.equal(requests,1);
 await assert.rejects(writeGithub('test','old-sha',seed,'Test',async()=>new Response('',{status:409})),/reconcile/);
 await assert.rejects(writeGithub(null,'old-sha',seed,'Test',fake),/write access/);assert.equal(requests,1);
 const read=await readGithub(null,async(url,options)=>{assert.equal(options.headers.Authorization,undefined);return Response.json({encoding:'base64',sha:'old-sha',content:Buffer.from(JSON.stringify(seed)).toString('base64')});});assert.equal(read.sha,'old-sha');assert.deepEqual(read.snapshot,seed);
});
