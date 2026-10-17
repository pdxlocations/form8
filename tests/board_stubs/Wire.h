#pragma once
struct TwoWire {int sda=-1,scl=-1;void begin(int a,int b){sda=a;scl=b;}};
inline TwoWire Wire;
