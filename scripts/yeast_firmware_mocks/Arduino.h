#pragma once
#include <string>
#include <map>
#include <functional>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <cassert>
#include <iostream>
#define PROGMEM
#define ADC_11db 3
using StringBase=std::string;
struct String:std::string {
 using std::string::string;
 String(const std::string&s):std::string(s){}
 String(long long v):std::string(std::to_string(v)){}
 int indexOf(const char*s)const{auto p=find(s);return p==npos?-1:(int)p;}
 String(unsigned long v):std::string(std::to_string(v)){}
 String(unsigned int v):std::string(std::to_string(v)){}
 String(int v):std::string(std::to_string(v)){}
 String(float v,int digits){char b[40];snprintf(b,sizeof(b),"%.*f",digits,v);assign(b);}
};
uint64_t fakeMs=0;
uint32_t millis(){return (uint32_t)fakeMs;}
void delay(unsigned n){fakeMs+=n;}
void delayMicroseconds(unsigned){}
void yield(){}
int analogRead(uint8_t pin){return pin==34?600:120;}
void analogReadResolution(int){}
void analogSetPinAttenuation(int,int){}
struct SerialMock{template<class... T>void printf(const char*,T...){}void begin(int){} template<class T>void print(T){} void print(float,int){}template<class T>void println(T){}void println(){}}Serial;
using std::isfinite;
