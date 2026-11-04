import { test, expect, rpc, records, seedLegacy } from "./extension";
import type { Card } from "../src/cards/model";
import type { Review } from "../src/srs/history";

async function prepare(page: import("@playwright/test").Page, url: string) {
  const source = await seedLegacy(page);
  await page.goto(`${url}/app.html#settings/review`);
  await expect(
    page.getByRole("combobox", { name: "FSRS version", exact: true }),
  ).toHaveValue("FSRS-7 (latest)");
  return source;
}

test("upgrades old storage and migrates memory without altering dates or history", async ({
  extension: { page, url },
}) => {
  const source = await prepare(page, url);
  const history = await records(page, "reviews");
  expect(history).toEqual(
    source.reviews.toSorted((a, b) => a.id.localeCompare(b.id)),
  );
  const preview = await rpc(page, {
    action: "previewFsrsMigration",
    version: "7",
  });
  expect(preview).toEqual({ eligible: 5, skipped: 3 });
  let result;
  do {
    result = await rpc(page, { action: "rescheduleModel" });
  } while (result.cursor);
  expect(result.skipped).toBe(3);
  const cards = await records<Card>(page, "cards");
  for (const card of cards) {
    const before = source.cards.find((old) => old.id === card.id)!;
    expect(card.schedule!.dueAt).toBe(before.schedule.due);
    expect(card.schedule!.lastReviewAt).toBe(before.schedule.last_review);
    expect(card.schedule!.reps).toBe(before.schedule.reps);
    expect(card.schedule!.lapses).toBe(before.schedule.lapses);
    expect(card.schedule!.learningStep).toBe(before.schedule.learning_steps);
    expect(card.schedule!.state).toBe(before.schedule.state);
    expect(card.suspended).toBe(before.suspended);
    expect(card.schedule!.fsrs.version).toBe(
      ["incomplete", "broken", "empty"].includes(card.id) ? "6" : "7",
    );
    if (
      !["incomplete", "broken", "empty"].includes(card.id) &&
      card.schedule!.state !== 0
    )
      expect(card.schedule!.stabilityFast).toBeGreaterThan(0);
  }
  expect(await records(page, "reviews")).toEqual(history);
});

