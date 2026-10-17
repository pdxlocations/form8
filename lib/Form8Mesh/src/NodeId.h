#pragma once
#include <array>
#include <cstdint>

namespace form8 {
// Newlib-nano does not support printf's long-long integer conversions.
// Node and incident IDs must still be exactly 16 lowercase hex digits.
inline std::array<char,17> formatNodeId(uint64_t value) {
  std::array<char,17> out{};
  constexpr char digits[]="0123456789abcdef";
  for(int i=15;i>=0;--i){out[i]=digits[value&15];value>>=4;}
  return out;
}
}
