import { expect, test } from "bun:test";
import { sha256Text } from "./hash";

test("sha256Text returns the standard SHA-256 fingerprint", async () => {
  expect(await sha256Text("正文")).toBe(
    "d661c3d96d53ebc0ca8a55aae24b5df4a4d1bf28d37337b982fe8ebf54846eeb",
  );
});