test("previews and changes all supported versions through settings", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  for (const version of ["6", "7"]) {
    const history = await records(page, "reviews");
    const before = await records<Card>(page, "cards");
    await page
      .getByRole("combobox", { name: "FSRS version", exact: true })
      .click();
    await page
      .getByRole("option", {
        name: version === "7" ? "FSRS-7 (latest)" : `FSRS-${version}`,
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Cards to update:");
    expect(await records(page, "reviews")).toEqual(history);
    expect(await records(page, "cards")).toEqual(before);
    await page
      .getByRole("button", { name: "Change version", exact: true })
      .click();
    await expect
      .poll(async () => (await rpc(page, { action: "settings" })).fsrsVersion)
      .toBe(version);
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(
      page.getByText("FSRS is ready. Existing review dates are unchanged.", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await records(page, "reviews")).toEqual(history);
    for (const card of await records<Card>(page, "cards")) {
      expect(card.schedule!.dueAt).toBe(
        before.find((old) => old.id === card.id)!.schedule!.dueAt,
      );
    }
  }
});

test("uses actual review times and restores cards with the returned v6 review log", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  await rpc(page, { action: "rescheduleModel" });
  const before = (await records<Card>(page, "cards")).find(
    (card) => card.id === "review",
  )!;
  const now = Date.now();
  const due = await rpc(page, { action: "preview", id: before.id });
  expect(due).toHaveLength(4);
  const settings = await rpc(page, { action: "settings" });
  await rpc(page, {
    action: "setSettings",
    value: { ...settings, intervalFuzz: true },
  });
  const fuzzed = await rpc(page, { action: "preview", id: before.id });
  expect(
    fuzzed.some((time, index) => Math.abs(time - due[index]!) > 60000),
  ).toBe(true);
  const result = await rpc(page, {
    action: "grade",
    id: before.id,
    rating: 3,
    source: "review",
    version: before.srsVersion,
    time: now,
  });
  const review = (await records<Review>(page, "reviews")).find(
    (review) => review.id === result.reviewId,
  )!;
  expect(review.fsrsLog!.lastReviewAt).toBe(before.schedule!.lastReviewAt);
  expect(review.fsrsLog!.dueAt).toBe(before.schedule!.dueAt);
  expect(review.fsrsLog!.reviewTime).toBe(now);
  expect(
    new Set([
      review.fsrsLog!.lastReviewAt,
      review.fsrsLog!.dueAt,
      review.fsrsLog!.reviewTime,
    ]).size,
  ).toBe(3);
  expect(result.word.card!.fsrs.version).toBe("7");
  expect(result.word.card!.stabilityFast).toBeGreaterThan(0);
  await rpc(page, { action: "undo", id: result.reviewId });
  const restored = (await records<Card>(page, "cards")).find(
    (card) => card.id === before.id,
  )!;
  expect(restored.schedule).toEqual(before.schedule);
});

test("keeps fractional same-day answers and separate learning steps", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  await rpc(page, { action: "rescheduleModel" });
  const settings = await rpc(page, { action: "settings" });
  await rpc(page, {
    action: "setSettings",
    value: {
      ...settings,
      learningSteps: [],
      relearningSteps: [],
      intervalFuzz: true,
    },
  });
  let card = (await records<Card>(page, "cards")).find(
    (card) => card.id === "new",
  )!;
  const now = Date.now();
  let first = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 1,
    source: "review",
    version: card.srsVersion,
    time: now,
  });
  await rpc(page, { action: "undo", id: first.reviewId });
  const reset = (await records<Card>(page, "cards")).find(
    (entry) => entry.id === card.id,
  )!;
  expect(reset.schedule).toEqual(card.schedule);
  first = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 1,
    source: "review",
    version: reset.srsVersion,
    time: now,
  });
  expect(first.word.card!.scheduledDays).toBeGreaterThan(0);
  expect(first.word.card!.scheduledDays).toBeLessThan(1);
  expect(first.word.card!.dueAt).toBeGreaterThan(now + 1000);
  card = (await records<Card>(page, "cards")).find(
    (card) => card.id === "new",
  )!;
  const earlyTime = now + 1000;
  expect(earlyTime).toBeLessThan(card.schedule!.dueAt);
  const second = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 3,
    source: "review",
    version: card.srsVersion,
    time: earlyTime,
  });
  const review = (await records<Review>(page, "reviews")).find(
    (review) => review.id === second.reviewId,
  )!;
  expect(review.fsrsLog!.lastReviewAt).toBe(now);
  expect(review.fsrsLog!.dueAt).toBe(card.schedule!.dueAt);
  expect(review.fsrsLog!.reviewTime).toBe(earlyTime);
  expect(second.word.card!.stabilityFast).not.toBe(
    first.word.card!.stabilityFast,
  );
  await rpc(page, { action: "undo", id: second.reviewId });
  expect(
    (await records<Card>(page, "cards")).find((entry) => entry.id === card.id)!
      .schedule,
  ).toEqual(card.schedule);

  await rpc(page, {
    action: "setSettings",
    value: {
      ...settings,
      learningSteps: ["1m", "10m"],
      relearningSteps: ["1m", "10m"],
    },
  });
  card = (await records<Card>(page, "cards")).find(
    (entry) => entry.id === "learning",
  )!;
  const again = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 1,
    source: "review",
    version: card.srsVersion,
    time: now,
  });
  expect(again.word.card!.state).toBe(1);
  expect(again.word.card!.dueAt - now).toBe(60000);
  card = (await records<Card>(page, "cards")).find(
    (entry) => entry.id === card.id,
  )!;
  const good = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 3,
    source: "review",
    version: card.srsVersion,
    time: now + 60000,
  });
  expect(good.word.card!.state).toBe(1);
  expect(good.word.card!.learningStep).toBe(1);
  expect(good.word.card!.dueAt - (now + 60000)).toBe(600000);
});

test("keeps incomplete-history cards reviewable with their matching FSRS-6 configuration", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  await rpc(page, { action: "rescheduleModel" });
  const card = (await records<Card>(page, "cards")).find(
    (card) => card.id === "incomplete",
  )!;
  const result = await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 3,
    source: "review",
    version: card.srsVersion,
  });
  expect(result.word.card!.fsrs).toEqual(card.schedule!.fsrs);
  expect(result.word.card!.fsrs.version).toBe("6");
  expect(Number.isFinite(result.word.card!.dueAt)).toBe(true);
  const review = (await records<Review>(page, "reviews")).find(
    (review) => review.id === result.reviewId,
  )!;
  expect(review.scheduler).toBe("ts-fsrs@6.0.0/FSRS-6");
  expect(review.fsrsLog!.cardId).toBe(card.id);
});

