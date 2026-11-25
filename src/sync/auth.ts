import { browser } from "wxt/browser";
import type { SyncAccount } from "./model";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const SCOPES = ["openid", "email", DRIVE_SCOPE];
const CREDENTIALS = "syncGoogleCredentials";
const BINDING = "syncGoogleBinding";
const PENDING = "syncGooglePending";
const CONSENT = [
  "authenticationInfo",
  "personallyIdentifyingInfo",
  "websiteContent",
];
const firefox = import.meta.env.BROWSER === "firefox";

type Credentials = {
  account: SyncAccount;
  token: string;
  expires: number;
  client: string;
};
type Pending = {
  state: string;
  redirect: string;
  expires: number;
  tab?: number;
};
type NativeIdentity = {
  getAuthToken(details: {
    interactive: boolean;
    scopes: string[];
    account?: { id: string };
    enableGranularPermissions: boolean;
  }): Promise<string | { token?: string; grantedScopes?: string[] }>;
  removeCachedAuthToken(details: { token: string }): Promise<void>;
  clearAllCachedAuthTokens(): Promise<void>;
};

export class GoogleAuthError extends Error {
  retryAfter = 0;
  constructor(
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(code);
    this.name = "GoogleAuthError";
  }
}

let initialized = false;
let generation = 0;
let authController = new AbortController();
let activeCancel: (() => void) | undefined;
let cancelOperation: (() => void) | undefined;
let connecting: Promise<SyncAccount> | undefined;
let renewing: Promise<string> | undefined;
let credentialWrites = Promise.resolve();
let startup: Promise<void> | undefined;

function configuration() {
  const client = (
    (firefox
      ? import.meta.env.WXT_GOOGLE_FIREFOX_CLIENT_ID
      : browser.runtime.getManifest().oauth2?.client_id) ?? ""
  ).trim();
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(client)) return null;
  if (!firefox) return { client, redirect: "" };
  // A Google Web OAuth client needs this exact HTTPS URI registered in its
  // console and an authorized/verified domain. Interception needs no server.
  // Google does not offer a secret-free Web-client code exchange: the tab flow
  // uses its documented token response, not an invented PKCE/refresh exchange.
  try {
    const redirect = new URL(import.meta.env.WXT_GOOGLE_REDIRECT_URI ?? "");
    if (
      redirect.protocol !== "https:" ||
      redirect.username ||
      redirect.password ||
      redirect.search ||
      redirect.hash ||
      redirect.port ||
      !redirect.hostname.includes(".")
    )
      return null;
    return { client, redirect: redirect.href };
  } catch {
    return null;
  }
}

function nativeIdentity() {
  const identity = browser.identity as unknown as NativeIdentity | undefined;
  if (!identity?.getAuthToken) throw new GoogleAuthError("SYNC_NOT_CONFIGURED");
  return identity;
}

async function storedCredentials(): Promise<Credentials | undefined> {
  const [local, session] = await Promise.all([
    browser.storage.local.get(CREDENTIALS),
    browser.storage.session.get(CREDENTIALS),
  ]);
  const metadata = local[CREDENTIALS] as Omit<Credentials, "token"> | undefined;
  if (!metadata) return undefined;
  const access = session[CREDENTIALS] as Credentials | undefined;
  const token =
    access?.account.id === metadata.account.id &&
    access.client === metadata.client
      ? access.token
      : "";
  return {
    account: metadata.account,
    client: metadata.client,
    token,
    expires: token ? Math.min(metadata.expires, access!.expires) : 0,
  };
}

async function saveCredentials(credentials: Credentials) {
  const { account, client, expires, token } = credentials;
  // Bearer credentials are memory/session-only; persistent identity metadata
  // lets a browser restart attempt silent renewal without restoring a token.
  await browser.storage.local.set({
    [CREDENTIALS]: { account, client, expires },
  });
  if (token) await browser.storage.session.set({ [CREDENTIALS]: credentials });
  else await browser.storage.session.remove(CREDENTIALS);
}

