import { useEffect } from "react";
import { browser } from "wxt/browser";

export function useChanges(callback: () => void) {
  useEffect(() => {
    const listener = (message: { event?: string }) => {
      if (message.event === "changed") callback();
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [callback]);
}
