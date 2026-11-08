// Loads the real sample exports (public/samples) and turns them into Gift arrays for signals().
import gmdCsv from "../../../public/samples/gmd-export.csv?raw";
import ticketsCsv from "../../../public/samples/tickets.csv?raw";
import galaCsv from "../../../public/samples/gala-auction.csv?raw";
import checksCsv from "../../../public/samples/check-log.csv?raw";
import { mapRows, parseCsv, sourceMeta, type Parsed } from "../normalize";
import type { Gift } from "../signals";

export const TODAY = "2026-11-08";
export const GMD_DATE = "2026-11-19";

export interface Source { file: string; header: string[]; code: string; rows: Parsed[] }

function load(file: string, text: string): Source {
  const raw = parseCsv(text);
  return { file, header: raw[0], code: sourceMeta(file, raw[0]).code, rows: mapRows(raw) };
}

export const gmd = load("gmd-export.csv", gmdCsv);
export const tickets = load("tickets.csv", ticketsCsv);
export const gala = load("gala-auction.csv", galaCsv);
export const checks = load("check-log.csv", checksCsv);

export const toGift = (code: string) => (p: Parsed): Gift => ({ date: p.date, amount: p.amount, status: p.status, code, designation: p.designation });

/** Gifts from one source whose donor name is in `names` (exact match). */
export function giftsFrom(src: Source, ...names: string[]): Gift[] {
  return src.rows.filter((r) => names.includes(r.name)).map(toGift(src.code));
}
