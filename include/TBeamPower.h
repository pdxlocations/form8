#pragma once
#include <BoardConfig.h>
#if defined(FORM8_TBEAM)
#include <Wire.h>
#include <XPowersLib.h>
inline XPowersAXP192& tBeamAXP192(){static XPowersAXP192 pmu;return pmu;}
inline XPowersAXP2101& tBeamAXP2101(){static XPowersAXP2101 pmu;return pmu;}
inline uint8_t& tBeamPmu(){static uint8_t model=0;return model;}
inline bool beginTBeamPower(){
  if(tBeamPmu())return true;
  Wire.begin(GPS_SDA,GPS_SCL);
  auto& newer=tBeamAXP2101();
  if(newer.begin(Wire,AXP2101_SLAVE_ADDRESS,GPS_SDA,GPS_SCL)){
    // V1.2: leave the ESP32's DCDC1 supply unchanged.
    newer.setALDO2Voltage(3300);newer.enableALDO2(); // LoRa
    newer.setALDO3Voltage(3300);newer.enableALDO3(); // GPS
    newer.enableBattVoltageMeasure();tBeamPmu()=2;
  }else{
    auto& older=tBeamAXP192();
    if(!older.begin(Wire,AXP192_SLAVE_ADDRESS,GPS_SDA,GPS_SCL)){
      Serial.println("T-Beam PMU not found: V1.x needs AXP192 or AXP2101.");return false;
    }
    // V1.0/V1.1: DCDC3 powers ESP32; do not reconfigure it.
    older.setLDO2Voltage(3300);older.enableLDO2(); // LoRa
    older.setLDO3Voltage(3300);older.enableLDO3(); // GPS
    older.setDC1Voltage(3300);older.enableDC1(); // Optional OLED
    older.enableBattVoltageMeasure();tBeamPmu()=1;
  }
  delay(20);return true;
}
inline uint16_t tBeamBatteryMillivolts(){
  if(tBeamPmu()==1)return tBeamAXP192().getBattVoltage();
  if(tBeamPmu()==2)return tBeamAXP2101().getBattVoltage();
  return 0;
}
#endif
