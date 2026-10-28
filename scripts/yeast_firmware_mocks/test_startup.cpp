#include "firmware/Yeast_Cloud.ino"
int main(int argc,char**argv){
 std::string scenario=argc>1?argv[1]:"unset";
 if(scenario!="unset")WIFI_SSID="test-network";
 if(scenario!="unset"&&scenario!="password-placeholder")WIFI_PASSWORD="test-password";
 if(scenario=="mode-fail")WiFi.modeSucceeds=false;
 setup();
 for(int i=1;i<=3;i++){fakeMs=i*2000;loop();fakeMs+=800;loop();}
 assert(sequence==3);
 assert(server.begins==0&&ntpStarts==0&&taskStarts==0&&cloudQueue==nullptr);
 if(scenario=="connect"){
  assert(networkStarted);WiFi.connection=WL_CONNECTED;loop();
  assert(server.begins==1&&ntpStarts==1&&taskStarts==1&&cloudQueue);
  loop();assert(server.begins==1&&ntpStarts==1&&taskStarts==1);
  WiFi.connection=0;fakeMs=31000;loop();assert(WiFi.retries==1);
  queueCloudPoint(40000,27,600,120,99);assert(uxQueueMessagesWaiting(cloudQueue)==1);
  WiFi.connection=WL_CONNECTED;loop();assert(server.begins==1&&ntpStarts==1&&taskStarts==1);
 }else assert(!networkStarted&&WiFi.statusCalls==0&&server.handles==0);
 std::cout<<"PASS startup "<<scenario<<": offline sampling, network initialization guards, deferred cloud/server\n";
}
