import MTProto from "https://deno.land/x/mtproto@v0.3.0.1/mod.ts";
import factory from "https://deno.land/x/mtproto@v0.3.0.1/transport/connection/deno-tcp.ts";
import Abridged from "https://deno.land/x/mtproto@v0.3.0.1/transport/codec/abridged.ts";
import JsonDB from "https://deno.land/x/mtproto@v0.3.0.1/storage/jsondb.ts";

const storage = new JsonDB("session.json");
const proto = new MTProto({
  api_id: 4,
  api_hash: "014b35b6184100b085b0d0572f9b5103",
  environment: {
    device_model: "tgmon",
    app_version: "0.0.0",
    system_version: "unknown",
  },
  transport_factory: factory(() => new Abridged()),
  initdc: {
    id: 5,
    ip: "91.108.56.130",
    test: false,
    port: 80,
  },
  storage,
});
await proto.init();
export default proto;
