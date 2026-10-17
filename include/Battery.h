#pragma once
#include <Arduino.h>
#include <BatteryGauge.h>
#include <BoardConfig.h>

struct BatteryReading { uint16_t millivolts=0; };
inline BatteryReading& batteryReading(){static BatteryReading reading;return reading;}
#if defined(FORM8_HAS_PMU_BATTERY)
#include <TBeamPower.h>
inline void updateBattery(uint32_t now){
  static uint32_t next=0;if(int32_t(now-next)<0)return;next=now+5000;
  const uint16_t mv=tBeamBatteryMillivolts();batteryReading().millivolts=plausibleBatteryVoltage(mv)?mv:0;
}
#elif defined(FORM8_HAS_BATTERY)
// Heltec V3 schematics: GPIO1, 390k/100k divider, GPIO37 control.
// V3.2 changed the enable polarity. The board's resistor bias is the off level.
// https://docs.heltec.org/en/node/esp32/wifi_lora_32/hardware_update_log.html
inline void updateBattery(uint32_t now) {
  static bool initialized=false,sampling=false;
  static uint32_t next=0,settledAt=0;
  if(!initialized){
    pinMode(BATTERY_ADC_PIN,INPUT);
    if(BATTERY_CTRL_PIN>=0)pinMode(BATTERY_CTRL_PIN,INPUT);
    analogSetPinAttenuation(BATTERY_ADC_PIN,BATTERY_RATIO_NUM==49?ADC_2_5db:ADC_11db);initialized=true;
  }
  if(!sampling){
    if(int32_t(now-next)<0)return;
    if(BATTERY_CTRL_PIN>=0){
      const int enabled=BATTERY_ENABLE_LEVEL>=0?BATTERY_ENABLE_LEVEL:(digitalRead(BATTERY_CTRL_PIN)==HIGH?LOW:HIGH);
      digitalWrite(BATTERY_CTRL_PIN,enabled);pinMode(BATTERY_CTRL_PIN,OUTPUT);
    }
    settledAt=now+10;sampling=true;return;
  }
  if(int32_t(now-settledAt)<0)return;
  uint32_t sum=0;
  for(unsigned i=0;i<8;++i)sum+=analogReadMilliVolts(BATTERY_ADC_PIN);
  if(BATTERY_CTRL_PIN>=0)pinMode(BATTERY_CTRL_PIN,INPUT);
  sampling=false;next=now+5000;
  const uint32_t denominator=8*BATTERY_RATIO_DEN;
  const uint32_t mv=(sum*BATTERY_RATIO_NUM+denominator/2)/denominator;
  auto& reading=batteryReading();
  if(!plausibleBatteryVoltage(mv)){reading.millivolts=0;return;}
  reading.millivolts=reading.millivolts?(3*reading.millivolts+mv)/4:mv;
}
#else
inline void updateBattery(uint32_t) {} // No configured sensor on this target.
#endif
