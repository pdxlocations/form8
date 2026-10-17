#pragma once
#include <deque>
#include <vector>
#include <cstring>
struct Queue {size_t capacity,size;std::deque<std::vector<uint8_t>> data;};
using QueueHandle_t=Queue*;
inline QueueHandle_t xQueueCreate(size_t count,size_t size){return new Queue{count,size,{}};}
inline void xQueueReset(QueueHandle_t q){q->data.clear();}
inline int xQueueSend(QueueHandle_t q,void* value,int){if(q->data.size()==q->capacity)return 0;q->data.emplace_back((uint8_t*)value,(uint8_t*)value+q->size);return 1;}
inline int xQueueReceive(QueueHandle_t q,void* value,int){if(q->data.empty())return 0;memcpy(value,q->data.front().data(),q->size);q->data.pop_front();return 1;}
