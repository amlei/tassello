import path from "node:path";
import { configuredExtensionIds } from "@tassello/shared";
import { nativeHostBinaryName, registerNativeMessagingHosts } from "../src/register";

const root = path.resolve(import.meta.dir, "..");
const files = await registerNativeMessagingHosts({
  binaryPath: path.join(root, "dist", nativeHostBinaryName()),
  extensionIds: configuredExtensionIds(process.env),
});

console.log(`[onda/native-host] registered ${files.length} host manifest(s)`);
