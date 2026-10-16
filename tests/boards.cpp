#include <Board.h>
#include <Battery.h>
#include <ReceiveActivity.h>
#include <cassert>
#include <iostream>
int main(){
  ReceiveActivity activity;assert(!activity.visible(0));activity.progress(true);assert(activity.receiving() && activity.visible(10));
  activity.completed(100);assert(!activity.receiving() && activity.visible(849) && !activity.visible(850));
  activity.completed(UINT32_MAX-100);assert(activity.visible(100) && !activity.visible(649));activity.reset();assert(!activity.visible(100));
  assert(!radioReceivingPacket());radio.irqFlags=0x10;assert(radioReceivingPacket() && radio.irqFlags==0x10);
#if defined(FORM8_RADIO_SX1276) || defined(FORM8_TBEAM_BPF)
  radio.irqFlags=0x10|RADIOLIB_SX127X_CLEAR_IRQ_FLAG_RX_DONE;assert(!radioReceivingPacket());
  radio.irqFlags=0x10|RADIOLIB_SX127X_CLEAR_IRQ_FLAG_PAYLOAD_CRC_ERROR;assert(!radioReceivingPacket());
#else
  radio.irqFlags=0x10|RADIOLIB_SX126X_IRQ_RX_DONE;assert(!radioReceivingPacket());
  radio.irqFlags=0x10|RADIOLIB_SX126X_IRQ_HEADER_ERR;assert(!radioReceivingPacket());
#endif
  boardPower();
  assert(radio.mod->cs==RADIO_CS && radio.mod->irq==RADIO_IRQ);
  assert(radioBegin(VHF?146.78f:919.5f,500,9,8,VHF?10:14)==0);
#if defined(FORM8_HELTEC_V4)
  assert(levels[7]==HIGH && levels[2]==HIGH);
#if defined(FORM8_HELTEC_V4_KCT8103L)
  assert(modes[5]==OUTPUT && levels[5]==LOW);assert(radio.tx==-2);
#else
  assert(levels[46]==LOW && radio.tx==46 && radio.rx==RADIOLIB_NC);
#endif
#endif
#if defined(FORM8_XIAO_S3)
  assert(RADIO_CS==41 && RADIO_IRQ==39 && RADIO_RESET==42 && RADIO_BUSY==40);
  assert(RADIO_SCK==7 && RADIO_MISO==8 && RADIO_MOSI==9);
  assert(radio.rx==38 && radio.tx==RADIOLIB_NC);
#elif defined(FORM8_TLORA_T3_S3)
  assert(RADIO_CS==7 && RADIO_RESET==8 && RADIO_SCK==5 && RADIO_MISO==3 && RADIO_MOSI==6);
  assert(DISPLAY_SDA==18 && DISPLAY_SCL==17 && DISPLAY_POWER==-1 && DISPLAY_RESET==-1);
#if defined(FORM8_RADIO_SX1276)
  assert(RADIO_IRQ==9 && RADIO_BUSY==33 && !radio.dioSwitch);
#else
  assert(RADIO_IRQ==33 && RADIO_BUSY==34 && radio.dioSwitch);
#endif
#elif defined(FORM8_TBEAM_BPF)
  assert(VHF && levels[16]==HIGH && radio.rx==39);
#else
  assert(RADIO_CS==8 && RADIO_IRQ==14 && RADIO_RESET==12 && RADIO_BUSY==13 && radio.dioSwitch);
#endif
#if !defined(FORM8_TBEAM_BPF) && !defined(FORM8_RADIO_SX1276)
  assert(radio.dioSwitch && radio.arguments.size()==9 && radio.arguments[7]==1.8);
#endif
  radio.beginResult=-99;radio.dioSwitch=false;
  assert(radioBegin(VHF?146.78f:919.5f,500,9,8,10)==-99 && !radio.dioSwitch);
#if defined(FORM8_HAS_BATTERY)
#if defined(FORM8_TLORA_T3_S3)
  batteryHasControl=false;sensedMv=2000;
#else
  batteryOff=LOW;sensedMv=800;
#endif
  updateBattery(0);updateBattery(10);
  assert(batteryReading().millivolts==
#if defined(FORM8_TLORA_T3_S3)
    4000
#else
    3920
#endif
  );
#else
  updateBattery(0);assert(batteryReading().millivolts==0);
#endif
  std::cout<<BOARD_NAME<<": board routing/power/battery tests passed\n";
}
