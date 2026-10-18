package org.form8.radio;

import static org.junit.Assert.*;
import org.junit.Test;

public class BleReconnectPolicyTest {
  @Test public void firstConnectionDoesNotWaitButReconnectAllowsCleanup() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long session = policy.begin();
    assertEquals(0, policy.delayMillis(10000));
    assertTrue(policy.startAttempt(session));
    policy.closed(10000);
    policy.cancel();
    session = policy.begin();
    assertEquals(1000, policy.delayMillis(10000));
    assertEquals(600, policy.delayMillis(10400));
    assertEquals(0, policy.delayMillis(11000));
    assertTrue(policy.startAttempt(session));
  }

  @Test public void transient133GetsThreeTotalAttemptsWithBackoff() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long session = policy.begin();
    assertTrue(policy.startAttempt(session));
    assertTrue(policy.retryable(133));
    policy.closed(100);
    assertEquals(1500, policy.delayMillis(100));
    assertEquals(2, policy.nextAttempt());
    assertTrue(policy.startAttempt(session));
    assertTrue(policy.retryable(133));
    policy.closed(2000);
    assertEquals(3000, policy.delayMillis(2000));
    assertEquals(3, policy.nextAttempt());
    assertTrue(policy.startAttempt(session));
    assertFalse(policy.retryable(133));
    assertFalse(policy.startAttempt(session));
  }

  @Test public void pairingAndNormalDisconnectErrorsAreNotRetried() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long session = policy.begin();
    assertFalse(policy.retryable(133));
    policy.startAttempt(session);
    for (int status : new int[] {0, 5, 8, 15, 19, 62, 137})
      assertFalse("Unexpected retry for " + status, policy.retryable(status));
  }

  @Test public void disconnectCancelsPendingRetries() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long session = policy.begin();
    policy.startAttempt(session);
    assertTrue(policy.retryable(133));
    policy.cancel();
    assertFalse(policy.current(session));
    assertFalse(policy.startAttempt(session));
    assertFalse(policy.retryable(133));
  }

  @Test public void switchingRadiosInvalidatesOldScheduledAttempts() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long previous = policy.begin();
    policy.startAttempt(previous);
    policy.closed(100);
    policy.cancel();
    long current = policy.begin();
    assertFalse(policy.startAttempt(previous));
    assertEquals(1, policy.nextAttempt());
    assertEquals(1000, policy.delayMillis(100));
    assertTrue(policy.startAttempt(current));
  }

  @Test public void aWorkingLinkDoesNotAutoReplayTrafficAfterDisconnection() {
    BleReconnectPolicy policy = new BleReconnectPolicy();
    long session = policy.begin();
    policy.startAttempt(session);
    // Completing notification setup ends the connect-only retry window.
    policy.cancel();
    policy.closed(100);
    assertFalse(policy.retryable(133));
    assertFalse(policy.startAttempt(session));
  }
}
