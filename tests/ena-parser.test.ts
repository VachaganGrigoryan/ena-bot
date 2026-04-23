import test from "node:test";
import assert from "node:assert/strict";

import { convertArmenianDateToUtc, parseEnaHtml } from "../packages/providers/ena/parser";

test("parseEnaHtml extracts date, region, time slot, and addresses", () => {
  const raw = {
    content: `
      <span id="ctl00_ContentPlaceHolder1_attenbody">
        <p>ապրիլի 18</p>
        <p>Երևան քաղաք՝</p>
        <p>10:00-12:00 Նոր Նորք 1, Նոր Նորք 2, Կոմիտաս 5</p>
      </span>
    `,
    fetchedAt: new Date("2026-04-18T10:00:00Z"),
    sourceUrl: "https://www.ena.am/Info.aspx?id=5",
  };

  const batch = parseEnaHtml(raw);

  assert.equal(batch.events.length, 1);
  assert.equal(batch.events[0]?.dateText, "ապրիլի 18");
  assert.equal(batch.events[0]?.regions[0]?.name, "Երևան քաղաք");
  assert.equal(batch.events[0]?.regions[0]?.locations[0]?.timeSlot, "10:00-12:00");
  assert.deepEqual(batch.events[0]?.regions[0]?.locations[0]?.addresses, [
    "Նոր Նորք 1",
    "Նոր Նորք 2",
    "Կոմիտաս 5",
  ]);
});

test("convertArmenianDateToUtc returns a UTC date for valid Armenian dates", () => {
  const converted = convertArmenianDateToUtc("ապրիլի 18");
  assert.ok(converted instanceof Date);
  assert.equal(converted?.getUTCMonth(), 3);
  assert.equal(converted?.getUTCDate(), 18);
});
