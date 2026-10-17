#pragma once
#include <Wire.h>
#include <map>
constexpr int AXP2101_SLAVE_ADDRESS=0x34,AXP192_SLAVE_ADDRESS=0x34;
inline int detectedPmu=192;
struct PmuStub {
  int model;bool measured=false;std::map<int,int> volts;std::map<int,bool> enabled;
  PmuStub(int value):model(value){}
  bool begin(TwoWire&,int,int,int){return model==detectedPmu;}
  void enableBattVoltageMeasure(){measured=true;}
  unsigned getBattVoltage(){return measured?3900:0;}
};
struct XPowersAXP192:PmuStub {
  XPowersAXP192():PmuStub(192){}
  void setLDO2Voltage(int v){volts[2]=v;}void enableLDO2(){enabled[2]=true;}
  void setLDO3Voltage(int v){volts[3]=v;}void enableLDO3(){enabled[3]=true;}
  void setDC1Voltage(int v){volts[1]=v;}void enableDC1(){enabled[1]=true;}
};
struct XPowersAXP2101:PmuStub {
  XPowersAXP2101():PmuStub(2101){}
  void setALDO2Voltage(int v){volts[2]=v;}void enableALDO2(){enabled[2]=true;}
  void setALDO3Voltage(int v){volts[3]=v;}void enableALDO3(){enabled[3]=true;}
};
