import type { ChangeMessage, ChangeScope } from "@/platform/messaging/events";
import { useEffect } from "react";
import { browser } from "wxt/browser";

export function useChanges(
  callback: (message: ChangeMessage) => void,
  scopes?: readonly ChangeScope[],
) {
  const filter = scopes?.join(",");
  useEffect(() => {
    const listener = (message: ChangeMessage) => {
      if (
        message.event === "changed" &&
        (!filter ||
          message.scope === "collection" ||
          filter.split(",").includes(message.scope))
      )
        callback(message);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }, [callback, filter]);
}
