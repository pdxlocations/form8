#pragma once
// Physical nRF GPIO numbers: P0.x=x, P1.x=32+x; identity Arduino pin map.
#if defined(FORM8_NRF_RAK4631) || defined(FORM8_NRF_WISMESH_TAG)
#define NRF_BOARD_NAME "RAK4631 / WisMesh Tag"
#define NRF_SCK 43
#define NRF_MISO 45
#define NRF_MOSI 44
#define NRF_CS 42
#define NRF_IRQ 47
#define NRF_BUSY 46
#define NRF_RESET 38
#define FORM8_POWER_PIN 37
#define NRF_LED 35
#define NRF_GPS_RX 15
#define NRF_GPS_TX 16
#define NRF_GPS_EN 34
#define NRF_BATTERY 5
#define NRF_BAT_RATIO 1.73f
#elif defined(FORM8_NRF_T_ECHO) || defined(FORM8_NRF_T114)
#if defined(FORM8_NRF_T_ECHO)
#define NRF_BOARD_NAME "LILYGO T-Echo"
#define NRF_GPS_RX 41
#define NRF_GPS_TX 40
#define NRF_GPS_RESET 37
#define FORM8_POWER_PIN 12
#else
#define NRF_BOARD_NAME "Heltec Mesh Node T114"
#define NRF_GPS_RX 37
#define NRF_GPS_TX 39
#define FORM8_POWER_PIN 21
#define NRF_BAT_EN 6
#define NRF_BAT_EN_LEVEL 1
#endif
#define NRF_SCK 19
#define NRF_MISO 23
#define NRF_MOSI 22
#define NRF_CS 24
#define NRF_IRQ 20
#define NRF_BUSY 17
#define NRF_RESET 25
#if defined(FORM8_NRF_T114)
#define NRF_LED 35
#else
#define NRF_LED 14
#endif
#define NRF_GPS_EN 34
#define NRF_BATTERY 4
#if defined(FORM8_NRF_T114)
#define NRF_BAT_RATIO 4.916f
#else
#define NRF_BAT_RATIO 2.0f
#endif
#elif defined(FORM8_NRF_T096)
#define NRF_BOARD_NAME "Heltec Mesh Node T096"
#define NRF_SCK 40
#define NRF_MISO 14
#define NRF_MOSI 11
#define NRF_CS 5
#define NRF_IRQ 21
#define NRF_BUSY 19
#define NRF_RESET 16
#define NRF_LED 28
#define NRF_GPS_RX 23
#define NRF_GPS_TX 25
#define NRF_GPS_EN 6
#define NRF_GPS_EN_LEVEL 0
#define NRF_GPS_BAUD 115200
#define NRF_BAT_EN 47
#define NRF_BAT_EN_LEVEL 1
#define NRF_GPS_RESET 46
#define NRF_BATTERY 3
#define NRF_BAT_RATIO 4.916f
#define NRF_AMPLIFIED
#define NRF_FEM_EN 12
#define NRF_FEM_POWER 30
#define NRF_FEM_RX 41
#elif defined(FORM8_NRF_WIO_L1)
#define NRF_BOARD_NAME "Seeed Wio Tracker L1"
#define NRF_SCK 30
#define NRF_MISO 3
#define NRF_MOSI 28
#define NRF_CS 46
#define NRF_IRQ 7
#define NRF_BUSY 42
#define NRF_RESET 39
#define NRF_RXEN 40
#define NRF_LED 33
#define NRF_GPS_RX 26
#define NRF_GPS_TX 27
#define NRF_GPS_EN 41
#define NRF_BATTERY 31
#define NRF_BAT_EN 4
#define NRF_BAT_EN_LEVEL 1
#define NRF_BAT_RATIO 2.0f
#elif defined(FORM8_NRF_XIAO_KIT)
#define NRF_BOARD_NAME "Seeed XIAO nRF52840 + Wio-SX1262 (standalone kit)"
#define NRF_SCK 45
#define NRF_MISO 46
#define NRF_MOSI 47
#define NRF_CS 4
#define NRF_IRQ 3
#define NRF_BUSY 29
#define NRF_RESET 28
#define NRF_RXEN 5
#define NRF_LED 30
// The standalone kit has no GPS; optional GPS wiring must not be assumed.
#define NRF_BATTERY 31
#define NRF_BAT_EN 14
#define NRF_BAT_RATIO 3.0f
#elif defined(FORM8_NRF_SOLAR)
#define NRF_BOARD_NAME "Seeed Solar Node"
#define NRF_SCK 45
#define NRF_MISO 46
#define NRF_MOSI 47
#define NRF_CS 4
#define NRF_IRQ 3
#define NRF_BUSY 29
#define NRF_RESET 28
#define NRF_RXEN 5
#define NRF_LED 19
#define NRF_GPS_RX 44
#define NRF_GPS_TX 43
#define NRF_GPS_EN 37
#define NRF_GPS_WAKE 2
#define NRF_GPS_RESET 35
#define NRF_BATTERY 31
#define NRF_BAT_EN 14
#define NRF_BAT_RATIO 3.3f
#elif defined(FORM8_NRF_T1000E)
#define NRF_BOARD_NAME "Seeed SenseCAP T1000-E"
#define NRF_LR1110
#define NRF_SCK 11
#define NRF_MISO 40
#define NRF_MOSI 41
#define NRF_CS 12
#define NRF_IRQ 33
#define NRF_BUSY 7
#define NRF_RESET 42
#define NRF_LED 24
#define NRF_GPS_RX 14
#define NRF_GPS_TX 13
#define NRF_GPS_EN 43
#define NRF_GPS_RESET 47
#define NRF_GPS_RESET_LEVEL 0
#define NRF_GPS_BAUD 115200
#define NRF_BATTERY 2
#define NRF_BAT_RATIO 2.0f
#else
#error Select a supported Form8 nRF52840 board
#endif
#ifndef NRF_GPS_RX
#define NRF_GPS_RX 8
#define NRF_GPS_TX 6
#define NRF_NO_GPS
#endif
#ifndef NRF_GPS_BAUD
#define NRF_GPS_BAUD 9600
#endif
#ifndef NRF_GPS_EN_LEVEL
#define NRF_GPS_EN_LEVEL 1
#endif

#ifndef NRF_BAT_EN_LEVEL
#define NRF_BAT_EN_LEVEL 0
#endif

#ifndef NRF_GPS_RESET_LEVEL
#define NRF_GPS_RESET_LEVEL 1
#endif
