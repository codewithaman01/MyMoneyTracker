import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { clearPin, hasPin, lockedSeconds, setPin, validPin, verifyPin } from "./lock";

beforeEach(async () => { await db.settings.clear(); });

describe("app lock PIN", () => {
  it("accepts only 4-8 digits and never stores the PIN itself", async () => {
    expect(["1234", "12345678", "123", "123456789", "12a4", ""].map(validPin)).toEqual([true, true, false, false, false, false]);
    await expect(setPin("12")).rejects.toThrow();
    await setPin("4821");
    expect(await hasPin()).toBe(true);
    expect(JSON.stringify(await db.settings.toArray())).not.toContain("4821");
  });
  it("verifies the right PIN and rejects a wrong one", async () => {
    await setPin("4821");
    expect(await verifyPin("0000")).toBe("wrong");
    expect(await verifyPin("4821")).toBe("ok");
  });
  it("5 wrong tries lock for 30 s (even the right PIN); 5 more after it expires lock for 60 s", async () => {
    await setPin("4821");
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) expect(await verifyPin("1111", t0)).toBe("wrong");
    expect(await verifyPin("4821", t0 + 1000)).toBe("locked");
    expect(await lockedSeconds(t0 + 1000)).toBe(29);
    // attempts made while locked are rejected without counting; once it expires 5 more failures double the lock
    const t1 = t0 + 31_000;
    for (let i = 0; i < 5; i++) expect(await verifyPin("1111", t1)).toBe("wrong");
    expect(await lockedSeconds(t1)).toBe(60);
    // the right PIN works again after the lock, and a successful unlock resets the counter
    const t2 = t1 + 61_000;
    expect(await verifyPin("4821", t2)).toBe("ok");
    for (let i = 0; i < 5; i++) await verifyPin("1111", t2);
    expect(await lockedSeconds(t2)).toBe(30);
  });
  it("changing the PIN resets the failure counter; clearing removes the record", async () => {
    await setPin("4821");
    for (let i = 0; i < 5; i++) await verifyPin("1111", 5);
    await setPin("9999");
    expect(await verifyPin("9999", 6)).toBe("ok");
    await clearPin();
    expect(await hasPin()).toBe(false);
  });
});
