#pragma once
#define DEVICE_DISCONNECTED_C -127
float fakeTemp=27.5f;
struct DallasTemperature{DallasTemperature(OneWire*){}void begin(){}void setResolution(int){}void setWaitForConversion(bool){}void requestTemperatures(){}float getTempCByIndex(int){return fakeTemp;}};
