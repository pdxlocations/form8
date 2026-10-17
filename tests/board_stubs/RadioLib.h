#pragma once
#include <Arduino.h>
#include <vector>
constexpr int RADIOLIB_NC=-1,RADIOLIB_ERR_NONE=0,RADIOLIB_ERR_CHIP_NOT_FOUND=-2,RADIOLIB_ERR_INVALID_OUTPUT_POWER=-13;
constexpr uint32_t RADIOLIB_SX126X_IRQ_HEADER_VALID=0x10,RADIOLIB_SX126X_IRQ_RX_DONE=0x02,RADIOLIB_SX126X_IRQ_TIMEOUT=0x200,RADIOLIB_SX126X_IRQ_CRC_ERR=0x40,RADIOLIB_SX126X_IRQ_HEADER_ERR=0x20;
constexpr uint32_t RADIOLIB_SX127X_CLEAR_IRQ_FLAG_VALID_HEADER=0x10,RADIOLIB_SX127X_CLEAR_IRQ_FLAG_RX_DONE=0x40,RADIOLIB_SX127X_CLEAR_IRQ_FLAG_RX_TIMEOUT=0x80,RADIOLIB_SX127X_CLEAR_IRQ_FLAG_PAYLOAD_CRC_ERROR=0x20;
struct Module {
  int cs,irq,reset,busy;
  Module(int c,int i,int r,int b):cs(c),irq(i),reset(r),busy(b){}
};
struct RadioStub {
  Module* mod;
  std::vector<double> arguments;
  bool dioSwitch=false;
  uint32_t irqFlags=0;
  uint32_t getIrqFlags(){return irqFlags;}
  int rx=-2,tx=-2,beginResult=0;
  RadioStub(Module* value):mod(value){}
  ~RadioStub(){delete mod;}
  template<typename... Args> int16_t begin(Args... args){arguments={double(args)...};return beginResult;}
  int16_t setDio2AsRfSwitch(bool enabled){dioSwitch=enabled;return 0;}
  void setRfSwitchPins(int r,int t){rx=r;tx=t;}
};
struct SX1262:RadioStub {using RadioStub::RadioStub;};
struct SX1276:RadioStub {using RadioStub::RadioStub;};
struct SX1278:RadioStub {using RadioStub::RadioStub;};
