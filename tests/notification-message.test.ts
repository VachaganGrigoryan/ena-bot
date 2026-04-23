import test from "node:test";
import assert from "node:assert/strict";

import { formatOutagesForTelegram } from "../packages/application/telegram-messages";

test("formatOutagesForTelegram groups messages by region and date", () => {
  const messages = formatOutagesForTelegram([
    {
      eventId: 1,
      windowId: 10,
      title: "Test",
      dateText: "ապրիլի 18",
      eventDate: new Date("2026-04-18T12:00:00Z"),
      regionName: "Երևան քաղաք",
      timeSlot: "10:00-12:00",
      addresses: ["Նոր Նորք 1", "Նոր Նորք 2"],
    },
  ]);

  assert.equal(messages.length, 2);
  assert.match(messages[0] ?? "", /GLOBAL OUTAGES/);
  assert.match(messages[1] ?? "", /Երևան քաղաք/);
  assert.match(messages[1] ?? "", /Նոր Նորք 1/);
});

test("formatOutagesForTelegram escapes Telegram Markdown in dynamic text", () => {
  const messages = formatOutagesForTelegram([
    {
      eventId: 1,
      windowId: 10,
      title: "Test",
      dateText: "ապրիլի_18",
      eventDate: new Date("2026-04-18T12:00:00Z"),
      regionName: "Երևան *քաղաք*",
      timeSlot: "10:00-12:00",
      addresses: ["Նոր_Նորք `1`"],
    },
  ]);

  assert.match(messages[1] ?? "", /Երևան \\\*քաղաք\\\*/);
  assert.match(messages[1] ?? "", /ապրիլի\\_18/);
  assert.match(messages[1] ?? "", /Նոր\\_Նորք \\`1\\`/);
});