async function binding(): Promise<SyncAccount | undefined> {
  return (await browser.storage.local.get(BINDING))[BINDING] as
    SyncAccount | undefined;
}

function assertCurrent(epoch: number) {
  if (generation !== epoch) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
}

async function dataConsent(request: boolean) {
  if (!firefox) return true;
  const permission: Parameters<typeof browser.permissions.request>[0] & {
    data_collection: string[];
  } = { data_collection: CONSENT };
  return request
    ? browser.permissions.request(permission)
    : browser.permissions.contains(permission);
}

async function closePendingTab(pending: Pending | undefined) {
  if (pending?.tab === undefined) return;
  try {
    const tab = await browser.tabs.get(pending.tab);
    const current = new URL(tab.url ?? "");
    const callback = new URL(pending.redirect);
    // Tab IDs can be reused after a full browser restart. Never close a tab
    // that no longer belongs to Google's login or this configured callback.
    if (
      (current.protocol === "https:" &&
        current.hostname === "accounts.google.com") ||
      (current.origin === callback.origin &&
        current.pathname === callback.pathname)
    ) {
      await browser.tabs.remove(pending.tab);
    }
  } catch {
    // The user may already have closed the tab.
  }
}

export function initializeAuth(): void {
  if (initialized) return;
  initialized = true;
  // A restarted worker cannot accept a callback from an abandoned operation.
  // Invalidate its persisted state and close only its correlated auth tab.
  startup = (async () => {
    const pending = (await browser.storage.local.get(PENDING))[PENDING] as
      Pending | undefined;
    await browser.storage.local.remove(PENDING);
    await closePendingTab(pending);
  })();
}

async function ready() {
  initializeAuth();
  await startup;
}

export async function authStatus(): Promise<{
  configured: boolean;
  account: SyncAccount | null;
  boundAccount: SyncAccount | undefined;
  authorizationRequired: boolean;
}> {
  await ready();
  const [credentials, boundAccount] = await Promise.all([
    storedCredentials(),
    binding(),
  ]);
  const configured = configuration() !== null;
  return {
    configured,
    account: credentials?.account ?? null,
    boundAccount,
    authorizationRequired: Boolean(
      credentials && (!configured || !(await dataConsent(false))),
    ),
  };
}

function providerError(response: Response) {
  const temporary =
    response.status === 408 ||
    response.status === 429 ||
    response.status >= 500;
  const error = new GoogleAuthError(
    temporary ? "SYNC_NETWORK" : "SYNC_AUTH_REQUIRED",
    response.status,
  );
  const header = response.headers.get("Retry-After");
  if (header) {
    const seconds = Number(header);
    const milliseconds = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(header) - Date.now();
    if (Number.isFinite(milliseconds))
      error.retryAfter = Math.max(0, milliseconds);
  }
  return error;
}

async function identify(
  token: string,
  client: string,
  signal: AbortSignal,
): Promise<{ account: SyncAccount; expires: number }> {
  let info: Response;
  let user: Response;
  try {
    info = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      {
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal,
      },
    );
    if (!info.ok) throw providerError(info);
    const claims = (await info.json()) as {
      aud?: string;
      audience?: string;
      issued_to?: string;
      scope?: string;
      expires_in?: string | number;
    };
    if ((claims.aud ?? claims.audience ?? claims.issued_to) !== client)
      throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
    if (!claims.scope?.split(" ").includes(DRIVE_SCOPE))
      throw new GoogleAuthError("SYNC_AUTH_SCOPE");
    const seconds = Number(claims.expires_in);
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
    user = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "omit",
      signal,
    });
    if (!user.ok) throw providerError(user);
    const account = (await user.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
    };
    if (!account.sub || !account.email || account.email_verified !== true)
      throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
    return {
      account: { id: account.sub, email: account.email },
      expires: Date.now() + seconds * 1000,
    };
  } catch (error) {
    if (signal.aborted) throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    if (error instanceof GoogleAuthError) throw error;
    throw new GoogleAuthError("SYNC_NETWORK");
  }
}

