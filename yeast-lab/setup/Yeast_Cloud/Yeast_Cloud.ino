/* Cloud v2: local 1s monitor preserved; cloud every 10s. See README_TH.md. */
/*
  Yeast_Live_WiFi v1 — classic ESP32 Dev Module (WROOM-32, 38 pins)
  SETUP: edit WIFI_SSID / WIFI_PASSWORD below, upload, open Serial at 115200,
  then open the printed http://IP/ on a phone/computer on the same home LAN.
  Use a 2.4 GHz Wi-Fi network. No extra web libraries or internet CDN needed.
  Required libraries: OneWire and DallasTemperature (already used).

  Wiring (disconnect USB before moving wires):
    DS18B20: VDD=3V3, GND=GND, DQ=G4; 4.7K from DQ to 3V3.
    MQ-3:   AO -> 10K -> G34 junction -> 10K -> GND.
    MQ135:  AO -> 10K -> G35 junction -> 10K -> GND.
    Both MQ grounds and ESP32 ground must be common; DO is unused.
    MQ modules require 5V. The existing USB/V5 path has NOT been load-tested
    for two heaters + Wi-Fi. Reboots/disconnects require power investigation.
    Do not tie an external +5V source to USB-powered V5 or the 3V3 rail.

  Data: one sample about every second; 3600 most recent samples in RAM.
  Logging continues while the page is closed. Reboot/power loss clears all.
  Download before stopping; old samples are overwritten after ~1 hour.
  This is a bench monitor, NOT a durable fermentation logger yet.
  CSV includes boot ID and 64-bit uptime_ms (not a calendar timestamp).
  Event buttons record manual actions, never control hardware.
  MQ counts are uncalibrated raw ADC values, NOT ppm/CO2/ethanol/protein.
  No automatic harvest recommendation. Temperature is not reference-validated.
  HTTP is for a trusted private LAN only; do not forward its port online.
*/
#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <esp_timer.h>
#include <esp_system.h>
#include <math.h>

// EDIT ONLY THESE TWO LINES first. Keep the quotation marks.
#include "secrets.h"

constexpr uint8_t TEMP_PIN = 4, MQ3_PIN = 34, MQ135_PIN = 35;
constexpr uint16_t HISTORY_SIZE = 3600;
constexpr uint8_t EVENT_SIZE = 64;
struct Sample { uint64_t ms; float temp; uint16_t mq3; uint16_t mq135; };
struct Event { uint64_t ms; uint8_t kind; };
Sample history[HISTORY_SIZE];
Event events[EVENT_SIZE];
const char* eventNames[] = {"feed", "air_change", "sample", "harvest"};
uint32_t sequence = 0;
uint16_t count = 0;
uint8_t eventHead = 0, eventCount = 0;
char bootId[17];
OneWire oneWire(TEMP_PIN);
DallasTemperature temperature(&oneWire);
WebServer server(80);
uint32_t conversionStart = 0, lastAttempt = 0, lastRetry = 0;
bool converting = false, credentialsSet = false, wasConnected = false;

