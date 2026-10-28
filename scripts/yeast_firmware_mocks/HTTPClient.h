#pragma once
#include "WiFiClientSecure.h"
struct HTTPClient{void setConnectTimeout(int){}void setTimeout(int){}bool begin(WiFiClientSecure&,String){return true;}void addHeader(const char*,const char*){}int POST(String){return 200;}String getString(){return "{\"ok\":true}";}void end(){}};