function randomState() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function tabToken(
  client: string,
  redirect: string,
  interactive: boolean,
  epoch: number,
): Promise<string> {
  const previous = await binding();
  assertCurrent(epoch);
  const pending: Pending = {
    state: randomState(),
    redirect,
    expires: Date.now() + (interactive ? 10 * 60_000 : 60_000),
  };
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client,
    redirect_uri: redirect,
    response_type: "token",
    scope: SCOPES.join(" "),
    state: pending.state,
    prompt: interactive ? "select_account" : "none",
    ...(previous && !interactive ? { login_hint: previous.id } : {}),
  }).toString();
  await browser.storage.local.set({ [PENDING]: pending });
  assertCurrent(epoch);
  const { promise, resolve, reject } = Promise.withResolvers<string>();
  let done = false;
  let tabId: number | undefined;
  const finish = (error?: GoogleAuthError, token?: string) => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    browser.tabs.onUpdated.removeListener(updated);
    browser.tabs.onRemoved.removeListener(removed);
    if (activeCancel === cancel) activeCancel = undefined;
    void (async () => {
      await browser.storage.local.remove(PENDING);
      if (tabId !== undefined) await browser.tabs.remove(tabId).catch(() => {});
      if (error) reject(error);
      else resolve(token!);
    })().catch(reject);
  };
  const cancel = () => finish(new GoogleAuthError("SYNC_AUTH_CANCELLED"));
  const inspect = async (id: number, target: string) => {
    if (done || id !== tabId) return;
    let callback: URL;
    try {
      callback = new URL(target);
    } catch {
      return;
    }
    const expected = new URL(redirect);
    if (
      callback.origin !== expected.origin ||
      callback.pathname !== expected.pathname
    )
      return;
    try {
      assertCurrent(epoch);
      const saved = (await browser.storage.local.get(PENDING))[PENDING] as
        Pending | undefined;
      if (
        !saved ||
        saved.state !== pending.state ||
        saved.redirect !== redirect ||
        saved.tab !== id ||
        saved.expires <= Date.now() ||
        callback.search !== expected.search ||
        callback.username ||
        callback.password
      )
        throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
      const params = new URLSearchParams(callback.hash.slice(1));
      for (const name of [
        "state",
        "access_token",
        "error",
        "token_type",
        "expires_in",
        "scope",
      ]) {
        if (params.getAll(name).length > 1)
          throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
      }
      if (params.get("state") !== saved.state)
        throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
      const error = params.get("error");
      if (error)
        throw new GoogleAuthError(
          error === "access_denied"
            ? "SYNC_AUTH_CANCELLED"
            : "SYNC_AUTH_REQUIRED",
        );
      const token = params.get("access_token");
      const seconds = Number(params.get("expires_in"));
      if (
        !token ||
        params.get("token_type")?.toLowerCase() !== "bearer" ||
        !Number.isFinite(seconds) ||
        seconds <= 0
      )
        throw new GoogleAuthError("SYNC_AUTH_CALLBACK");
      if (!params.get("scope")?.split(" ").includes(DRIVE_SCOPE))
        throw new GoogleAuthError("SYNC_AUTH_SCOPE");
      assertCurrent(epoch);
      finish(undefined, token);
    } catch (error) {
      finish(
        error instanceof GoogleAuthError
          ? error
          : new GoogleAuthError("SYNC_AUTH_CALLBACK"),
      );
    }
  };
  const updated = (id: number, change: { url?: string }) => {
    if (change.url) void inspect(id, change.url);
  };
  const removed = (id: number) => {
    if (id === tabId) cancel();
  };
  const timer = setTimeout(
    () =>
      finish(
        new GoogleAuthError(
          interactive ? "SYNC_AUTH_CANCELLED" : "SYNC_AUTH_REQUIRED",
        ),
      ),
    Math.max(0, pending.expires - Date.now()),
  );
  activeCancel = cancel;
  browser.tabs.onUpdated.addListener(updated);
  browser.tabs.onRemoved.addListener(removed);
  // Create about:blank first: its id is persisted before starting navigation,
  // including on Android where identity.launchWebAuthFlow is unavailable.
  void browser.tabs
    .create({ url: "about:blank", active: interactive })
    .then(async (tab) => {
      if (tab.id === undefined) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
      tabId = tab.id;
      if (done || generation !== epoch) {
        await browser.tabs.remove(tabId).catch(() => {});
        cancel();
        return;
      }
      pending.tab = tabId;
      await browser.storage.local.set({ [PENDING]: pending });
      assertCurrent(epoch);
      await browser.tabs.update(tabId, { url: url.href });
    })
    .catch((error) =>
      finish(
        error instanceof GoogleAuthError
          ? error
          : new GoogleAuthError("SYNC_AUTH_REQUIRED"),
      ),
    );
  return promise;
}

