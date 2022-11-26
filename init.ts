import { DB } from "https://deno.land/x/sqlite@v3.7.0/mod.ts";
import {
  colors,
  Input,
  Confirm,
  Secret,
  Select,
  prompt,
} from "https://deno.land/x/cliffy@v0.25.4/mod.ts";
import conn from "./connection.ts";
import { sendCode } from "https://deno.land/x/mtproto@v0.3.0.1/auth/user.ts";

const db = new DB("mon.db");
db.execute("create table if not exists rules (id integer, keyword text);");
db.execute(
  "create table if not exists channel_hashes (id integer, hash integer);"
);
db.execute(
  "create table if not exists settings (name text primary key, value);"
);
const insertSetting = db.prepareQuery(
  "insert into settings(name, value) values(:name, :value) on conflict do update set value = :value"
);

try {
  const rpc = await conn.rpc();
  try {
    await rpc.api.account.getAccountTTL();
  } catch {
    const number = await Input.prompt("手机号码");
    try {
      await sendCode(
        conn,
        {
          async askCode() {
            return await Input.prompt("二步认证代码");
          },
          async askPassword() {
            return await Secret.prompt("密码");
          },
          async askSignUp() {
            if (!(await Confirm.prompt("是否需要注册账号"))) {
              throw new Error("Skipped");
            }
            return await prompt([
              {
                type: Input,
                name: "first_name",
                message: "First name",
              },
              {
                type: Input,
                name: "last_name",
                message: "Last name",
              },
            ]);
          },
        },
        number
      );
    } catch (err) {
      console.log(colors.red.bold("登录失败"));
      console.log(err);
      Deno.exit(1);
    }
  }
  const contacts = await rpc.api.contacts.getContacts({ hash: 0n });
  if (contacts._ === "contacts.contactsNotModified")
    throw new Error("invalid contacts");
  const admin = await Select.prompt({
    message: "请选择管理员账号",
    options: contacts.users.flatMap((user) =>
      user._ === "userEmpty"
        ? []
        : {
            value: user.id.toString(),
            name: user.username || `${user.first_name} ${user.last_name}`,
          }
    ),
    search: true,
    hint: "管理员账号可以发送指令控制",
  });
  insertSetting.execute({ name: "admin", value: admin });
  console.log(colors.green.bold("初始化完成"));
} finally {
  await conn.shutdown();
}
