import conn from "./connection.ts";
import { sendCode } from "https://deno.land/x/mtproto@v0.3.0.3/auth/user.ts";
import {
  colors,
  Input,
  Confirm,
  Secret,
  prompt,
} from "https://deno.land/x/cliffy@v0.25.4/mod.ts";

try {
  await (await conn.rpc()).api.account.getAccountTTL();
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
  }
} finally {
  await conn.shutdown();
}