async function obtain(
  interactive: boolean,
  replace: boolean,
  epoch: number,
): Promise<Credentials> {
  const signal = authController.signal;
  const config = configuration();
  if (!config) throw new GoogleAuthError("SYNC_NOT_CONFIGURED");
  if (!(await dataConsent(interactive)))
    throw new GoogleAuthError("SYNC_PERMISSION_REQUIRED");
  assertCurrent(epoch);
  let token: string;
  let verified: { account: SyncAccount; expires: number };
  for (let attempt = 0; ; attempt++) {
    if (firefox) {
      token = await tabToken(
        config.client,
        config.redirect,
        interactive,
        epoch,
      );
    } else {
      const native = nativeIdentity();
      const previous = await binding();
      if (replace && attempt === 0) await native.clearAllCachedAuthTokens();
      assertCurrent(epoch);
      try {
        const result = await native.getAuthToken({
          interactive,
          enableGranularPermissions: true,
          scopes: SCOPES,
          ...(!replace && previous ? { account: { id: previous.id } } : {}),
        });
        token = typeof result === "string" ? result : (result.token ?? "");
        if (!token) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
        if (generation !== epoch) {
          await native.removeCachedAuthToken({ token }).catch(() => {});
          throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
        }
      } catch (error) {
        assertCurrent(epoch);
        if (error instanceof GoogleAuthError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (
          /invalid.*client|bad client|not (?:supported|available)|not configured/i.test(
            message,
          )
        )
          throw new GoogleAuthError("SYNC_NOT_CONFIGURED");
        if (
          interactive &&
          /cancel|did not approve|denied|closed/i.test(message)
        )
          throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
        throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
      }
    }
    assertCurrent(epoch);
    try {
      verified = await identify(token, config.client, signal);
      break;
    } catch (error) {
      if (
        firefox ||
        attempt > 0 ||
        !(error instanceof GoogleAuthError) ||
        error.code !== "SYNC_AUTH_REQUIRED" ||
        (error.status !== undefined &&
          error.status !== 400 &&
          error.status !== 401)
      )
        throw error;
      // Chrome can return a stale cached token; evict it before renewing once.
      await nativeIdentity().removeCachedAuthToken({ token });
      assertCurrent(epoch);
    }
  }
  assertCurrent(epoch);
  const previous = await binding();
  if (previous && previous.id !== verified.account.id && !replace) {
    if (!firefox)
      await nativeIdentity()
        .removeCachedAuthToken({ token })
        .catch(() => {});
    throw new GoogleAuthError("SYNC_ACCOUNT_CHANGED");
  }
  assertCurrent(epoch);
  const credentials: Credentials = {
    ...verified,
    token,
    client: config.client,
  };
  const commit = credentialWrites.then(async () => {
    assertCurrent(epoch);
    const priorCredentials = await storedCredentials();
    const priorBinding = await binding();
    assertCurrent(epoch);
    await saveCredentials(credentials);
    await browser.storage.local.set({ [BINDING]: verified.account });
    if (generation !== epoch) {
      if (priorCredentials) await saveCredentials(priorCredentials);
      else
        await Promise.all([
          browser.storage.local.remove(CREDENTIALS),
          browser.storage.session.remove(CREDENTIALS),
        ]);
      if (priorBinding)
        await browser.storage.local.set({ [BINDING]: priorBinding });
      else await browser.storage.local.remove(BINDING);
      throw new GoogleAuthError("SYNC_AUTH_CANCELLED");
    }
  });
  credentialWrites = commit.catch(() => {});
  await commit;
  return credentials;
}

export async function connectGoogle(
  replaceAccount = false,
): Promise<SyncAccount> {
  await ready();
  if (connecting || renewing) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
  const epoch = generation;
  const cancelled = Promise.withResolvers<SyncAccount>();
  const cancel = () =>
    cancelled.reject(new GoogleAuthError("SYNC_AUTH_CANCELLED"));
  cancelOperation = cancel;
  connecting = Promise.race([
    obtain(true, replaceAccount, epoch).then((result) => result.account),
    cancelled.promise,
  ]);
  try {
    return await connecting;
  } finally {
    connecting = undefined;
    if (cancelOperation === cancel) cancelOperation = undefined;
  }
}

export async function cancelGoogle(): Promise<void> {
  generation += 1;
  authController.abort();
  authController = new AbortController();
  cancelOperation?.();
  activeCancel?.();
  const pending = (await browser.storage.local.get(PENDING))[PENDING] as
    Pending | undefined;
  await browser.storage.local.remove(PENDING);
  await closePendingTab(pending);
}

export async function disconnectGoogle(): Promise<void> {
  await ready();
  await cancelGoogle();
  await credentialWrites;
  const credentials = await storedCredentials();
  await Promise.all([
    browser.storage.local.remove(CREDENTIALS),
    browser.storage.session.remove(CREDENTIALS),
  ]);
  if (!firefox) {
    const native = browser.identity as unknown as
      Partial<NativeIdentity> | undefined;
    if (credentials?.token)
      await native
        ?.removeCachedAuthToken?.({ token: credentials.token })
        .catch(() => {});
    await native?.clearAllCachedAuthTokens?.().catch(() => {});
  }
  // Disconnect is local only. Revoking Google's project-wide grant would also
  // invalidate the user's other devices and OAuth clients.
}

export async function accessToken(expectedAccount: string): Promise<string> {
  await ready();
  await credentialWrites;
  const credentials = await storedCredentials();
  const config = configuration();
  if (!config) throw new GoogleAuthError("SYNC_NOT_CONFIGURED");
  if (!credentials) throw new GoogleAuthError("SYNC_AUTH_REQUIRED");
  if (credentials.account.id !== expectedAccount)
    throw new GoogleAuthError("SYNC_ACCOUNT_CHANGED");
  if (!(await dataConsent(false)))
    throw new GoogleAuthError("SYNC_PERMISSION_REQUIRED");
  if (
    credentials.client === config.client &&
    credentials.expires > Date.now() + 60_000
  )
    return credentials.token;
  if (!renewing) {
    const cancelled = Promise.withResolvers<string>();
    const cancel = () =>
      cancelled.reject(new GoogleAuthError("SYNC_AUTH_CANCELLED"));
    cancelOperation = cancel;
    const operation = Promise.race([
      obtain(false, false, generation).then((result) => result.token),
      cancelled.promise,
    ]);
    renewing = operation;
    void operation
      .finally(() => {
        if (renewing === operation) renewing = undefined;
        if (cancelOperation === cancel) cancelOperation = undefined;
      })
      .catch(() => {});
  }
  return renewing;
}

/** A rejected token is invalidated once; the next request renews without UI. */
export async function invalidateAccessToken(token: string): Promise<void> {
  const invalidate = credentialWrites.then(async () => {
    const credentials = await storedCredentials();
    if (credentials?.token !== token || credentials.expires === 0) return;
    if (!firefox)
      await nativeIdentity()
        .removeCachedAuthToken({ token })
        .catch(() => {});
    await saveCredentials({ ...credentials, expires: 0 });
  });
  credentialWrites = invalidate.catch(() => {});
  await invalidate;
}
