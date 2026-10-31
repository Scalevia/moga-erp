// The database side of staff sign-in: the owner's first account with the one-time code, tying staff to
// their sign-in, and salaries for the owner only.
import { freshDb, makeApi, ok, results } from "./harness.mjs";

const db = await freshDb();
const { as, root, rpc, fails, one } = makeApi(db);
const N = (x) => Number(x);
const U = {
  owner: "00000000-0000-0000-0000-0000000000b1",
  emp: "00000000-0000-0000-0000-0000000000b2",
};
const asService = async () => {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: "service_role" })]);
  await db.exec("set role service_role");
};
const expectFail = async (name, fn, args, part) => {
  const r = await fails(fn, args, part);
  ok(`${name} → «${part}»`, r.ok, r.msg);
};

await root();
await db.exec(`insert into auth.users (id) values ('${U.owner}'), ('${U.emp}')`);
await db.exec(`insert into private.owner_setup_codes (code_hash) values (private.code_hash('1234567890'))`);

// ---------------------------------------------------------------- before the owner exists
await as("anon");
ok("the sign-in page can ask whether the owner's account is needed", (await rpc("owner_setup_needed")) === true);
await expectFail("the anonymous key can't check codes", "owner_setup_code_ok", { p_code: "1234567890" }, "permission denied");
await expectFail("…or create the owner", "setup_owner", { p_code: "1234567890", p_auth_user_id: U.owner, p_name: "x", p_username: "x1" }, "permission denied");
await as(U.owner);
await expectFail("signed-in users can't create the owner either", "setup_owner", { p_code: "1234567890", p_auth_user_id: U.owner, p_name: "x", p_username: "x1" }, "permission denied");

await asService();
ok("wrong code", (await rpc("owner_setup_code_ok", { p_code: "1111111111" })) === false);
ok("right code, written with a dash", (await rpc("owner_setup_code_ok", { p_code: "12345-67890" })) === true);
await expectFail("setup with a wrong code", "setup_owner", { p_code: "999", p_auth_user_id: U.owner, p_name: "المالك", p_username: "owner" }, "كود التفعيل غلط");
await expectFail("bad username", "setup_owner", { p_code: "1234567890", p_auth_user_id: U.owner, p_name: "المالك", p_username: "a b" }, "اسم المستخدم");
ok("a failed setup keeps the code", (await rpc("owner_setup_code_ok", { p_code: "1234567890" })) === true);
const ownerId = await rpc("setup_owner", { p_code: "1234567890", p_auth_user_id: U.owner, p_name: " المالك ", p_username: "Owner" });
await root();
const owner = await one(`select name, role, username, auth_user_id from public.staff where id = $1`, [ownerId]);
ok("the owner's account: admin, linked to their sign-in, username in lower case", owner.role === "admin" && owner.auth_user_id === U.owner && owner.username === "owner" && owner.name === "المالك");
ok("the code is marked used", (await one(`select used_at from private.owner_setup_codes`)).used_at !== null);
await asService();
await expectFail("no second owner setup", "setup_owner", { p_code: "1234567890", p_auth_user_id: U.emp, p_name: "تاني", p_username: "other" }, "اتعمل قبل كده");
ok("…and the code check says no", (await rpc("owner_setup_code_ok", { p_code: "1234567890" })) === false);
await as("anon");
ok("the sign-in page no longer offers it", (await rpc("owner_setup_needed")) === false);

// ---------------------------------------------------------------- staff and their sign-in
await as(U.owner);
const empId = await rpc("add_staff", { p_name: "موظف", p_role: "employee", p_username: "emp", p_salary: 4500 });
await expectFail("only the Edge Function links sign-ins", "link_staff_login", { p_staff_id: empId, p_auth_user_id: U.emp }, "permission denied");
await asService();
await rpc("link_staff_login", { p_staff_id: empId, p_auth_user_id: U.emp });
await expectFail("linking someone who isn't there", "link_staff_login", { p_staff_id: "00000000-0000-0000-0000-000000000000", p_auth_user_id: U.emp }, "مش موجود");
await as(U.emp);
ok("the employee is signed in as themselves", (await one(`select id from public.staff where auth_user_id = $1`, [U.emp])).id === empId);
await expectFail("employees can't see salaries", "staff_salaries", {}, "للمالك بس");
await as(U.owner);
const salaries = (await db.query(`select * from public.staff_salaries()`)).rows;
ok(`the owner sees everyone's salary (${salaries.map((s) => N(s.salary)).join(", ")})`, salaries.length === 2 && salaries.some((s) => s.staff_id === empId && N(s.salary) === 4500));

const { pass, fail } = results();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