uint64_t uptimeMs() { return (uint64_t)esp_timer_get_time() / 1000ULL; }
String unsigned64(uint64_t n) {
  char b[24]; snprintf(b, sizeof(b), "%llu", (unsigned long long)n); return String(b);
}
uint16_t readRaw(uint8_t pin) {
  analogRead(pin); delayMicroseconds(200);
  uint32_t sum = 0;
  for (uint8_t i = 0; i < 16; ++i) {
    sum += analogRead(pin); delayMicroseconds(200);
  }
  return sum / 16;
}
#include "CloudSender.h"
void sampleSensors() {
  uint32_t now = millis();
  if (!converting && (uint32_t)(now - lastAttempt) >= 1000) {
    lastAttempt = now;
    temperature.requestTemperatures();
    conversionStart = millis();
    converting = true;
  }
  if (converting && (uint32_t)(millis() - conversionStart) >= 800) {
    float t = temperature.getTempCByIndex(0);
    if (!isfinite(t) || t == DEVICE_DISCONNECTED_C || t < -55 || t > 125) t = NAN;
    Sample s = {uptimeMs(), t, readRaw(MQ3_PIN), readRaw(MQ135_PIN)};
    history[sequence % HISTORY_SIZE] = s;
    ++sequence;
    queueCloudPoint(s.ms,s.temp,s.mq3,s.mq135,sequence);
    if (count < HISTORY_SIZE) ++count;
    converting = false;
    Serial.print(unsigned64(s.ms)); Serial.print(',');
    if (isfinite(t)) Serial.print(t, 2);
    Serial.print(','); Serial.print(s.mq3); Serial.print(','); Serial.println(s.mq135);
  }
}
void noCache() { server.sendHeader("Cache-Control", "no-store"); }
void handleData() {
  uint32_t after = (uint32_t)strtoul(server.arg("after").c_str(), nullptr, 10);
  if (after > sequence || (server.hasArg("boot") && server.arg("boot") != bootId)) after = 0; // Browser was connected before a reboot.
  uint32_t first = count ? sequence - count + 1 : 0;
  uint32_t from = after + 1;
  if (from < first) from = first;
  uint32_t to = sequence;
  if (to >= from && to - from >= 300) to = from + 299;
  String out; out.reserve(21000);
  out = "{\"boot\":\""; out += bootId;
  out += "\",\"uptime\":"; out += unsigned64(uptimeMs());
  out += ",\"rssi\":"; out += String(WiFi.RSSI());
  out += ",\"first\":"; out += String(first);
  out += ",\"last\":"; out += String(sequence);
  out += ",\"count\":"; out += String(count);
  out += ",\"rows\":[";
  bool comma = false;
  if (count) for (uint32_t seq = from; seq <= to; ++seq) {
    const Sample& s = history[(seq - 1) % HISTORY_SIZE];
    if (comma) out += ','; comma = true;
    out += '['; out += String(seq); out += ','; out += unsigned64(s.ms); out += ',';
    out += isfinite(s.temp) ? String(s.temp, 2) : String("null");
    out += ','; out += String(s.mq3); out += ','; out += String(s.mq135); out += ']';
  }
  out += "],\"events\":[";
  for (uint8_t i = 0; i < eventCount; ++i) {
    const Event& e = events[(eventHead + EVENT_SIZE - eventCount + i) % EVENT_SIZE];
    if (i) out += ',';
    out += '['; out += unsigned64(e.ms); out += ",\"";
    out += eventNames[e.kind]; out += "\"]";
  }
  out += "]}";
  noCache(); server.send(200, "application/json", out);
}
void handleEvent() {
  String kind = server.arg("kind");
  for (uint8_t i = 0; i < 4; ++i) if (kind == eventNames[i]) {
    uint64_t at = uptimeMs();
    events[eventHead] = {at, i};
    eventHead = (eventHead + 1) % EVENT_SIZE;
    if (eventCount < EVENT_SIZE) ++eventCount;
    noCache(); server.send(200, "application/json", "{\"uptime\":" + unsigned64(at) + "}");
    return;
  }
  server.send(400, "application/json", "{\"error\":\"unknown event\"}");
}
void handleCsv() {
  noCache();
  server.sendHeader("Content-Disposition", "attachment; filename=yeast_" + String(bootId) + ".csv");
  server.setContentLength(CONTENT_LENGTH_UNKNOWN);
  server.send(200, "text/csv; charset=utf-8", "");
  server.sendContent("boot_id,seq,uptime_ms,tempC,mq3_raw,mq135_raw\r\n");
  String chunk; chunk.reserve(2300);
  uint32_t first = count ? sequence - count + 1 : 1;
  // Synchronous snapshot: long/slow downloads can delay the next sample.
  // Actual timestamps, rather than assumed 1-second intervals, expose gaps.
  for (uint32_t seq = first; seq <= sequence; ++seq) {
    if (!server.client().connected()) break;
    const Sample& s = history[(seq - 1) % HISTORY_SIZE];
    chunk += bootId; chunk += ','; chunk += String(seq); chunk += ',';
    chunk += unsigned64(s.ms); chunk += ',';
    if (isfinite(s.temp)) chunk += String(s.temp, 2);
    chunk += ','; chunk += String(s.mq3); chunk += ','; chunk += String(s.mq135); chunk += "\r\n";
    if (chunk.length() > 1800) { server.sendContent(chunk); chunk = ""; yield(); }
  }
  if (chunk.length()) server.sendContent(chunk);
  server.sendContent("");
}
void handleEventsCsv() {
  String out = "boot_id,uptime_ms,event\r\n";
  for (uint8_t i = 0; i < eventCount; ++i) {
    const Event& e = events[(eventHead + EVENT_SIZE - eventCount + i) % EVENT_SIZE];
    out += bootId; out += ','; out += unsigned64(e.ms); out += ',';
    out += eventNames[e.kind]; out += "\r\n";
  }
  noCache(); server.sendHeader("Content-Disposition", "attachment; filename=events_" + String(bootId) + ".csv");
  server.send(200, "text/csv; charset=utf-8", out);
}