test("restores versioned memory and review logs from a learning backup", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  await rpc(page, { action: "rescheduleModel" });
  const before = await records<Card>(page, "cards");
  await page.goto(`${url}/app.html#settings/backups`);
  await expect(
    page.getByRole("heading", { name: "Words & progress", exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP", exact: true }).click();
  const backup = await downloaded;
  const path = await backup.path();
  const card = before.find((card) => card.id === "review")!;
  await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 1,
    source: "review",
    version: card.srsVersion,
  });
  expect(
    (await records<Card>(page, "cards")).find((entry) => entry.id === card.id)!
      .schedule,
  ).not.toEqual(card.schedule);
  page.once("dialog", (dialog) => dialog.accept());
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import ZIP", exact: true }).click();
  await (await chooser).setFiles(path!);
  await expect(
    page.getByText("Learning data imported.", { exact: true }),
  ).toBeVisible();
  expect(await records<Card>(page, "cards")).toEqual(before);
  await rpc(page, { action: "rescheduleModel" });
  const previews = await rpc(page, { action: "preview", id: card.id });
  expect(previews).toHaveLength(4);
  expect(previews.every(Number.isFinite)).toBe(true);
});

test("rebuilds RWKV in chronological order without changing saved answers", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  const history = await records<Review>(page, "reviews");
  let status;
  do {
    status = await rpc(page, { action: "prepareRwkv" });
  } while (!status.ready);
  expect(status.processed).toBe(history.length);
  expect(status.total).toBe(history.length);
  expect(await records(page, "reviews")).toEqual(history);
  await rpc(page, { action: "rescheduleModel" });
  const card = (await records<Card>(page, "cards")).find(
    (card) => card.id === "empty",
  )!;
  await rpc(page, {
    action: "grade",
    id: card.id,
    rating: 3,
    source: "review",
    version: card.srsVersion,
  });
  expect((await rpc(page, { action: "rwkvStatus" })).ready).toBe(false);
  do {
    status = await rpc(page, { action: "prepareRwkv" });
  } while (!status.ready);
  expect(status.total).toBe(history.length + 1);
  expect(status.processed).toBe(status.total);
  for (const rwkvMode of ["curve", "instant"] as const) {
    await rpc(page, {
      action: "activateAlgorithm",
      algorithm: "rwkv",
      rwkvMode,
    });
    let rescheduled;
    do {
      rescheduled = await rpc(page, { action: "rescheduleModel" });
    } while (rescheduled.cursor);
    const before = (await records<Card>(page, "cards")).find(
      (entry) => entry.id === "review",
    )!;
    const due = await rpc(page, {
      action: "preview",
      id: before.id,
      durationMs: 1200,
    });
    expect(due).toHaveLength(4);
    expect(due.every(Number.isFinite)).toBe(true);
    const result = await rpc(page, {
      action: "grade",
      id: before.id,
      rating: 3,
      source: "review",
      version: before.srsVersion,
      durationMs: 1200,
    });
    expect(Math.abs(result.word.card!.dueAt - due[2]!)).toBeLessThan(5000);
    const review = (await records<Review>(page, "reviews")).find(
      (entry) => entry.id === result.reviewId,
    )!;
    expect(review.scheduler).toBe("rwkv-sm56-w8-s8");
    expect(review.fsrsLog).not.toBeNull();
    expect((await rpc(page, { action: "rwkvStatus" })).ready).toBe(true);
    await rpc(page, { action: "undo", id: result.reviewId });
    expect(
      (await records<Card>(page, "cards")).find(
        (entry) => entry.id === before.id,
      )!.schedule,
    ).toEqual(before.schedule);
    expect((await rpc(page, { action: "rwkvStatus" })).ready).toBe(true);
  }
});

test("preserves recorded order when replaying answers with equal timestamps", async ({
  extension: { page, url },
}) => {
  await prepare(page, url);
  await rpc(page, { action: "rescheduleModel" });
  let card = (await records<Card>(page, "cards")).find(
    (card) => card.id === "new",
  )!;
  const time = Date.now();
  for (const rating of [1, 3] as const) {
    await rpc(page, {
      action: "grade",
      id: card.id,
      rating,
      source: "review",
      version: card.srsVersion,
      time,
    });
    card = (await records<Card>(page, "cards")).find(
      (entry) => entry.id === card.id,
    )!;
  }
  const history = await records<Review>(page, "reviews");
  await rpc(page, {
    action: "activateAlgorithm",
    algorithm: "fsrs",
    fsrsVersion: "6",
  });
  await rpc(page, { action: "rescheduleModel" });
  const migrated = (await records<Card>(page, "cards")).find(
    (entry) => entry.id === card.id,
  )!;
  expect(migrated.schedule!.fsrs.version).toBe("6");
  expect(migrated.schedule!.dueAt).toBe(card.schedule!.dueAt);
  expect(migrated.schedule!.lastReviewAt).toBe(time);
  expect(migrated.schedule!.reps).toBe(2);
  expect(await records(page, "reviews")).toEqual(history);
});
