package org.form8.radio;

/** Bounded connection retries; never replay traffic after a working link drops. */
final class BleReconnectPolicy {
  private long generation = 0, lastClosedAt = -1;
  private int attempts = 0;
  private boolean connecting = false;

  long begin() {
    attempts = 0;
    connecting = true;
    return ++generation;
  }

  boolean current(long session) {
    return connecting && generation == session;
  }

  boolean startAttempt(long session) {
    if (!current(session) || attempts >= 3) return false;
    ++attempts;
    return true;
  }

  boolean retryable(int status) {
    return connecting && status == 133 && attempts > 0 && attempts < 3;
  }

  long delayMillis(long now) {
    long cooldown = lastClosedAt < 0 ? 0 : Math.max(0, 1000 - Math.max(0, now - lastClosedAt));
    long backoff = attempts == 0 ? 0 : attempts == 1 ? 1500 : 3000;
    return Math.max(cooldown, backoff);
  }

  int nextAttempt() {
    return attempts + 1;
  }

  void closed(long now) {
    lastClosedAt = now;
  }

  void cancel() {
    connecting = false;
    ++generation;
  }
}
