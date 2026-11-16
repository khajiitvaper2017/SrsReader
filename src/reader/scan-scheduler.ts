export function createScanScheduler(run: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;

  function cancel() {
    clearTimeout(timer);
    if (idle !== undefined) cancelIdleCallback(idle);
    timer = undefined;
    idle = undefined;
  }

  function schedule(background: boolean) {
    if (!background && idle !== undefined) {
      cancelIdleCallback(idle);
      idle = undefined;
    }
    if (timer !== undefined || idle !== undefined) return;
    if (background)
      idle = requestIdleCallback(() => {
        idle = undefined;
        run();
      });
    else
      timer = setTimeout(() => {
        timer = undefined;
        run();
      }, 0);
  }

  return { schedule, cancel };
}
