/// <reference types="node" />
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const parent = "/sdcard/Download/Telegram/chrome-mv3";
const target = `${parent}/chrome-mv3`;

async function checksum(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

try {
  console.log("Waiting for an authorized ADB device; press Ctrl+C to cancel...");
  execFileSync("adb", ["wait-for-device"], { stdio: "inherit" });
  const serial = execFileSync("adb", ["get-serialno"], {
    encoding: "utf8",
  }).trim();
  const adb = (...args: string[]) =>
    execFileSync("adb", ["-s", serial, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  const current = JSON.parse(adb("shell", "cat", `${target}/manifest.json`));
  console.log(`Building for ${serial}`);
  execFileSync("pnpm", ["zip"], { cwd: root, stdio: "inherit" });
  const manifestPath = join(root, ".output/chrome-mv3/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (
    !manifest.key ||
    manifest.key !== current.key ||
    manifest.name !== current.name
  )
    throw new Error("The phone extension identity does not match this build.");
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const archive = join(
    root,
    ".output",
    `${pkg.name}-${pkg.version}-chrome.zip`,
  );
  const manifestHash = await checksum(manifestPath);
  const prefix = `${parent}/.srsreader-update.`;
  const work = adb("shell", "mktemp", "-d", `${prefix}XXXXXX`).trim();
  if (
    !work.startsWith(prefix) ||
    !/^[a-zA-Z0-9]+$/.test(work.slice(prefix.length))
  )
    throw new Error("ADB returned an unexpected staging directory.");
  const uploaded = `${work}/extension.zip`;
  const staged = `${work}/extension`;
  const backup = `${target}.backup-${Date.now()}`;
  try {
    process.stdout.write(adb("push", archive, uploaded));
    if (
      adb("shell", "sha256sum", uploaded).split(/\s+/)[0] !==
      (await checksum(archive))
    )
      throw new Error("The uploaded archive checksum does not match.");
    adb("shell", "mkdir", staged);
    adb("shell", "unzip", "-q", uploaded, "-d", staged);
    if (
      adb("shell", "sha256sum", `${staged}/manifest.json`).split(/\s+/)[0] !==
      manifestHash
    )
      throw new Error("The extracted manifest checksum does not match.");
    adb("shell", "mv", target, backup);
    let installed = false;
    try {
      adb("shell", "mv", staged, target);
      installed = true;
      if (
        adb("shell", "sha256sum", `${target}/manifest.json`).split(/\s+/)[0] !==
        manifestHash
      )
        throw new Error("The installed manifest checksum does not match.");
    } catch (error) {
      console.error(`Restoring the original extension from ${backup}`);
      if (installed) adb("shell", "mv", target, staged);
      adb("shell", "mv", backup, target);
      throw error;
    }
    console.log(`Updated ${manifest.name} ${manifest.version}: ${target}`);
    console.log(`Backup: ${backup}`);
    console.log("Reload the extension in the phone browser to activate it.");
  } finally {
    try {
      adb("shell", "rm", "-rf", work);
    } catch (error) {
      console.warn(`Could not remove temporary folder ${work}:`, error);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
