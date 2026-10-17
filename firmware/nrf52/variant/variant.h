#pragma once
#include "WVariant.h"
#include "../Pins.h"
#define VARIANT_MCK 64000000ul
#define USE_LFXO
#define PINS_COUNT 48
#define NUM_DIGITAL_PINS 48
#define NUM_ANALOG_INPUTS 8
#define NUM_ANALOG_OUTPUTS 0
#define PIN_LED1 NRF_LED
#define LED_BUILTIN PIN_LED1
#define LED_BLUE PIN_LED1
#define LED_STATE_ON 1
#define PIN_A0 2
#define PIN_A1 3
#define PIN_A2 4
#define PIN_A3 5
#define PIN_A4 28
#define PIN_A5 29
#define PIN_A6 30
#define PIN_A7 31
static const uint8_t A0=2,A1=3,A2=4,A3=5,A4=28,A5=29,A6=30,A7=31;
#define ADC_RESOLUTION 12
#define PIN_SERIAL1_RX NRF_GPS_RX
#define PIN_SERIAL1_TX NRF_GPS_TX
#define SPI_INTERFACES_COUNT 1
#define PIN_SPI_MISO NRF_MISO
#define PIN_SPI_MOSI NRF_MOSI
#define PIN_SPI_SCK NRF_SCK
static const uint8_t SS=NRF_CS,MOSI=NRF_MOSI,MISO=NRF_MISO,SCK=NRF_SCK;
#define WIRE_INTERFACES_COUNT 1
#define PIN_WIRE_SDA 26
#define PIN_WIRE_SCL 27
