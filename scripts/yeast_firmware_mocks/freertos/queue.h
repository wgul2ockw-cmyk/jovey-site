#pragma once
#include <deque>
#include <vector>
struct MockQueue{unsigned cap,size;std::deque<std::vector<char>> data;};using QueueHandle_t=MockQueue*;
QueueHandle_t xQueueCreate(unsigned cap,unsigned size){return new MockQueue{cap,size,{}};}
int xQueueSend(QueueHandle_t q,const void*p,int){if(q->data.size()>=q->cap)return 0;q->data.emplace_back((char*)p,(char*)p+q->size);return 1;}
int xQueueReceive(QueueHandle_t q,void*p,int){if(q->data.empty())return 0;memcpy(p,q->data.front().data(),q->size);q->data.pop_front();return 1;}
unsigned uxQueueMessagesWaiting(QueueHandle_t q){return q->data.size();}
