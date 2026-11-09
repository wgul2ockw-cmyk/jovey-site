import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,copyFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
test('MCP transport lists tools, creates a local project and exposes its inbox without any server',()=>{
 const temp=mkdtempSync(join(tmpdir(),'jovey-test-')),file=join(temp,'dashboard.json');copyFileSync(new URL('../../data/dashboard.json',import.meta.url),file);
 try{
  const requests=[{method:'initialize'},{method:'tools/list'},{method:'tools/call',params:{name:'get_bot_guide',arguments:{}}},{method:'tools/call',params:{name:'create_project',arguments:{projectId:'stdio-test',updateId:'create',name:'STDIO test',kind:'team'}}},{method:'tools/call',params:{name:'read_team_updates',arguments:{botId:'grok'}}}];
  const input=requests.map((r,i)=>JSON.stringify({jsonrpc:'2.0',id:i+1,...r})).join('\n')+'\n';
  const processResult=spawnSync(process.execPath,[new URL('../scripts/jovey.mjs',import.meta.url).pathname,'--stdio','--file',file],{input,encoding:'utf8'});
  assert.equal(processResult.status,0,processResult.stderr);const replies=processResult.stdout.trim().split('\n').map(JSON.parse);assert.equal(replies.length,5);assert.equal(replies.every(r=>!r.result.isError),true);
  assert.equal(replies[1].result.tools.length,11);assert.equal(JSON.parse(replies[4].result.content[0].text).updates[0].projectId,'stdio-test');
  assert.equal(JSON.parse(readFileSync(file)).projects.at(-1).goal,null);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
