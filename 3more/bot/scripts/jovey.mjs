import {createInterface} from 'node:readline';
import {readFileSync,writeFileSync} from 'node:fs';
import {applyTool,toolList,validateSnapshot} from '../lib/model.mjs';
import {readGithub,writeGithub} from '../lib/github.mjs';
const guide=()=>({version:'3.0.0',dashboard:'https://jovey.co/3more/',repository:'wgul2ockw-cmyk/jovey-site',dataPath:'3more/data/dashboard.json',instructions:readFileSync(new URL('../SKILL.md',import.meta.url),'utf8')});
async function call(name,args={}){
 if(name==='get_bot_guide')return guide();
 const fileIndex=process.argv.indexOf('--file'),file=fileIndex>=0?process.argv[fileIndex+1]:null;
 const token=process.env.GITHUB_TOKEN;const record=file?{snapshot:JSON.parse(readFileSync(file,'utf8'))}:await readGithub(token);
 const outcome=applyTool(record.snapshot,name,args,process.env.JOVEY_BOT_NAME||'Authorized GitHub bot');
 if(!outcome.changed)return outcome.result;
 if(file){writeFileSync(file,JSON.stringify(outcome.snapshot,null,2)+'\n');return {...outcome.result,publication:'local file only; not published'};}
 const publication=await writeGithub(token,record.sha,outcome.snapshot,'3more: '+name+' '+(args.projectId||args.botId));return {...outcome.result,...publication};
}
if(process.argv.includes('--validate')){
 const file=process.argv[process.argv.indexOf('--validate')+1];validateSnapshot(JSON.parse(readFileSync(file,'utf8')));console.log('Dashboard snapshot is valid.');
}else if(process.argv.includes('--stdio')){
 for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  if(!line.trim())continue;let rpc;
  try{
   rpc=JSON.parse(line);if(rpc.id===undefined)continue;let result;
   if(rpc.method==='initialize')result={protocolVersion:'2025-03-26',serverInfo:{name:'Jovey GitHub Dashboard',version:'3.0.0'},capabilities:{tools:{}}};
   else if(rpc.method==='server/discover')result={supportedVersions:['2026-07-28'],capabilities:{tools:{}}};
   else if(rpc.method==='tools/list')result={tools:toolList};
   else if(rpc.method==='tools/call')result={content:[{type:'text',text:JSON.stringify(await call(rpc.params.name,rpc.params.arguments||{}))}]};
   else throw new Error('Unsupported method');
   process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:rpc.id,result})+'\n');
  }catch(error){process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:rpc?.id??null,result:{isError:true,content:[{type:'text',text:error.message}]}})+'\n');}
 }
}else{
 const index=process.argv.indexOf('--call'),name=index>=0?process.argv[index+1]:null;
 if(!name)throw new Error('Use --stdio, --validate FILE, or --call TOOL with JSON arguments on stdin.');
 let input='';for await(const chunk of process.stdin)input+=chunk;
 try{console.log(JSON.stringify(await call(name,JSON.parse(input||'{}')),null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
