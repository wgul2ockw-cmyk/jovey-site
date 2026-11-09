/* Runs synchronously before styles, modules or any other resource. No analytics. */
(()=>{
 'use strict';
 let captured={path:location.pathname,query:'',fragment:''};
 try{
  captured.query=location.search;captured.fragment=location.hash;
  history.replaceState(null,'',location.pathname);
 }catch{captured={path:location.pathname,query:'',fragment:'',failed:true};}
 // One-use closure; never persist tokens or put them back in history.
 Object.defineProperty(window,'take3moreCallback',{configurable:true,value:()=>{
  const value=captured;captured=null;delete window.take3moreCallback;return value;
 }});
})();
