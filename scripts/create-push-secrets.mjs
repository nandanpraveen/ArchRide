import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const key = privateKey.export({ format: "jwk" });
const publicVapid = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, "base64url"), Buffer.from(pub.y, "base64url")]).toString("base64url");
await mkdir(".secrets", { recursive: true, mode: 0o700 });
// Never overwrite keys: existing subscriptions are bound to the original public key.
await writeFile(".secrets/browser-push.env", [
  `PUSH_VAPID_PUBLIC_KEY=${publicVapid}`, `PUSH_VAPID_PRIVATE_KEY=${key.d}`,
  "PUSH_VAPID_SUBJECT=https://nandanpraveen.github.io/archride/",
  `PUSH_JOB_TOKEN=${randomBytes(32).toString("base64url")}`, "",
].join("\n"), { mode: 0o600, flag: "wx" });
console.log("Created .secrets/browser-push.env. Keep these keys private and stable.");
