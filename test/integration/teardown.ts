import { db } from "../../src/shared/database";

export default async function teardown() {
  await db.query("DROP TABLE IF EXISTS analytics_events CASCADE");
  await db.query("DROP TABLE IF EXISTS users CASCADE");
  await db.shutdown();
  console.log("Test database cleaned up");
}
