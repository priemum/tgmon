import conn from "./connection.ts";

try {
  const rpc = await conn.rpc();
  await rpc.api.auth.logOut();
} finally {
  await conn.shutdown();
}
