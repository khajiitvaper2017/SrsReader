import { browser } from "wxt/browser";

export async function udpipePermission(request = false) {
  if (import.meta.env.BROWSER !== "firefox") return true;
  const permission: Parameters<typeof browser.permissions.request>[0] & {
    data_collection: string[];
  } = { data_collection: ["websiteContent"] };
  return request
    ? browser.permissions.request(permission)
    : browser.permissions.contains(permission);
}
