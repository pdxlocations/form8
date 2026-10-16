#pragma once
#include <Arduino.h>
#include <RadioLib.h>
#if defined(FORM8_HELTEC_V3)
constexpr const char* BOARD_NAME="Heltec WiFi LoRa 32 V3";
constexpr bool VHF=false;
constexpr int RADIO_SCK=9, RADIO_MISO=11, RADIO_MOSI=10;
SX1262 radio=new Module(8,14,12,13);
inline void boardPower() {}
inline int16_t radioBegin(float freq,float bw,uint8_t sf,uint8_t cr,int8_t power) {
  // Heltec V3 uses a 1.8 V TCXO controlled by DIO3 and DIO2 RF switching.
  int16_t e=radio.begin(freq,bw,sf,cr,0x12,power,8,1.8,false);
  if(e==RADIOLIB_ERR_NONE) radio.setDio2AsRfSwitch(true);
  return e;
}
#elif defined(FORM8_TBEAM_BPF)
constexpr const char* BOARD_NAME="T-Beam BPF (experimental)";
constexpr bool VHF=true;
constexpr int RADIO_SCK=12, RADIO_MISO=13, RADIO_MOSI=11;
SX1278 radio=new Module(1,14,18,21);
inline void boardPower() { pinMode(16,OUTPUT); digitalWrite(16,HIGH); pinMode(39,OUTPUT); digitalWrite(39,HIGH); delay(20); }
inline int16_t radioBegin(float freq,float bw,uint8_t sf,uint8_t cr,int8_t power) {
  if(power>10) return RADIOLIB_ERR_INVALID_OUTPUT_POWER;
  int16_t e=radio.begin(freq,bw,sf,cr,0x12,power,8,0);
  // Pin 39 enables receive LNA: low on TX, high on RX.
  if(e==RADIOLIB_ERR_NONE) radio.setRfSwitchPins(39,RADIOLIB_NC);
  return e;
}
#else
#error Select a supported Form8 board
#endif

