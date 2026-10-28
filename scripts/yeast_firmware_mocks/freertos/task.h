#pragma once
int taskStarts=0;
void vTaskDelay(unsigned){}
int xTaskCreatePinnedToCore(void(*)(void*),const char*,unsigned,void*,int,void*,int){++taskStarts;return 1;}
