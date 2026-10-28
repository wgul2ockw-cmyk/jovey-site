#include "firmware/Yeast_Cloud.ino"
#include <fstream>
int main(){
 setup();
 for(int i=0;i<3605;i++){fakeMs=(i+1)*1000;sampleSensors();fakeMs+=800;sampleSensors();}
 assert(count==3600&&sequence==3605);
 assert(history[(sequence-1)%HISTORY_SIZE].mq3==600);
 assert(history[(sequence-1)%HISTORY_SIZE].mq135==120);
 server.args["after"]="1";server.args["boot"]=bootId;handleData();
 std::ofstream("ring.json")<<server.body;
 handleCsv();std::ofstream("data.csv")<<server.body;
 for(int i=0;i<70;i++){server.args["kind"]="sample";handleEvent();}
 assert(eventCount==64);server.args["kind"]="invalid";handleEvent();assert(server.code==400);
 handleEventsCsv();std::ofstream("events.csv")<<server.body;
 fakeTemp=-127;fakeMs+=1000;sampleSensors();fakeMs+=800;sampleSensors();
 server.args["after"]=String(sequence-1);handleData();std::ofstream("null.json")<<server.body;
 server.args["boot"]="previous_boot";handleData();std::ofstream("reset.json")<<server.body;
 std::cout<<"PASS native C++ syntax and ring-wrap, distinct ADC pins, missing temperature, event bounds, CSV, reboot cursor paths. Hardware APIs mocked.\n";
}
