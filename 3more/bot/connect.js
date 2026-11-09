const copyButtonStates=new WeakMap();
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-copy-target]');if(!button)return;
 const field=document.getElementById(button.dataset.copyTarget);if(!field)return;
 const status=button.parentElement.querySelector('.copy-status')||document.querySelector('.copy-status');
 const previous=copyButtonStates.get(button);if(previous?.timer)clearTimeout(previous.timer);
 const state={label:previous?.label||button.textContent,timer:null};copyButtonStates.set(button,state);
 try{
  await navigator.clipboard.writeText(field.value||field.textContent);
  if(copyButtonStates.get(button)!==state)return;
  if(status)status.textContent='Copied. Paste into your bot.';
  button.textContent='Copied';state.timer=setTimeout(()=>{button.textContent=state.label;copyButtonStates.delete(button);},1800);
 }catch{
  if(copyButtonStates.get(button)!==state)return;
  button.textContent=state.label;copyButtonStates.delete(button);
  const details=field.closest('details');if(details)details.open=true;
  field.focus();field.select?.();if(status)status.textContent='Select and copy the text above.';
 }
});
