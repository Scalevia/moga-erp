// Runs server-check.sql on a fresh local database: it must pass and leave nothing behind.
import { readFileSync } from "node:fs";
import { freshDb } from "./harness.mjs";

const db = await freshDb();
let message = "";
try {
  await db.exec(readFileSync(new URL("./server-check.sql", import.meta.url), "utf8"));
} catch (e) {
  message = e.message;
}
const left = Number(
  (await db.query(`select (select count(*) from public.staff) + (select count(*) from auth.users)
    + (select count(*) from public.orders) + (select count(*) from public.cash_movements) as n`)).rows[0].n,
);
console.log(message || "no result");
console.log(left === 0 ? "nothing left behind" : `LEFT BEHIND: ${left} rows`);
process.exit(/^RESULT: \d+ passed, 0 failed/.test(message) && left === 0 ? 0 : 1);
