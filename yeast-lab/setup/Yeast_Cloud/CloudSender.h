#pragma once
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
struct CloudPoint { uint64_t ms; int64_t epoch; uint32_t seq, dropped; float temp; uint16_t mq3,mq135; };
QueueHandle_t cloudQueue=nullptr;
uint32_t cloudDropped=0;
void queueCloudPoint(uint64_t ms,float temp,uint16_t a,uint16_t b,uint32_t seq) {
 static uint64_t last=0;
 if(!CLOUD_ENABLED || !cloudQueue || ms-last<10000) return;
 last=ms;
 CloudPoint p={ms,(int64_t)time(nullptr),seq,cloudDropped,temp,a,b};
 if(xQueueSend(cloudQueue,&p,0)!=pdTRUE){++cloudDropped;Serial.println("# CLOUD_QUEUE_FULL: dropped newest point");}
}
void cloudWorker(void*) {
 CloudPoint pending[20]; uint8_t n=0; uint32_t backoff=2000;
 for(;;){
  if(WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000){vTaskDelay(pdMS_TO_TICKS(2000));continue;}
  while(n<20 && xQueueReceive(cloudQueue,&pending[n],0)==pdTRUE)++n;
  if(!n){vTaskDelay(pdMS_TO_TICKS(500));continue;}
  String payload="{\"p_device\":\""+String(DEVICE_ID)+"\",\"p_token\":\""+String(DEVICE_TOKEN)+"\",\"p_rows\":[";
  for(uint8_t i=0;i<n;++i){
   const auto& p=pending[i]; if(i)payload+=',';
   payload+="{\"boot\":\""+String(bootId)+"\",\"seq\":"+String(p.seq)+",\"ms\":"+unsigned64(p.ms);
   payload+=",\"epoch\":"+String((long long)p.epoch)+",\"temp\":"+(isfinite(p.temp)?String(p.temp,2):String("null"));
   payload+=",\"mq3\":"+String(p.mq3)+",\"mq135\":"+String(p.mq135)+",\"dropped\":"+String(p.dropped)+"}";
  } payload+="]}";
  WiFiClientSecure tls; tls.setCACert(ROOT_CA); tls.setHandshakeTimeout(8);
  HTTPClient http; http.setConnectTimeout(8000);http.setTimeout(8000);
  int status=-1; String reply;
  if(http.begin(tls,String(SUPABASE_URL)+"/rest/v1/rpc/yeast_ingest")){
   http.addHeader("Content-Type","application/json");http.addHeader("apikey",SUPABASE_PUBLISHABLE_KEY);
   status=http.POST(payload); if(status==200)reply=http.getString();http.end();
  }
  // Exact HTTP 200 + expected application response: a portal HTML page is never acknowledged.
  if(status==200 && (reply.indexOf("\"ok\": true")>=0 || reply.indexOf("\"ok\":true")>=0)){
   Serial.printf("# CLOUD_ACK points=%u queued=%u\n",n,(unsigned)uxQueueMessagesWaiting(cloudQueue));n=0;backoff=2000;
  }else{
   Serial.printf("# CLOUD_RETRY http=%d (check internet, TLS, key and schema)\n",status);
   vTaskDelay(pdMS_TO_TICKS(backoff));backoff=backoff<30000?backoff*2:60000;
  }
 }
}
void startCloud(){
 if(!CLOUD_ENABLED){Serial.println("# CLOUD_DISABLED: configure secrets.h first");return;}
 configTime(0,0,"pool.ntp.org","time.google.com");
 cloudQueue=xQueueCreate(180,sizeof(CloudPoint));
 if(!cloudQueue || xTaskCreatePinnedToCore(cloudWorker,"cloud",12288,nullptr,1,nullptr,0)!=pdPASS)
  Serial.println("# CLOUD_START_FAILED");
}
