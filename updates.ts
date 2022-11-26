// deno-lint-ignore-file no-inner-declarations
import conn from "./connection.ts";
import { signal } from "https://deno.land/std@0.166.0/signal/mod.ts";
import { DB } from "https://deno.land/x/sqlite@v3.7.0/mod.ts";
import { rand_bigint } from "https://deno.land/x/mtproto@v0.3.0/common/utils.ts";
import global from "https://deno.land/x/mtproto@v0.3.0/gen/api.js";

const db = new DB("mon.db");
const admin = BigInt(
  db.query<[string]>("select value from settings where name = 'admin'")[0][0]
);
const listAllRules = db.prepareQuery<[number, number, string]>(
  "select rowid, id, keyword from rules order by id asc;"
);
const removeRuleById = db.prepareQuery("delete from rules where rowid = ?");
const insertRule = db.prepareQuery(
  "insert into rules (id, keyword) values (:id, :keyword)"
);
const queryRulesForId = db.prepareQuery<[string]>(
  "select keyword from rules where id = :id"
);
const insertChannelAccessHash = db.prepareQuery(
  "insert into channel_hashes (id, hash) values (:id, :hash) on conflict do update set hash = :hash"
);
const queryChannelAccessHash = db.prepareQuery<[string]>(
  "select hash from channel_hashes where id = :id"
);

function compileRule(str: string) {
  if (str.startsWith("/")) new RegExp(str.slice(1));
  return str;
}

try {
  async function getChatList() {
    const chat_list = [] as global.Chat[];
    while (true) {
      const newlist = await rpc.api.messages.getAllChats({
        except_ids: chat_list.map((x) => x.id),
      });
      chat_list.push(...newlist.chats);
      if (newlist._ === "messages.chats") {
        break;
      }
    }
    return chat_list;
  }
  async function getChannelAccessHash(id: bigint) {
    let ret = queryChannelAccessHash.first({ id });
    if (ret) return BigInt(ret[0]);
    const data = await getChatList();
    for (const chat of data) {
      if (chat._ === "channel" && chat.access_hash)
        insertChannelAccessHash.execute({
          id: chat.id,
          hash: chat.access_hash + "",
        });
    }
    ret = queryChannelAccessHash.first({ id });
    if (ret) return BigInt(ret[0]);
    throw new Error("cannot access " + id);
  }
  const rpc = await conn.rpc();
  const contacts = await rpc.api.contacts.getContacts({ hash: 0n });
  if (contacts._ === "contacts.contactsNotModified")
    throw new Error("invalid contacts");
  const adminchan = contacts.users.find((x) => x.id === admin);
  if (
    !adminchan ||
    adminchan._ !== "user" ||
    adminchan.access_hash === undefined
  )
    throw new Error("找不到管理员会话");
  console.log(
    `管理员：${
      adminchan.username || `${adminchan.first_name} ${adminchan.last_name}`
    }`
  );
  const adminpeer: global.InputPeer<"inputPeerUser"> = {
    _: "inputPeerUser",
    user_id: adminchan.id,
    access_hash: adminchan.access_hash,
  };
  async function sendTextMessageToAdmin(text: string) {
    await rpc.api.messages.sendMessage({
      peer: adminpeer,
      random_id: rand_bigint(8),
      message: text,
    });
  }
  await sendTextMessageToAdmin(`online: ${new Date().toLocaleString()}`);
  await rpc.api.updates.getState();
  rpc.on("updateNewMessage", async (e) => {
    try {
      if (e.message._ === "message") {
        if (e.message.peer_id._ === "peerUser") {
          if (e.message.peer_id.user_id === admin) {
            const command = e.message.message;
            console.log("admin command", command);
            await rpc.api.messages.readHistory({
              peer: adminpeer,
              max_id: e.message.id,
            });
            let matched;
            if (command === "quit") {
              await rpc.api.messages.sendReaction({
                peer: adminpeer,
                msg_id: e.message.id,
                reaction: [{ _: "reactionEmoji", emoticon: "😱" }],
              });
              Deno.kill(Deno.pid, "SIGINT");
            } else if (command === "list") {
              const rules = listAllRules
                .all()
                .map(([id, source, keyword]) => `${id}: ${source} (${keyword})`)
                .join("\n");
              await sendTextMessageToAdmin(rules || "no rules defined");
            } else if (
              (matched = command.match(
                /^add\s+(?<id>\d+)\s+(?<keyword>[\S\s]*?)\s*$/
              ))
            ) {
              insertRule.execute(matched.groups);
            } else if ((matched = command.match(/^remove\s+(?<id>\d+)\s*$/))) {
              removeRuleById.execute([matched.groups?.id]);
            } else {
              await rpc.api.messages.sendReaction({
                peer: adminpeer,
                msg_id: e.message.id,
                reaction: [{ _: "reactionEmoji", emoticon: "🤔" }],
              });
            }
          }
        } else {
          console.log(e);
        }
      }
    } catch (e) {
      await sendTextMessageToAdmin(e + "");
    }
  });
  rpc.on("updateNewChannelMessage", async (e) => {
    try {
      if (e.message._ === "message") {
        if (e.message.peer_id._ === "peerChannel") {
          const rules = queryRulesForId.all({
            id: e.message.peer_id.channel_id,
          });
          if (rules.length > 0) {
            for (const [rule] of rules) {
              let result = false;
              if (rule.startsWith("file:")) {
                if (
                  e.message.media?._ === "messageMediaDocument" &&
                  e.message.media.document?._ === "document"
                ) {
                  for (const attr of e.message.media.document.attributes) {
                    if (attr._ === "documentAttributeFilename") {
                      if (
                        attr.file_name.match(
                          compileRule(rule.slice("file:".length))
                        )
                      )
                        result = true;
                      break;
                    }
                  }
                }
              } else if (e.message.message.match(compileRule(rule)))
                result = true;
              if (result) {
                const access_hash = await getChannelAccessHash(
                  e.message.peer_id.channel_id
                );
                await rpc.api.messages.forwardMessages({
                  from_peer: {
                    _: "inputPeerChannel",
                    channel_id: e.message.peer_id.channel_id,
                    access_hash,
                  },
                  to_peer: adminpeer,
                  id: [e.message.id],
                  random_id: [rand_bigint(8)],
                });
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      await sendTextMessageToAdmin(e + "");
    }
  });
  const sig = signal("SIGINT");
  for await (const _ of sig) {
    break;
  }
  sig.dispose();
} catch (err) {
  console.error(err);
} finally {
  await conn.shutdown();
}
