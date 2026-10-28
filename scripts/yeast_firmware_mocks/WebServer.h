#pragma once
#define HTTP_GET 0
#define HTTP_POST 1
#define CONTENT_LENGTH_UNKNOWN ((size_t)-1)
struct Client{bool connected(){return true;}};
struct WebServer{
 int begins=0,handles=0;String body;std::map<std::string,String>args;int code=0;
 WebServer(int){}String arg(const char*k){return args[k];}bool hasArg(const char*k){return args.count(k);}
 void sendHeader(String,String){}void setContentLength(size_t){}
 void send(int c,String,String b){code=c;body=b;}void send_P(int c,const char*,const char*b){code=c;body=b;}
 void sendContent(String s){body+=s;}Client client(){return {};}
 template<class F>void on(const char*,int,F){}template<class F>void onNotFound(F){}
 void begin(){assert(WiFi.initialized&&WiFi.connection==WL_CONNECTED);++begins;}void handleClient(){assert(begins>0);++handles;}
};
