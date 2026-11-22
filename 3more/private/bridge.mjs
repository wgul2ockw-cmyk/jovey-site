let port;export const context=new Promise((resolve,reject)=>{
 if(parent===window){document.body.textContent='Sign in at jovey.co/3more/auth/ to open your dashboard.';return reject(Error('Sign-in required'));}
 const timer=setTimeout(()=>{document.body.textContent='Private dashboard unavailable. Return to sign in.';reject(Error('No authorized snapshot'));},15000);
 function receive(event){if(event.origin!=='https://jovey.co'||event.source!==parent||event.data?.type!=='3more-private-snapshot'||!event.ports[0])return;const {snapshot,workspaces}=event.data;
 if(snapshot?.visibility!=='private'||!['personal','team'].includes(snapshot.kind)||!Array.isArray(snapshot.projects)||!Array.isArray(workspaces)||!workspaces.some(w=>w.kind===snapshot.kind)||snapshot.projects.some(p=>p.kind!==snapshot.kind||p.dataMode==='mock'))return;
 clearTimeout(timer);window.removeEventListener('message',receive);port=event.ports[0];resolve(event.data);
 }window.addEventListener('message',receive);
});
export function action(action,kind){port?.postMessage({action,kind});}

if(parent!==window)parent.postMessage({type:'3more-private-ready'},'https://jovey.co');
