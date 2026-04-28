/** IPs considered equivalent for session binding (localhost variants) */
export const LOCALHOST_IPS = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

/**
 * Delimiter used in OAuth state payloads for SP-API, Ads, and Slack callbacks.
 *
 * Must be URL-safe (no `#` — that's the URL fragment marker, which gets
 * truncated by browsers when providers don't re-encode state on redirect back,
 * dropping everything after the first `#`). UUIDs and hex strings never
 * contain `--`, so it splits unambiguously.
 */
export const STATE_PAYLOAD_DELIMITER = '--';
