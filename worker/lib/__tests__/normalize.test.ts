import { describe, expect, it } from "vitest";
import { isOrg, jaroWinkler, mapRows, normEmail, normName, normPhone, normStreet, parseCsv, sourceMeta } from "../normalize";
import { checks, gala, gmd, tickets } from "./fixtures";

describe("parseCsv", () => {
  it("keeps commas inside quoted fields", () => {
    expect(parseCsv('a,"b, c",d\n')).toEqual([["a", "b, c", "d"]]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('"he said ""hi""",x')).toEqual([['he said "hi"', "x"]]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("handles bare CR line endings", () => {
    expect(parseCsv("a,b\rc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("does not add an empty row for a trailing newline", () => {
    expect(parseCsv("a,b\nc,d\n")).toHaveLength(2);
    expect(parseCsv("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("skips blank lines and rows of only empty cells", () => {
    expect(parseCsv("a,b\n\n\r\n , \nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("keeps newlines inside quoted fields", () => {
    expect(parseCsv('a,"line1\nline2"\nb,c')).toEqual([["a", "line1\nline2"], ["b", "c"]]);
  });

  it("keeps a trailing empty cell", () => {
    expect(parseCsv("a,b,\n")).toEqual([["a", "b", ""]]);
    expect(parseCsv("a,")).toEqual([["a", ""]]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});

describe("mapRows on the real sample exports", () => {
  it("returns the right row counts", () => {
    expect(gmd.rows).toHaveLength(166);
    expect(tickets.rows).toHaveLength(43);
    expect(gala.rows).toHaveLength(47);
    expect(checks.rows).toHaveLength(37);
  });

  it("gmd: joins first + last name and reads every field", () => {
    const rosa = gmd.rows.find((r) => r.ref === "GMD-10023")!;
    expect(rosa).toEqual({
      name: "Rosa M. Delgado", email: "rosa.delgado@gmail.com", phone: "(305) 555-0142", street: "1420 SW 8th St", zip: "33135",
      date: "2021-11-18", amount: 100, status: "ok", designation: "Mentoring", ref: "GMD-10023",
    });
  });

  it("gmd: Declined status maps to declined (Theodore's three failed cards)", () => {
    const declined = gmd.rows.filter((r) => r.status === "declined");
    expect(declined).toHaveLength(3);
    expect(declined.every((r) => r.name === "Theodore Baptiste")).toBe(true);
    expect(declined.map((r) => r.date).sort()).toEqual(["2026-08-05", "2026-09-05", "2026-10-05"]);
  });

  it("gmd: every date is ISO and every amount is positive", () => {
    for (const r of gmd.rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.amount).toBeGreaterThan(0);
    }
  });

  it("tickets: parses $1,500.00 totals, buyer name and event", () => {
    const josh = tickets.rows.find((r) => r.name === "Josh Carter")!;
    expect(josh.amount).toBe(1500);
    expect(josh.email).toBe("jcarter@cartergroup.com");
    expect(josh.date).toBe("2025-03-14");
    expect(josh.designation).toBe("Spring Social 2025");
    expect(josh.ref).toMatch(/^T\d{6}$/);
    expect(josh.status).toBe("ok");
  });

  it("gala: Auction Year becomes YYYY-03-14 and Winning Bid is the amount", () => {
    const alv = gala.rows.filter((r) => /alvarez/i.test(r.name));
    expect(alv.map((r) => [r.name, r.date, r.amount])).toEqual([
      ["Alvarez Family Fund", "2024-03-14", 1500],
      ["The Alvarez Fam.", "2025-03-14", 1500],
    ]);
    expect(alv[0].designation).toBe("Table for ten");
    for (const r of gala.rows) expect(r.date).toMatch(/^20(24|25|26)-03-14$/);
  });

  it("checks: converts MM/DD/YYYY, parses 1,000.00, pulls ZIP out of the address and trims the street", () => {
    const marg = checks.rows.find((r) => r.name === "Marguerite Désir" && r.date.startsWith("2022"))!;
    expect(marg.date).toBe("2022-12-08");
    expect(marg.amount).toBe(1000);
    expect(marg.street).toBe("742 NE 125th St");
    expect(marg.zip).toBe("33161");
    expect(marg.designation).toBe("Joyeux Noel");
  });

  it("checks: every street has city/state/ZIP removed and every ZIP is 5 digits", () => {
    for (const r of checks.rows) {
      expect(r.street).not.toMatch(/miami|\bfl\b|\d{5}$/i);
      expect(r.zip).toMatch(/^\d{5}$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("checks: keeps suite text in the street (normStreet strips it later)", () => {
    const llc = checks.rows.find((r) => r.name === "Watanabe Consulting LLC")!;
    expect(llc.street).toBe("1200 Brickell Ave Ste 900");
    expect(llc.zip).toBe("33131");
    expect(llc.amount).toBe(300);
  });

  it("maps a minimal layout by hand: Full Name, ZIP+4, single-digit M/D, Failed status", () => {
    const out = mapRows([
      ["Full Name", "Gift", "Received", "Status", "Street Address"],
      ["Ana Ruiz", "$1,234.50", "3/7/2025", "Payment failed", "12 Main St, Hialeah, FL 33010-1234"],
      ["", "10", "1/1/2025", "", ""],
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Ana Ruiz", amount: 1234.5, date: "2025-03-07", status: "declined", street: "12 Main St", zip: "33010" });
  });

  it("treats an unparseable amount as 0 and an explicit ZIP column wins", () => {
    const out = mapRows([["Name", "Amount", "Date", "Address", "Zip"], ["X Y", "n/a", "2025-01-02T10:00:00Z", "1 A St, Miami FL 33101", "33999"]]);
    expect(out[0]).toMatchObject({ amount: 0, date: "2025-01-02", zip: "33999", street: "1 A St" });
  });
});

describe("sourceMeta", () => {
  it("recognises each sample by filename", () => {
    expect(sourceMeta("gmd-export.csv", gmd.header).code).toBe("GMD");
    expect(sourceMeta("tickets.csv", tickets.header).code).toBe("TIX");
    expect(sourceMeta("gala-auction.csv", gala.header).code).toBe("GALA");
    expect(sourceMeta("check-log.csv", checks.header).code).toBe("CHK");
  });

  it("recognises each sample by header when the filename is generic", () => {
    expect(sourceMeta("export1.csv", gmd.header)).toEqual({ label: "GiveMiamiDay.org", code: "GMD" });
    expect(sourceMeta("export2.csv", tickets.header)).toEqual({ label: "Event tickets", code: "TIX" });
    expect(sourceMeta("export3.csv", gala.header)).toEqual({ label: "Gala auction", code: "GALA" });
    expect(sourceMeta("export4.csv", checks.header)).toEqual({ label: "Paper checks", code: "CHK" });
  });

  it("falls back to the filename without extension", () => {
    expect(sourceMeta("Volunteers 2025.xlsx.csv", ["Name", "Amount"])).toEqual({ label: "Volunteers 2025.xlsx", code: "CSV" });
  });
});

describe("normalizers", () => {
  it("normStreet: '1420 SW 8th St' equals '1420 SW 8 Street'", () => {
    expect(normStreet("1420 SW 8th St")).toBe("1420 sw 8 st");
    expect(normStreet("1420 SW 8 Street")).toBe(normStreet("1420 SW 8th St"));
  });

  it("normStreet: '742 NE 125th St' equals '742 NE 125 St'", () => {
    expect(normStreet("742 NE 125th St")).toBe(normStreet("742 NE 125 St"));
  });

  it("normStreet: strips Ste/Suite/Apt/Unit and everything after", () => {
    expect(normStreet("1200 Brickell Ave Ste 900")).toBe("1200 brickell ave");
    expect(normStreet("1200 Brickell Avenue, Suite 900")).toBe("1200 brickell ave");
    expect(normStreet("10 Ocean Dr Apt 4B")).toBe("10 ocean dr");
    expect(normStreet("10 Ocean Drive Unit 2")).toBe("10 ocean dr");
  });

  it("normStreet: abbreviates boulevard and drops punctuation", () => {
    expect(normStreet("1 Biscayne Boulevard.")).toBe("1 biscayne blvd");
  });

  it("normName: drops titles and punctuation, folds accents", () => {
    expect(normName("Dr. Harold Weiss")).toBe("harold weiss");
    expect(normName("Marguerite Désir")).toBe("marguerite desir");
    expect(normName("M. Desir")).toBe("m desir");
    expect(normName("  Rosa   M. Delgado ")).toBe("rosa m delgado");
    expect(normName("The Alvarez Fam.")).toBe("alvarez fam");
    expect(normName("Mrs Ana O'Neil")).toBe("ana o neil");
  });

  it("normName: keeps & and hyphens", () => {
    expect(normName("Lucia & Tomas Herrera")).toBe("lucia & tomas herrera");
    expect(normName("J. Pierre-Louis")).toBe("j pierre-louis");
  });

  it("normEmail: trims and lowercases", () => {
    expect(normEmail("  Rosa.Delgado@Gmail.COM ")).toBe("rosa.delgado@gmail.com");
  });

  it("normPhone: strips punctuation and a leading +1", () => {
    expect(normPhone("(305) 555-0142")).toBe("3055550142");
    expect(normPhone("+1 (305) 555-0142")).toBe("3055550142");
    expect(normPhone("1-305-555-0142")).toBe("3055550142");
    expect(normPhone("305.555.0142")).toBe("3055550142");
  });

  it("normPhone: returns empty for anything that is not 10 digits", () => {
    expect(normPhone("")).toBe("");
    expect(normPhone("555-0142")).toBe("");
    expect(normPhone("+44 20 7946 0958")).toBe("");
  });
});

describe("jaroWinkler", () => {
  it("is 1 for identical strings", () => {
    expect(jaroWinkler("rosa delgado", "rosa delgado")).toBe(1);
    expect(jaroWinkler("", "")).toBe(1);
  });

  it("scores close name variants high", () => {
    expect(jaroWinkler("joshua carter", "josh carter")).toBeGreaterThan(0.85);
  });

  it("scores unrelated names low", () => {
    expect(jaroWinkler("rosa delgado", "harold weiss")).toBeLessThan(0.6);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
    expect(jaroWinkler("abc", "")).toBe(0);
  });

  it("is symmetric and bounded", () => {
    const a = "jean pierre-louis", b = "j pierre-louis";
    expect(jaroWinkler(a, b)).toBeCloseTo(jaroWinkler(b, a), 10);
    expect(jaroWinkler(a, b)).toBeLessThanOrEqual(1);
  });

  it("matches the textbook value for martha / marhta", () => {
    expect(jaroWinkler("martha", "marhta")).toBeCloseTo(0.9611, 3);
  });
});

describe("isOrg", () => {
  it.each(["Alvarez Family Fund", "The Alvarez Fam.", "Watanabe Consulting LLC", "Carter Group", "First Baptist Church", "Acme Inc", "Knight Foundation"])(
    "%s is an organisation", (n) => expect(isOrg(n)).toBe(true));
  it.each(["Rosa Delgado", "Lucia & Tomas Herrera", "Dr. Harold Weiss", "Mei Chen", "Funderburk Smith"])(
    "%s is a person", (n) => expect(isOrg(n)).toBe(false));
});
