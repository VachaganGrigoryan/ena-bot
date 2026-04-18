import test from "node:test";
import assert from "node:assert/strict";

import { DeterministicAddressFormatter } from "../packages/ai/deterministic-address-formatter";

test("deterministic formatter keeps original addresses", async () => {
  const formatter = new DeterministicAddressFormatter();
  const result = await formatter.refine({
    regionName: "Երևան քաղաք",
    timeSlot: "10:00-12:00",
    addresses: ["Նոր Նորք 1, 2-րդ զանգված"],
  });

  assert.deepEqual(result, ["Նոր Նորք 1, 2-րդ զանգված"]);
});
