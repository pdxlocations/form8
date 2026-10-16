#pragma once
#include <cstdint>

// Coarse voltage bands for a single-cell LiPo, not a charge percentage.
inline bool plausibleBatteryVoltage(uint32_t mv){return mv>=2500 && mv<=4500;}
inline uint8_t batteryBars(uint32_t mv){
  if(!plausibleBatteryVoltage(mv) || mv<3500)return 0;
  if(mv<3700)return 1;
  if(mv<3900)return 2;
  if(mv<4100)return 3;
  return 4;
}
