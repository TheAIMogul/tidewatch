import { describe, expect, it } from "vitest";
import { avatarFor, fmtDate, signals, type Gift } from "../signals";
import { normName, normStreet } from "../normalize";
import { GMD_DATE, TODAY, checks, gala, giftsFrom, gmd, toGift } from "./fixtures";

const run = (gifts: Gift[]) => signals(gifts, TODAY, GMD_DATE);
const gift = (date: string, amount: number, code = "CSV", status = "ok"): Gift => ({ date, amount, status, code });

describe("signals: planted donors from the sample exports", () => {
  it("Rosa (GMD Nov 2021, 2023, 2024, 2025) is due on Give Miami Day 2026", () => {
    const g = giftsFrom(gmd, "Rosa M. Delgado");
    expect(g.map((x) => x.date)).toEqual(["2021-11-18", "2023-11-16", "2024-11-21", "2025-11-20"]);
    const s = run(g);
    expect(s.pattern).toBe("Every Give Miami Day");
    expect(s.state).toBe("due");
    expect(s.expected).toBe("2026-11-19");
    expect(s.at_risk).toBe(250);
    expect(s.lifetime).toBe(800);
    expect(s.years).toBe(4);
    expect(s.loyalty).toBe(67);
    expect(s.designation).toBe("Mentoring");
    expect(s.reason).toBe("Gave every Give Miami Day since 2021. Nothing yet this year.");
  });

  it("Rosa stays Give Miami Day / due when her checks and auction bid are merged in", () => {
    const g = [...giftsFrom(gmd, "Rosa M. Delgado"), ...giftsFrom(checks, "R. Delgado"), ...giftsFrom(gala, "Rosa Delgado")];
    expect(g).toHaveLength(7);
    const s = run(g);
    expect(s).toMatchObject({ pattern: "Every Give Miami Day", state: "due", expected: "2026-11-19", gift_count: 7 });
  });

  it("Theodore Baptiste (monthly $150, then 3 declined) is Monthly / late with $1,800 at risk", () => {
    const g = giftsFrom(gmd, "Theodore Baptiste");
    expect(g.filter((x) => x.status === "declined")).toHaveLength(3);
    const s = run(g);
    expect(s.pattern).toBe("Monthly");
    expect(s.state).toBe("late");
    expect(s.failed).toBe(3);
    expect(s.at_risk).toBe(1800);
    expect(s.last_gift).toBe("2026-07-05");
    expect(s.expected).toBe("2026-08-05");
    expect(s.reason).toMatch(/declined/);
    expect(s.reason).toBe("$150 a month for 10 months. Card declined ×3 since Aug.");
  });

  it("Kenji (monthly $75 Jan–Sep 2026) is Monthly / late", () => {
    const s = run(giftsFrom(gmd, "Kenji Watanabe"));
    expect(s.pattern).toBe("Monthly");
    expect(s.state).toBe("late");
    expect(s.failed).toBe(0);
    expect(s.at_risk).toBe(900);
    expect(s.reason).toBe("$75 a month for 9 months. Nothing since Sep 12, 2026.");
  });

  it("Mei Chen (monthly through Nov 2026) is Monthly / ok", () => {
    const s = run(giftsFrom(gmd, "Mei Chen"));
    expect(s.pattern).toBe("Monthly");
    expect(s.state).toBe("ok");
    expect(s.last_gift).toBe("2026-11-01");
    expect(s.expected).toBe("2026-12-02");
    expect(s.reason).toBe("$25 a month, on schedule.");
  });

  it("Priya (monthly $40 through Jun 2026) is Monthly / late", () => {
    const s = run(giftsFrom(gmd, "Priya Nair"));
    expect(s).toMatchObject({ pattern: "Monthly", state: "late", at_risk: 480 });
  });

  it("Marguerite (checks Dec 2022, 2023, 2024; none Dec 2025) is annual December / late", () => {
    // Grouped the way the generator defines her: same street, two spellings of the name.
    const rows = checks.rows.filter((r) => normStreet(r.street) === normStreet("742 NE 125th St"));
    expect(rows.map((r) => normName(r.name))).toEqual(expect.arrayContaining(["marguerite desir", "m desir"]));
    const s = run(rows.map(toGift(checks.code)));
    expect(s.gift_count).toBe(3);
    expect(s.pattern).toBe("Every December");
    expect(s.state).toBe("late");
  });

  it("Harold Weiss (June checks 2022-2025) is Every June / late with $2,000 at risk", () => {
    const s = run(giftsFrom(checks, "Dr. Harold Weiss"));
    expect(s.gift_count).toBe(4);
    expect(s.pattern).toBe("Every June");
    expect(s.state).toBe("late");
    expect(s.at_risk).toBe(2000);
    expect(s.expected?.slice(0, 7)).toBe("2026-06");
    expect(s.reason).toBe("Gave every June since 2022. None in Jun 2026.");
  });

  it("Lucia & Tomas Herrera (GMD 2022-2025) is Give Miami Day / due", () => {
    const s = run(giftsFrom(gmd, "Lucia & Tomas Herrera"));
    expect(s).toMatchObject({ pattern: "Every Give Miami Day", state: "due", expected: "2026-11-19", at_risk: 300, loyalty: 80 });
  });

  it("auction donors who bid in 2024, 2025 and 2026 are Every March / ok", () => {
    const byName = new Map<string, number>();
    for (const r of gala.rows) byName.set(r.name, (byName.get(r.name) ?? 0) + 1);
    const regular = [...byName].filter(([, n]) => n === 3).map(([n]) => n);
    expect(regular.length).toBeGreaterThanOrEqual(6);
    for (const name of regular) {
      const s = run(giftsFrom(gala, name));
      expect(s, name).toMatchObject({ pattern: "Every March", state: "ok", at_risk: 0, expected: "2027-03-14" });
    }
  });
});

