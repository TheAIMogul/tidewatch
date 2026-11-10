import { describe, expect, it } from "vitest";
import { ADMIN_COOKIE, isAdmin, needsAdmin, readCookie, sameSecret } from "../guard";

describe("readCookie", () => {
  it("finds a cookie among others", () => expect(readCookie("a=1; tw_admin=abc%20d; b=2", "tw_admin")).toBe("abc d"));
  it("returns null when missing or header empty", () => {
    expect(readCookie("a=1", "tw_admin")).toBeNull();
    expect(readCookie(undefined, "tw_admin")).toBeNull();
  });
  it("does not match a cookie whose name only starts the same", () => expect(readCookie("tw_admin2=x", "tw_admin")).toBeNull());
  it("survives a malformed value", () => expect(readCookie("tw_admin=%E0%A4%A", "tw_admin")).toBeNull());
});

describe("sameSecret", () => {
  it("matches equal strings", () => expect(sameSecret("k3y-value", "k3y-value")).toBe(true));
  it("rejects different, shorter, longer and empty", () => {
    expect(sameSecret("k3y-valuf", "k3y-value")).toBe(false);
    expect(sameSecret("k3y", "k3y-value")).toBe(false);
    expect(sameSecret("k3y-value-plus", "k3y-value")).toBe(false);
    expect(sameSecret("", "k3y-value")).toBe(false);
  });
  it("fails closed when no secret is configured", () => expect(sameSecret("anything", undefined)).toBe(false));
});

describe("isAdmin", () => {
  it("needs the right cookie", () => {
    expect(isAdmin("s3cret", `${ADMIN_COOKIE}=s3cret`)).toBe(true);
    expect(isAdmin("s3cret", `${ADMIN_COOKIE}=nope`)).toBe(false);
    expect(isAdmin("s3cret", undefined)).toBe(false);
    expect(isAdmin(undefined, `${ADMIN_COOKIE}=`)).toBe(false);
  });
});

describe("needsAdmin", () => {
  it("lets reads through", () => {
    expect(needsAdmin("GET", "/api/calls")).toBe(false);
    expect(needsAdmin("HEAD", "/api/state")).toBe(false);
  });
  it("guards every write except the unlock form", () => {
    for (const p of ["/api/import", "/api/reset", "/api/donors/1/called", "/api/donors/1/draft", "/api/candidates/3/merge"]) expect(needsAdmin("POST", p)).toBe(true);
    expect(needsAdmin("DELETE", "/api/donors/1")).toBe(true);
    expect(needsAdmin("POST", "/api/unlock")).toBe(false);
  });
});
