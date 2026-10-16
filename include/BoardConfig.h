#pragma once
#include <cstdint>

#if (defined(FORM8_HELTEC_V3) + defined(FORM8_HELTEC_V4) + defined(FORM8_XIAO_S3) + defined(FORM8_TLORA_T3_S3) + defined(FORM8_TBEAM_BPF)) != 1
#error Select exactly one supported Form8 board target
#endif

#if defined(FORM8_HELTEC_V3) || defined(FORM8_HELTEC_V4)
#define FORM8_HAS_OLED
#define FORM8_HAS_BATTERY
constexpr int RADIO_SCK=9,RADIO_MISO=11,RADIO_MOSI=10,RADIO_CS=8,RADIO_RESET=12,RADIO_IRQ=14,RADIO_BUSY=13;
constexpr int DISPLAY_SDA=17,DISPLAY_SCL=18,DISPLAY_RESET=21,DISPLAY_POWER=36;
constexpr int BATTERY_ADC_PIN=1,BATTERY_CTRL_PIN=37;
constexpr unsigned BATTERY_RATIO_NUM=49,BATTERY_RATIO_DEN=10;
#if defined(FORM8_HELTEC_V4)
constexpr int BATTERY_ENABLE_LEVEL=1;
#if defined(FORM8_HELTEC_V4_KCT8103L)
constexpr const char* BOARD_NAME="Heltec V4 OLED (KCT8103L / V4.3)";
#else
constexpr const char* BOARD_NAME="Heltec V4 OLED (GC1109 / V4.2)";
#endif
constexpr const char* BOARD_POWER_NOTE="TX power is SX1262 drive level; the external amplifier increases antenna output.";
#else
constexpr int BATTERY_ENABLE_LEVEL=-1; // Detect original V3 versus V3.2 resistor bias.
constexpr const char* BOARD_NAME="Heltec WiFi LoRa 32 V3";
constexpr const char* BOARD_POWER_NOTE="";
#endif
#elif defined(FORM8_XIAO_S3)
constexpr const char* BOARD_NAME="Seeed XIAO ESP32S3 + Wio-SX1262 B2B";
constexpr const char* BOARD_POWER_NOTE="";
constexpr int RADIO_SCK=7,RADIO_MISO=8,RADIO_MOSI=9,RADIO_CS=41,RADIO_RESET=42,RADIO_IRQ=39,RADIO_BUSY=40;
#elif defined(FORM8_TLORA_T3_S3)
#define FORM8_HAS_OLED
#define FORM8_HAS_BATTERY
#if defined(FORM8_RADIO_SX1276)
constexpr const char* BOARD_NAME="LILYGO T3-S3 (SX1276)";
constexpr int RADIO_IRQ=9,RADIO_BUSY=33; // SX1276 DIO0 and DIO1, not a BUSY signal.
#else
constexpr const char* BOARD_NAME="LILYGO T3-S3 (SX1262)";
constexpr int RADIO_IRQ=33,RADIO_BUSY=34;
#endif
constexpr const char* BOARD_POWER_NOTE="";
constexpr int RADIO_SCK=5,RADIO_MISO=3,RADIO_MOSI=6,RADIO_CS=7,RADIO_RESET=8;
constexpr int DISPLAY_SDA=18,DISPLAY_SCL=17,DISPLAY_RESET=-1,DISPLAY_POWER=-1;
constexpr int BATTERY_ADC_PIN=1,BATTERY_CTRL_PIN=-1,BATTERY_ENABLE_LEVEL=-1;
constexpr unsigned BATTERY_RATIO_NUM=2,BATTERY_RATIO_DEN=1;
#elif defined(FORM8_TBEAM_BPF)
constexpr const char* BOARD_NAME="T-Beam BPF (experimental)";
constexpr const char* BOARD_POWER_NOTE="";
constexpr int RADIO_SCK=12,RADIO_MISO=13,RADIO_MOSI=11,RADIO_CS=1,RADIO_RESET=18,RADIO_IRQ=14,RADIO_BUSY=21;
#endif
constexpr bool VHF=
#if defined(FORM8_TBEAM_BPF)
true;
#else
false;
#endif
