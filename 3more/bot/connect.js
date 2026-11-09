document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-copy-target]');if(!button)return;
 const field=document.getElementById(button.dataset.copyTarget);if(!field)return;
 const status=button.parentElement.querySelector('.copy-status')||document.querySelector('.copy-status');
 try{await navigator.clipboard.writeText(field.value||field.textContent);if(status)status.textContent='Copied. Paste into your bot.';const original=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=original,1800);}
 catch{field.focus();field.select?.();if(status)status.textContent='Select and copy the text above.';}
});
