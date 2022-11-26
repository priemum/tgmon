import global from "https://deno.land/x/mtproto@v0.3.0.1/gen/api.d.ts";
import conn from "./connection.ts";

const rpc = await conn.rpc();

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

try {
  const chats = await getChatList();
  const filterd = chats.flatMap((x) => {
    if (x._ === "channel" || x._ === "chat") {
      return {
        id: x.id,
        title: x.title,
        username: x._ === "channel" ? x.username : undefined,
      };
    }
    return [];
  });
  console.table(filterd);
} catch (e) {
  console.log(e);
} finally {
  await conn.shutdown();
}
