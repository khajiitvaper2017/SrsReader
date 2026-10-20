import { useCallback, useEffect, useRef } from "react";

export function useReviewClock(identity: string) {
  const clock = useRef({
    elapsed: 0,
    started: performance.now(),
    visible: !document.hidden,
  });
  useEffect(() => {
    clock.current = {
      elapsed: 0,
      started: performance.now(),
      visible: !document.hidden,
    };
    const change = () => {
      const now = performance.now(),
        current = clock.current;
      if (current.visible) current.elapsed += now - current.started;
      current.started = now;
      current.visible = !document.hidden;
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [identity]);
  return useCallback(
    () =>
      Math.round(
        clock.current.elapsed +
          (clock.current.visible
            ? performance.now() - clock.current.started
            : 0),
      ),
    [],
  );
}
