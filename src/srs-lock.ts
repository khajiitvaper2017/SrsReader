export function srsWrite<T>(work: () => Promise<T>) {
  return navigator.locks.request("srs-reader-srs-write", work);
}