describe("signals: hand-built cases", () => {
  it("a one-off recent donor is One-time / ok", () => {
    const s = run([gift("2025-09-05", 120, "TIX")]);
    expect(s).toMatchObject({ pattern: "One-time", state: "ok", expected: null, at_risk: 0, gift_count: 1, reason: "One gift, Sep 5, 2025." });
  });

  it("a donor whose last gift is more than 2 years old is quiet", () => {
    const s = run([gift("2023-06-01", 50, "CHK")]);
    expect(s).toMatchObject({ pattern: "One-time", state: "quiet", expected: null, at_risk: 0 });
  });

  it("exactly 730 days ago is not yet quiet; 731 is", () => {
    expect(run([gift("2024-11-08", 50)]).state).toBe("ok");
    expect(run([gift("2024-11-07", 50)]).state).toBe("quiet");
  });

  it("two irregular gifts are Occasional", () => {
    const s = run([gift("2025-03-01", 50), gift("2025-09-15", 75)]);
    expect(s).toMatchObject({ pattern: "Occasional", state: "ok", reason: "2 gifts, no fixed rhythm." });
  });

  it("no gifts at all", () => {
    expect(run([])).toMatchObject({ pattern: "No gifts", state: "quiet", gift_count: 0, lifetime: 0, loyalty: 0, first_gift: null, reason: "No gifts on record." });
  });

  it("only declined payments", () => {
    const s = run([gift("2026-09-01", 50, "GMD", "declined"), gift("2026-10-01", 50, "GMD", "declined")]);
    expect(s).toMatchObject({ pattern: "No gifts", failed: 2, reason: "2 declined payments, no successful gift." });
  });

  it("ignores zero-amount gifts and declines that happened before the last good gift", () => {
    const s = run([gift("2026-01-01", 50, "GMD", "declined"), gift("2026-02-01", 50, "GMD"), gift("2026-03-01", 0, "GMD")]);
    expect(s.gift_count).toBe(1);
    expect(s.failed).toBe(0);
  });

  it("an annual gift already made this season is ok and expected next year", () => {
    const s = run([gift("2024-06-10", 500), gift("2025-06-10", 500), gift("2026-06-10", 500)]);
    expect(s).toMatchObject({ pattern: "Every June", state: "ok", at_risk: 0, expected: "2027-06-10" });
  });

  it("two consecutive years is enough for an annual pattern", () => {
    const s = run([gift("2024-10-01", 100), gift("2025-10-01", 100)]);
    expect(s.pattern).toBe("Every October");
    expect(s.state).toBe("late");
    expect(s.reason).toBe("Gave every October 2024 and 2025. None in Oct 2026.");
  });

  it("an annual pattern that stopped more than two years ago falls through", () => {
    const s = run([gift("2020-06-01", 100), gift("2021-06-01", 100), gift("2022-06-01", 100)]);
    expect(s.pattern).toBe("Occasional");
    expect(s.state).toBe("quiet");
  });

  it("monthly needs at least 5 recent gifts", () => {
    const s = run([gift("2026-07-01", 20), gift("2026-08-01", 20), gift("2026-09-01", 20), gift("2026-10-01", 20)]);
    expect(s.pattern).not.toBe("Monthly");
  });

  it("monthly with no gift in over 40 days and no declines is late with a 'Nothing since' reason", () => {
    const s = run(["2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15", "2026-07-15", "2026-08-15", "2026-09-15"].map((d) => gift(d, 30)));
    expect(s).toMatchObject({ pattern: "Monthly", state: "late", at_risk: 360, reason: "$30 a month for 7 months. Nothing since Sep 15, 2026." });
  });

  it("loyalty is years given over years since first gift, capped at 100", () => {
    expect(run([gift("2022-01-10", 10), gift("2026-01-10", 10)]).loyalty).toBe(40);
    expect(run([gift("2026-01-10", 10)]).loyalty).toBe(100);
  });
});

describe("fmtDate", () => {
  it("formats ISO dates", () => {
    expect(fmtDate("2026-11-19")).toBe("Nov 19, 2026");
    expect(fmtDate("2025-01-05")).toBe("Jan 5, 2025");
  });
});

describe("avatarFor", () => {
  it("returns nothing for organisations", () => expect(avatarFor("Alvarez Family Fund", 3, true)).toBe(""));
  it("uses women portraits for known female first names", () =>
    expect(avatarFor("Rosa Delgado", 1, false)).toBe(`https://randomuser.me/api/portraits/women/${(37 + 4 * 11) % 90}.jpg`));
  it("strips Dr. before reading the first name", () =>
    expect(avatarFor("Dr. Harold Weiss", 2, false)).toBe(`https://randomuser.me/api/portraits/men/${(74 + 6 * 11) % 90}.jpg`));
  it("reads a hyphenated first name and ignores case", () =>
    expect(avatarFor("JEAN-MARC Toussaint", 0, false)).toMatch(/portraits\/men\/\d+\.jpg$/));
  it("returns nothing for an unknown first name or an initial", () => {
    expect(avatarFor("Zebulon Pike", 1, false)).toBe("");
    expect(avatarFor("R. Delgado", 1, false)).toBe("");
  });
  it("keeps the portrait index under 90", () => {
    for (let id = 0; id < 200; id++) expect(+avatarFor("Mei Chen", id, false).match(/(\d+)\.jpg$/)![1]).toBeLessThan(90);
  });
});
