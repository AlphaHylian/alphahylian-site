package com.alphahylian.skirmish;

import java.util.ArrayDeque;
import java.util.Deque;

/**
 * Counts clicks over the last second.
 *
 * Sampled once per frame rather than once per tick: at 20 ticks a second a
 * tick-sampled counter tops out around 10 CPS, which is well below what people
 * actually click at.
 */
public final class CpsTracker {
	private static final long WINDOW_NANOS = 1_000_000_000L;

	private final Deque<Long> clicks = new ArrayDeque<>();
	private boolean wasDown = false;

	/** Feed the current button state; returns true on the press edge. */
	public boolean sample(boolean down) {
		boolean pressed = down && !wasDown;
		wasDown = down;
		if (pressed) {
			clicks.addLast(System.nanoTime());
		}
		return pressed;
	}

	public int cps() {
		long cutoff = System.nanoTime() - WINDOW_NANOS;
		while (!clicks.isEmpty() && clicks.peekFirst() < cutoff) {
			clicks.removeFirst();
		}
		return clicks.size();
	}
}
