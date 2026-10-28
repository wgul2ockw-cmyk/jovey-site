#pragma once
#define WIFI_STA 1
#define WL_CONNECTED 3
struct WifiMock{
 bool initialized=false,modeSucceeds=true;int connection=0,statusCalls=0,retries=0;
 void setHostname(const char*){}bool mode(int){initialized=modeSucceeds;return initialized;}
 void setAutoReconnect(bool){}void begin(const char*,const char*){assert(initialized);}
 int status(){assert(initialized);++statusCalls;return connection;}int RSSI(){return -55;}
 String localIP(){return "192.168.1.20";}void reconnect(){assert(initialized);++retries;}
}WiFi;
int ntpStarts=0;
void configTime(int,int,const char*,const char*){assert(WiFi.initialized&&WiFi.connection==WL_CONNECTED);++ntpStarts;}