const char PAGE[] PROGMEM = R"YEASTHTML(
<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yeast Live</title>
<style>
:root{font-family:system-ui,sans-serif;color:#203830;background:#f4f6f1}*{box-sizing:border-box}body{margin:0}main{max-width:1120px;margin:auto;padding:24px}header{display:flex;justify-content:space-between;align-items:center;gap:16px}h1{margin:6px 0;font-size:30px}p{line-height:1.65}small,.muted{color:#60746a}.badge{background:#e0eadf;border-radius:24px;padding:8px 14px;font-size:13px}.notice{border-left:4px solid #b7802d;background:#fff7e7;padding:12px 16px;margin:20px 0;font-size:14px}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.card,section{background:white;border:1px solid #dde5dc;border-radius:16px;padding:20px}.value{font-size:36px;font-weight:650;margin:8px 0}.card h2{font-size:16px;margin:0}canvas{width:100%;height:180px;display:block}.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:20px 0}button,a.button,select{font:inherit;border:1px solid #c5d4c7;border-radius:9px;background:white;padding:10px 14px;color:#244c3b;cursor:pointer;text-decoration:none}a.button{background:#244c3b;color:white}button:disabled{opacity:.5;cursor:wait}section{margin-top:16px}#events{padding-left:20px;line-height:1.8}#status{font-weight:600}#eventStatus{min-height:24px;font-size:14px}footer{font-size:13px;color:#60746a;margin:24px 0;line-height:1.7}@media(max-width:760px){main{padding:16px}.cards{grid-template-columns:1fr}header{align-items:flex-start}.value{font-size:32px}}
</style>
<main><header><div><small>BENCH MONITOR / v1</small><h1>Yeast Live</h1><div id="status" role="status">กำลังเชื่อมต่อ ESP32…</div></div><span class="badge">ข้อมูลจากเซนเซอร์จริง</span></header>
<div class="notice">MQ-3 และ MQ135 แสดง <b>ADC raw</b> เท่านั้น • ยังไม่สอบเทียบ • ยังใช้ฟันธงเวลาที่ควร harvest ไม่ได้</div>
<div class="toolbar"><label>ช่วงกราฟ <select id="window"><option value="300">5 นาที</option><option value="900">15 นาที</option><option value="3600" selected>60 นาที</option></select></label><a class="button" href="/data.csv">ดาวน์โหลดค่าที่เก็บไว้ CSV</a><a class="button" href="/events.csv">ดาวน์โหลดเหตุการณ์ CSV</a></div>
<div class="cards"><article class="card"><h2>อุณหภูมิ · DS18B20</h2><div class="value"><span id="temp">—</span> <small>°C</small></div><canvas id="ct" aria-label="กราฟอุณหภูมิ"></canvas><small>G4 · ช่องว่าง = อ่านไม่ได้</small></article><article class="card"><h2>MQ-3 · ADC raw</h2><div class="value" id="mq3">—</div><canvas id="c3" aria-label="กราฟ MQ-3"></canvas><small>G34 · ตัวแบ่งแรงดัน 10K + 10K</small></article><article class="card"><h2>MQ135 · ADC raw</h2><div class="value" id="mq135">—</div><canvas id="c135" aria-label="กราฟ MQ135"></canvas><small>G35 · ตัวแบ่งแรงดัน 10K + 10K</small></article></div>
<p class="muted" id="meta">รอข้อมูล…</p><p id="health"></p>
<section><b>จดเหตุการณ์ที่คุณทำจริง</b><p class="muted">ปุ่มเหล่านี้บันทึกเวลาเท่านั้น ไม่สั่งอุปกรณ์และไม่ใช่คำแนะนำให้ harvest</p><div class="toolbar"><button data-event="feed">เติมอาหาร</button><button data-event="air_change">ปรับลม / กวน</button><button data-event="sample">เก็บตัวอย่าง</button><button data-event="harvest">เก็บเกี่ยวแล้ว</button></div><div id="eventStatus" role="status"></div><ol id="events"></ol></section>
<footer><b>ประวัติชั่วคราว:</b> ESP32 เก็บ 3,600 จุดล่าสุด (~1 ชั่วโมง) และ 64 เหตุการณ์ล่าสุด แม้ปิดหน้าเว็บ ข้อมูลเก่าจะถูกแทนที่ และทั้งหมดหายเมื่อรีสตาร์ต/ถอดไฟ กรุณาดาวน์โหลดก่อน • เวลาเป็นเวลาตั้งแต่เปิดบอร์ด ไม่ใช่นาฬิกาจริง • ใช้ในเครือข่ายส่วนตัวที่ไว้ใจเท่านั้น</footer></main>
<script>
const $=id=>document.getElementById(id);
let rows=[],boot='',after=0,lastOK=0,lastSampleAt=0,lastSeenSeq=0,missed=0,restarted=false;
const labels={feed:'เติมอาหาร',air_change:'ปรับลม / กวน',sample:'เก็บตัวอย่าง',harvest:'เก็บเกี่ยวแล้ว'};
function clock(ms){const s=Math.floor(ms/1000);return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
async function getJSON(url,options={}){const controller=new AbortController(),t=setTimeout(()=>controller.abort(),8000);try{const r=await fetch(url,{...options,signal:controller.signal,cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}finally{clearTimeout(t);}}
function plot(id,col,color){const c=$(id),w=c.clientWidth,h=180,dpr=devicePixelRatio||1;c.width=w*dpr;c.height=h*dpr;const g=c.getContext('2d');g.scale(dpr,dpr);const end=rows.length?rows[rows.length-1][1]:0,start=Math.max(0,end-Number($('window').value)*1000),view=rows.filter(r=>r[1]>=start),vals=view.map(r=>r[col]).filter(Number.isFinite);g.font='11px system-ui';g.fillStyle='#60746a';if(!vals.length){g.fillText('ยังไม่มีค่าที่อ่านได้',12,85);return;}let lo=Math.min(...vals),hi=Math.max(...vals);const pad=Math.max((hi-lo)*.12,col===2?.25:5);lo-=pad;hi+=pad;if(col!==2){lo=Math.max(0,lo);hi=Math.min(4095,hi);}const L=45,R=w-10,T=15,B=150,span=Math.max(1000,end-start);g.strokeStyle='#e8ede7';for(let i=0;i<3;i++){const y=T+(B-T)*i/2;g.beginPath();g.moveTo(L,y);g.lineTo(R,y);g.stroke();g.fillText((hi-(hi-lo)*i/2).toFixed(col===2?1:0),0,y+4);}g.fillText(clock(start),L,174);g.fillText(clock(end),Math.max(L,R-55),174);g.strokeStyle=color;g.lineWidth=2;g.beginPath();let connected=false,prev=0;for(const r of view){if(!Number.isFinite(r[col])){connected=false;continue;}const x=L+(r[1]-start)/span*(R-L),y=B-(r[col]-lo)/(hi-lo)*(B-T);if(!connected||r[1]-prev>3000)g.moveTo(x,y);else g.lineTo(x,y);connected=true;prev=r[1];}g.stroke();}
function draw(){plot('ct',2,'#27765a');plot('c3',3,'#b27326');plot('c135',4,'#526dac');}
async function poll(){let more=false;try{const d=await getJSON('/api/data?after='+after+'&boot='+boot);if(boot&&boot!==d.boot){rows=[];after=0;lastSeenSeq=0;restarted=true;missed=0;}boot=d.boot;if(after&&d.first>after+1)missed+=d.first-after-1;for(const r of d.rows){if(r[0]>after){rows.push(r);after=r[0];}}if(rows.length>3600)rows=rows.slice(-3600);lastOK=Date.now();if(d.last!==lastSeenSeq){lastSampleAt=lastOK;lastSeenSeq=d.last;}if(rows.length){const r=rows[rows.length-1];$('temp').textContent=r[2]===null?'อ่านไม่ได้':r[2].toFixed(2);$('mq3').textContent=r[3];$('mq135').textContent=r[4];$('health').textContent=r[2]===85?'อุณหภูมิ 85°C: หากไม่ได้ร้อนจริง ให้ตรวจไฟและการแปลงค่าของ DS18B20':([r[3],r[4]].some(v=>v===0||v===4095)?'ADC อยู่ที่ขอบช่วง: ตรวจสาย ไฟเลี้ยง และตัวแบ่งแรงดัน':'');}more=after<d.last;$('meta').textContent=`เวลาบอร์ด ${clock(d.uptime)} · Wi-Fi ${d.rssi} dBm · เก็บบนบอร์ด ${d.count}/3600 จุด · Run ${d.boot}`+(restarted?' · พบการรีสตาร์ต ประวัติรอบก่อนหาย':'')+(missed?` · ขาดข้อมูลเก่า ${missed} จุด`:'');$('events').replaceChildren(...d.events.slice().reverse().map(e=>{const li=document.createElement('li');li.textContent=clock(e[0])+' — '+(labels[e[1]]||e[1]);return li;}));draw();}catch(e){$('status').textContent='ติดต่อบอร์ดไม่ได้ — ตรวจ Wi-Fi / ไฟเลี้ยง';}finally{setTimeout(poll,more?30:1000);}}
setInterval(()=>{if(!lastOK)return;const age=Math.floor((Date.now()-lastOK)/1000),sampleAge=Math.floor((Date.now()-lastSampleAt)/1000);$('status').textContent=age>5?`ขาดการเชื่อมต่อ ${age} วินาที — ค่าบนจอเป็นค่าเก่า`:(sampleAge>5?`เชื่อมต่อแล้ว แต่ไม่มีตัวอย่างใหม่ ${sampleAge} วินาที`:'LIVE · รับข้อมูลล่าสุดแล้ว');},1000);
$('window').onchange=draw;window.addEventListener('resize',draw);
document.querySelectorAll('[data-event]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const d=await getJSON('/api/event',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'kind='+encodeURIComponent(b.dataset.event)});$('eventStatus').textContent='บันทึกแล้ว: '+labels[b.dataset.event]+' เวลา '+clock(d.uptime);}catch(e){$('eventStatus').textContent='ยังยืนยันการบันทึกไม่ได้ ตรวจรายการก่อนกดซ้ำ';}finally{b.disabled=false;}});poll();
</script></html>

)YEASTHTML";
void setup() {
  Serial.begin(115200); delay(500);
  snprintf(bootId, sizeof(bootId), "%08lx%08lx", (unsigned long)esp_random(), (unsigned long)esp_random());
  temperature.begin(); temperature.setResolution(12);
  temperature.setWaitForConversion(false); // Serve HTTP while the sensor converts.
  analogReadResolution(12);
  analogSetPinAttenuation(MQ3_PIN, ADC_11db);
  analogSetPinAttenuation(MQ135_PIN, ADC_11db);
  Serial.print("# RUN,"); Serial.println(bootId);
  Serial.println("ms,tempC,mq3_raw,mq135_raw");
  credentialsSet = strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_NAME") != 0;
  if (credentialsSet) {
    WiFi.setHostname("yeast-live"); WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true); WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.println("# WIFI_CONNECTING: use 2.4 GHz Wi-Fi; allow 30 seconds.");
  } else Serial.println("# EDIT WIFI_SSID and WIFI_PASSWORD, then upload again.");
  server.on("/", HTTP_GET, []() { noCache(); server.send_P(200, "text/html; charset=utf-8", PAGE); });
  server.on("/api/data", HTTP_GET, handleData);
  server.on("/api/event", HTTP_POST, handleEvent);
  server.on("/data.csv", HTTP_GET, handleCsv);
  server.on("/events.csv", HTTP_GET, handleEventsCsv);
  server.onNotFound([](){server.send(404, "text/plain", "Not found");});
  server.begin();
  startCloud();
}
void loop() {
  sampleSensors();
  server.handleClient();
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.print("# OPEN http://"); Serial.print(WiFi.localIP()); Serial.println("/");
  }
  if (!connected && wasConnected) Serial.println("# WIFI_LOST: sampling continues in RAM.");
  wasConnected = connected;
  if (credentialsSet && !connected && (uint32_t)(millis() - lastRetry) >= 30000) {
    lastRetry = millis();
    Serial.println("# WIFI_RETRY: check SSID/password, 2.4GHz, and power if rebooting.");
    WiFi.reconnect();
  }
  delay(1);
}
