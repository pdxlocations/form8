#pragma once
#include <Arduino.h>
#include <RadioLib.h>
#include <BoardConfig.h>

#if defined(FORM8_TBEAM_BPF)
SX1278 radio=new Module(RADIO_CS,RADIO_IRQ,RADIO_RESET,RADIO_BUSY);
inline void boardPower() {pinMode(16,OUTPUT);digitalWrite(16,HIGH);pinMode(39,OUTPUT);digitalWrite(39,HIGH);delay(20);}
inline int16_t radioBegin(float freq,float bw,uint8_t sf,uint8_t cr,int8_t power) {
  if(power>10)return RADIOLIB_ERR_INVALID_OUTPUT_POWER;
  int16_t result=radio.begin(freq,bw,sf,cr,0x12,power,8,0);
  if(result==RADIOLIB_ERR_NONE)radio.setRfSwitchPins(39,RADIOLIB_NC);
  return result;
}
#elif defined(FORM8_RADIO_SX1276)
SX1276 radio=new Module(RADIO_CS,RADIO_IRQ,RADIO_RESET,RADIO_BUSY);
inline void boardPower() {}
inline int16_t radioBegin(float freq,float bw,uint8_t sf,uint8_t cr,int8_t power) {
  return radio.begin(freq,bw,sf,cr,0x12,power,8,0);
}
#else
SX1262 radio=new Module(RADIO_CS,RADIO_IRQ,RADIO_RESET,RADIO_BUSY);
inline void boardPower() {
#if defined(FORM8_HELTEC_V4)
  // GPIO7 supplies the FEM rail; GPIO2 enables the front-end chip.
  pinMode(7,OUTPUT);digitalWrite(7,HIGH);pinMode(2,OUTPUT);digitalWrite(2,HIGH);
#if defined(FORM8_HELTEC_V4_KCT8103L)
  pinMode(5,OUTPUT);digitalWrite(5,LOW); // Receive LNA path; DIO2 selects TX.
#else
  pinMode(46,OUTPUT);digitalWrite(46,LOW); // GC1109 PA enabled only during TX.
#endif
  delay(10);
#endif
}
inline int16_t radioBegin(float freq,float bw,uint8_t sf,uint8_t cr,int8_t power) {
  int16_t result=radio.begin(freq,bw,sf,cr,0x12,power,8,1.8,false);
  if(result!=RADIOLIB_ERR_NONE)return result;
  result=radio.setDio2AsRfSwitch(true);
#if defined(FORM8_XIAO_S3)
  radio.setRfSwitchPins(38,RADIOLIB_NC); // Wio-SX1262 RX antenna switch.
#elif defined(FORM8_HELTEC_V4) && !defined(FORM8_HELTEC_V4_KCT8103L)
  radio.setRfSwitchPins(RADIOLIB_NC,46); // GC1109 CPS: PA on during TX only.
#endif
  return result;
}
#endif

// Read IRQ status without clearing flags, changing DIO routing, or restarting RX.
inline bool radioReceivingPacket() {
  const uint32_t flags=radio.getIrqFlags();
#if defined(FORM8_RADIO_SX1276) || defined(FORM8_TBEAM_BPF)
  return (flags&RADIOLIB_SX127X_CLEAR_IRQ_FLAG_VALID_HEADER) &&
    !(flags&(RADIOLIB_SX127X_CLEAR_IRQ_FLAG_RX_DONE | RADIOLIB_SX127X_CLEAR_IRQ_FLAG_RX_TIMEOUT | RADIOLIB_SX127X_CLEAR_IRQ_FLAG_PAYLOAD_CRC_ERROR));
#else
  return (flags&RADIOLIB_SX126X_IRQ_HEADER_VALID) &&
    !(flags&(RADIOLIB_SX126X_IRQ_RX_DONE | RADIOLIB_SX126X_IRQ_TIMEOUT | RADIOLIB_SX126X_IRQ_CRC_ERR | RADIOLIB_SX126X_IRQ_HEADER_ERR));
#endif
}
