/** Where Claude Code reports the plan limits of a signed-in account. */
export const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

/** The beta header the usage endpoint needs; without it the call is refused. */
export const OAUTH_BETA = "oauth-2025-04-20";

/** The shared key that keeps the last readings, so the popup opens with numbers instead of a blank. */
export const CACHE_KEY = "usage.cache";

/**
 * How often the plan limits are fetched while the popup is open. Claude Code polls the
 * same endpoint, and it answers 429 when asked more often than about once a minute per account.
 */
export const LIMITS_EVERY_MS = 300000;

/** How often CPU, memory and GPU are read while the popup is open. One reading takes about a second. */
export const SYSTEM_EVERY_MS = 4000;

/** The text for each limit kind in the API's `limits` list. */
export const LIMIT_LABELS = {
  session: "Session (5-hour)",
  weekly_all: "Weekly (7-day)",
};

/** Used percent at which a bar turns yellow, then red, when the API gives no severity. */
export const WARN_AT = 70;
export const ALERT_AT = 90;

/** Status line limits older than this are not shown: no Claude session of that profile is running. */
export const FEED_MAX_AGE_MS = 15 * 60000;

/**
 * A popup opened with openOverlay takes the height of its content and ignores the asked
 * height, so the popup must not stretch to fill it: a body with flex_1 collapses to zero.
 * The body grows with its cards up to this height, then scrolls. It must stay well above
 * three cards (about 510 px, more with larger text), or the last card is cut off at the bottom.
 */
export const BODY_MAX_HEIGHT = 680;

/** The order of profile cards by plan. A plan not in this list goes after these. */
export const PLAN_ORDER = ["enterprise", "team", "max", "pro", "free"];
