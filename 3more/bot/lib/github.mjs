const endpoint='https://api.github.com/repos/wgul2ockw-cmyk/jovey-site/contents/3more/data/dashboard.json';
export async function readGithub(token,send=fetch){
 const response=await send(endpoint+'?ref=main',{headers:{Accept:'application/vnd.github+json',...(token?{Authorization:'Bearer '+token}:{})},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('GitHub read failed (HTTP '+response.status+').');
 const record=await response.json();if(record.encoding!=='base64'||!record.sha)throw new Error('Unsupported dashboard file response.');
 return {sha:record.sha,snapshot:JSON.parse(Buffer.from(record.content,'base64').toString('utf8'))};
}
export async function writeGithub(token,sha,snapshot,message,send=fetch){
 if(!token)throw new Error('GitHub write access is required. Configure GITHUB_TOKEN in the bot runner, never in the website.');
 const response=await send(endpoint,{method:'PUT',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({branch:'main',sha,message,content:Buffer.from(JSON.stringify(snapshot,null,2)+'\n').toString('base64')})});
 if(response.status===409||response.status===422)throw new Error('GitHub changed or rejected this publication. Reread and reconcile; do not force overwrite.');
 if(!response.ok)throw new Error('GitHub publication failed (HTTP '+response.status+').');
 const result=await response.json();return {commit:result.commit.sha,url:result.commit.html_url,publication:'committed; awaiting GitHub Pages deployment'};
}
