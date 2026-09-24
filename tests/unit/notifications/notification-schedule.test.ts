import { describe, expect, it } from "vitest";
import {
  isDailyJobDue,
  istClock,
  MAX_DELIVERY_ATTEMPTS,
  notifiesImmediately,
  retryDelayMinutes,
  sendsDigest,
} from "@/server/modules/notifications/notification-schedule";

/** 2026-09-24 09:15 IST = 03:45 UTC. */
const at = (utc: string) => new Date(`${utc}Z`);

describe("IST clock", () => {
  it("reads the IST calendar day and time of an instant", () => {
    expect(istClock(at("2026-09-24T03:45:00"))).toEqual({ day: "2026-09-24", time: "09:15" });
    // 20:00 UTC is already the next day in India.
    expect(istClock(at("2026-09-24T20:00:00"))).toEqual({ day: "2026-09-25", time: "01:30" });
  });
});

describe("daily jobs", () => {
  it("are due once the scheduled IST time has passed and they have not run today", () => {
    const now = at("2026-09-24T03:45:00"); // 09:15 IST
    expect(isDailyJobDue(now, "09:00", null)).toBe(true);
    expect(isDailyJobDue(now, "09:15", "2026-09-23")).toBe(true);
    expect(isDailyJobDue(now, "09:30", null)).toBe(false);
    expect(isDailyJobDue(now, "09:00", "2026-09-24")).toBe(false);
  });
});

describe("frequency", () => {
  it("sends immediately or as a digest only when the rule is enabled", () => {
    expect(notifiesImmediately({ isEnabled: true, frequency: "IMMEDIATE" })).toBe(true);
    expect(notifiesImmediately({ isEnabled: true, frequency: "DAILY_DIGEST" })).toBe(false);
    expect(notifiesImmediately({ isEnabled: false, frequency: "IMMEDIATE" })).toBe(false);
    expect(sendsDigest({ isEnabled: true, frequency: "DAILY_DIGEST" })).toBe(true);
    expect(sendsDigest({ isEnabled: true, frequency: "IMMEDIATE" })).toBe(false);
    expect(sendsDigest({ isEnabled: false, frequency: "DAILY_DIGEST" })).toBe(false);
  });
});

describe("retry backoff", () => {
  it("doubles per attempt and is capped at an hour", () => {
    expect([1, 2, 3, 4, 5].map((attempt) => retryDelayMinutes(attempt))).toEqual([2, 4, 8, 16, 32]);
    expect(retryDelayMinutes(6)).toBe(60);
    expect(retryDelayMinutes(20)).toBe(60);
    expect(MAX_DELIVERY_ATTEMPTS).toBeGreaterThan(1);
  });
});
