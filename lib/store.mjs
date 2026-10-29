import pg from "pg";
import { emptyState, migrateState } from "../public/domain.js";
import { passwordHash } from "./auth.mjs";
let pool, initialized;
export function configured() {
  return !!process.env.DATABASE_URL;
}
function getPool() {
  if (!pool)
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
    });
  return pool;
}
async function init() {
  if (!initialized)
    initialized = (async () => {
      const p = getPool();
      await p.query(
        `CREATE TABLE IF NOT EXISTS portal_state (id integer PRIMARY KEY CHECK(id=1), data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS portal_sessions (token text PRIMARY KEY, user_id text NOT NULL, expires timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS portal_challenges (token text PRIMARY KEY, data jsonb NOT NULL, expires timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS portal_throttle (key text PRIMARY KEY, attempts integer NOT NULL, expires timestamptz NOT NULL);`,
      );
      const s = emptyState();
      if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD)
        throw Error("Initial admin email and password must be configured");
      s.users.push({
        id: "initial-admin",
        name: "Administrator",
        username: process.env.ADMIN_USERNAME || "abuney",
        email: process.env.ADMIN_EMAIL,
        role: "Admin",
        team: "",
        companies: [],
        groupAccess: true,
        active: true,
        passwordHash: passwordHash(process.env.ADMIN_PASSWORD),
      });
      await p.query(
        "INSERT INTO portal_state(id,data) VALUES(1,$1) ON CONFLICT DO NOTHING",
        [s],
      );
    })();
  try {
    await initialized;
  } catch (e) {
    initialized = null;
    throw e;
  }
}
export async function transaction(fn) {
  await init();
  const c = await getPool().connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query(
      "SELECT data FROM portal_state WHERE id=1 FOR UPDATE",
    );
    const state = migrateState(rows[0].data);
    const result = await fn(state, c);
    await c.query("UPDATE portal_state SET data=$1 WHERE id=1", [state]);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function query(sql, args = []) {
  await init();
  return getPool().query(sql, args);
}
export async function throttle(key) {
  await init();
  const { rows } = await getPool().query(
    `INSERT INTO portal_throttle(key,attempts,expires) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN portal_throttle.expires<now() THEN 1 ELSE portal_throttle.attempts+1 END, expires=CASE WHEN portal_throttle.expires<now() THEN now()+interval '15 minutes' ELSE portal_throttle.expires END RETURNING attempts`,
    [key],
  );
  if (rows[0].attempts > 15)
    throw Error("Too many attempts. Try again in 15 minutes.");
}
