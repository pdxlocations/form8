#pragma once
#include <cstdint>

namespace form8 {
// New records use a persistent local sequence, independent of sender clocks.
// Older firmware only stored receive order; sentAt recovers legacy chronology
// where available. IDs provide a deterministic tie-break in the caller.
struct TrafficOrder {
  uint32_t order=0;
  int64_t sentAt=0;
  uint32_t receivedOrder=0;
  bool operator<(const TrafficOrder& other) const {
    if(order!=other.order)return order>other.order;
    if(sentAt!=other.sentAt)return sentAt>other.sentAt;
    return receivedOrder>other.receivedOrder;
  }
};
}
