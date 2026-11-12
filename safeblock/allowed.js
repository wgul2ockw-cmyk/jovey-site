import { createNetworkControls } from "./network-core.mjs";
const controls = createNetworkControls(chrome.declarativeNetRequest);
const list = document.querySelector("#allowed");
const form = document.querySelector("#allow-form");
const input = document.querySelector("#domain");
const error = document.querySelector("#error");
let busy = false;
function render(state) {
  list.replaceChildren();
  document.querySelector("#empty-list").hidden = state.exceptions.length > 0;
  document.querySelector("#allowed-count").textContent = state.exceptions.length + (state.exceptions.length === 1 ? " website" : " websites");
  for (const item of state.exceptions) {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.className = "domain-name"; name.textContent = item.domain;
    const remove = document.createElement("button");
    remove.className = "secondary small"; remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove exception for " + item.domain);
    remove.addEventListener("click", () => run(() => controls.remove(item.id), "Blocking restored for " + item.domain + ". Reload the website."));
    row.append(name, remove); list.append(row);
  }
}
async function run(operation, success) {
  if (busy) return;
  busy = true; error.textContent = "";
  document.querySelectorAll("#allow-form button, #allowed button").forEach(node => { node.disabled = true; });
  try { render(await operation()); document.querySelector("#allow-message").textContent = success; }
  catch (failure) { error.textContent = failure.message; }
  finally { busy = false; document.querySelectorAll("#allow-form button, #allowed button").forEach(node => { node.disabled = false; }); }
}
form.addEventListener("submit", event => {
  event.preventDefault();
  run(async () => { const result = await controls.allow(input.value); input.value = ""; return result; }, "Website allowed. Reload it to apply the exception.");
});
controls.read().then(render, failure => { error.textContent = failure.message; });
