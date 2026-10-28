// Local Postgres (PGlite) with a stand-in for Supabase's auth schema and roles, running the repo's migrations.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIGRATIONS = fileURLToPath(new URL("../migrations", import.meta.url));

export async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin end $$;
  `);
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(`${MIGRATIONS}/${f}`, "utf8"));
    } catch (e) {
      throw new Error(`migration ${f}: ${e.message}${e.position ? ` (at ${e.position})` : ""}`);
    }
  }
  return db;
}

let pass = 0;
let fail = 0;
export const results = () => ({ pass, fail });
export function ok(name, v, extra = "") {
  v ? pass++ : fail++;
  console.log(`${v ? "PASS" : "FAIL"}  ${name}${!v && extra ? `  →  ${extra}` : ""}`);
}

export function makeApi(db) {
  const as = async (uid) => {
    await db.exec("reset role");
    if (uid === "anon") {
      await db.query("select set_config('request.jwt.claims', '', false)");
      await db.exec("set role anon");
    } else {
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
      await db.exec("set role authenticated");
    }
  };
  const root = async () => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  };
  // Call public.fn with named args: rpc("complete_sale", { p_items: [...] }) — like supabase.rpc().
  const rpc = async (fn, args = {}) => {
    const names = Object.keys(args);
    const values = names.map((k) => {
      const v = args[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    const sql = `select public.${fn}(${names.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`;
    const res = await db.query(sql, values);
    return res.rows[0].r;
  };
  const fails = async (fn, args, part) => {
    try {
      await rpc(fn, args);
      return { ok: false, msg: "no error" };
    } catch (e) {
      return { ok: part ? e.message.includes(part) : true, msg: e.message, code: e.code };
    }
  };
  const q = async (sql, params) => (await db.query(sql, params)).rows;
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  return { as, root, rpc, fails, q, one };
}
