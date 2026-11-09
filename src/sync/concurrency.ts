export async function transferConcurrently<T>(
  items: Iterable<T>,
  transfer: (item: T) => Promise<void>,
) {
  const iterator = items[Symbol.iterator]();
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (!failed) {
        try {
          const next = iterator.next();
          if (next.done) return;
          await transfer(next.value);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }),
  );
  // Settle active transfers before the coordinator can publish or clean up.
  if (failed) throw failure;
}
