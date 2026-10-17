#pragma once
#include "../api_stubs/Arduino.h"
#include <algorithm>
#include <cstring>
#include <functional>
uint32_t millis();
struct SerialStub {void println(const char*){} template<class... Args>void printf(const char*,Args...) {}};
inline SerialStub Serial;
