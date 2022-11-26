import conn from "./connection.ts";

const rpc = await conn.rpc();

try {
  const contacts = await rpc.api.contacts.getContacts({ hash: 0n });
  if (contacts._ === "contacts.contactsNotModified")
    throw new Error("invalid contacts");
  const filtered = contacts.users.flatMap((x) =>
    x._ === "userEmpty" ? [] : { id: x.id, username: x.username }
  );
  console.table(filtered);
} catch (e) {
  console.log(e);
} finally {
  await conn.shutdown();
}
