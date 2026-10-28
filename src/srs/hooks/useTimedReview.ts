import { playReviewAlert, prepareReviewAlert } from "@/audio/playback";
import type { Settings } from "@/settings/model";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react";

type Phase = "question" | "answer" | "fail" | null;
type Countdown = {
  phase: Phase;
  seconds: number;
  duration: number;
  paused: boolean;
  expired: boolean;
};

export function useTimedReview({
  settings,
  identity,
  newCard,
  revealed,
  ready,
  root,
  onReveal,
  onFail,
}: {
  settings: Settings["timedReview"];
  identity: string;
  newCard: boolean;
  revealed: boolean;
  ready: boolean;
  root: RefObject<HTMLElement | null>;
  onReveal: () => void;
  onFail: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [manualPaused, setManualPaused] = useState(false);
  const [countdown, setCountdown] = useState<Countdown>({
    phase: null,
    seconds: 0,
    duration: 0,
    paused: false,
    expired: false,
  });
  const clock = useRef({
    identity: "",
    revealed: false,
    phase: null as Phase,
    remaining: 0,
    duration: 0,
    last: 0,
    paused: true,
    expired: false,
  });
  const failOnReveal = useRef(false);

  function publish() {
    const current = clock.current;
    const next: Countdown = {
      phase: current.phase,
      seconds: Math.ceil(current.remaining / 1000),
      duration: current.duration,
      paused: current.paused,
      expired: current.expired,
    };
    setCountdown((previous) =>
      previous.phase === next.phase &&
      previous.seconds === next.seconds &&
      previous.duration === next.duration &&
      previous.paused === next.paused &&
      previous.expired === next.expired
        ? previous
        : next,
    );
  }

  useEffect(() => {
    const changedCard = clock.current.identity !== identity;
    if (changedCard) failOnReveal.current = false;
    let phase: Phase = revealed && !changedCard ? "answer" : "question";
    if (failOnReveal.current && revealed) {
      phase = "fail";
      failOnReveal.current = false;
    } else if (
      phase === "question" ? !settings.questionEnabled : !settings.answerEnabled
    ) {
      phase = null;
    }
    if (!enabled || !identity || (settings.skipNew && newCard)) phase = null;
    const duration =
      phase === "fail"
        ? 3
        : phase === "question"
          ? settings.questionSeconds
          : settings.answerSeconds;
    clock.current = {
      identity,
      revealed,
      phase,
      duration,
      remaining: duration * 1000,
      last: performance.now(),
      paused: true,
      expired: false,
    };
    publish();
  }, [
    identity,
    revealed,
    enabled,
    newCard,
    settings.skipNew,
    settings.questionEnabled,
    settings.questionSeconds,
    settings.answerEnabled,
    settings.answerSeconds,
  ]);

  const tick = useEffectEvent(() => {
    const current = clock.current;
    if (
      current.identity !== identity ||
      current.revealed !== revealed ||
      !current.phase
    )
      return;
    const now = performance.now();
    const paused =
      manualPaused ||
      !ready ||
      document.hidden ||
      !!document.querySelector(
        '[data-srs-reader-popup], [role="dialog"], [role="menu"]',
      ) ||
      !!root.current?.querySelector(
        '[data-review-timer-pause], input, textarea, [contenteditable="true"]',
      );
    if (!paused && !current.paused && !current.expired)
      current.remaining = Math.max(0, current.remaining - (now - current.last));
    current.last = now;
    current.paused = paused;
    if (!paused && current.remaining === 0 && !current.expired) {
      current.expired = true;
      if (settings.sound && current.phase !== "fail") playReviewAlert();
      if (current.phase === "question") {
        if (settings.questionAction !== "alert") {
          failOnReveal.current = settings.questionAction === "fail";
          onReveal();
        }
      } else if (
        current.phase === "answer" &&
        settings.answerAction === "softFail"
      ) {
        current.phase = "fail";
        current.duration = 3;
        current.remaining = 3000;
        current.expired = false;
      } else {
        onFail();
      }
    }
    publish();
  });
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !settings.sound) return;
    const prepare = () => void prepareReviewAlert().catch(console.warn);
    prepare();
    window.addEventListener("pointerdown", prepare, { once: true });
    window.addEventListener("keydown", prepare, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prepare);
      window.removeEventListener("keydown", prepare);
    };
  }, [enabled, settings.sound]);

  return {
    ...countdown,
    enabled,
    manualPaused,
    toggle: () => {
      setEnabled((value) => !value);
      setManualPaused(false);
    },
    togglePause: () => setManualPaused((value) => !value),
  };
}
