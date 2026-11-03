import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, theme, props, shared, setShared, openOverlay } from "herdr";
import * as fs from "fs/promises";
import { sha256Hex } from "./sha256.js";
import { STATS_SCRIPT } from "./stats.js";
import { USAGE_URL, OAUTH_BETA, CACHE_KEY, LIMITS_EVERY_MS, SYSTEM_EVERY_MS, LIMIT_LABELS, WARN_AT, ALERT_AT, FEED_MAX_AGE_MS, BODY_MAX_HEIGHT, PLAN_ORDER } from "./constants.js";

/** Every Claude Code config folder in the home folder: `~/.claude` and any `~/.claude-<name>`. */
async function findProfiles() {
  const names = (await fs.readdir(home()).catch(() => [])).filter((n) => n === ".claude" || n.startsWith(".claude-"));
  const found = [];
  for (const name of names.sort()) {
    const dir = `${home()}/${name}`;
    /** Herdr's `fs` has no `stat`, so a folder is a name that `readdir` can open. */
    if (await fs.readdir(dir).then(() => true, () => false)) found.push({ dir, label: name === ".claude" ? "default" : name.slice(".claude-".length) });
  }
  return found;
}

/**
 * Reads a profile's sign-in. Linux keeps it in `.credentials.json` in the folder.
 * macOS keeps it in the keychain: `~/.claude` uses the plain item name, any other
 * folder adds the first eight hex digits of the SHA-256 of its path.
 */
async function readSignIn(profile) {
  let text = await fs.readFile(`${profile.dir}/.credentials.json`, "utf8").catch(() => null);
  if (!text) {
    const service = profile.label === "default" ? "Claude Code-credentials" : `Claude Code-credentials-${sha256Hex(profile.dir).slice(0, 8)}`;
    const r = await exec("security", ["find-generic-password", "-s", service, "-w"]).catch(() => null);
    text = r?.code === 0 ? r.stdout : null;
  }
  try {
    return JSON.parse(text)?.claudeAiOauth ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches the plan limits of one profile. The mod never refreshes an expired token:
 * Claude Code rotates the refresh token on each refresh, so a refresh from here would
 * sign that profile's Claude out. Starting Claude with the profile refreshes it.
 */
async function fetchLimits(profile) {
  const auth = await readSignIn(profile);
  if (!auth?.accessToken) return { ...profile, error: "Not signed in" };
  const plan = auth.subscriptionType ?? null;
  if (auth.expiresAt && auth.expiresAt < Date.now()) return { ...profile, plan, error: "Sign-in expired. Start Claude with this profile to renew it." };
  try {
    const res = await fetch(USAGE_URL, { headers: { Authorization: `Bearer ${auth.accessToken}`, "anthropic-beta": OAUTH_BETA, Accept: "application/json" } });
    if (res.status === 401) return { ...profile, plan, error: "Sign-in expired. Start Claude with this profile to renew it." };
    if (res.status === 429) return { ...profile, plan, status: 429, error: "Too many usage requests. Trying again in a few minutes." };
    if (!res.ok) return { ...profile, plan, error: `Usage request failed (${res.status})` };
    return { ...profile, plan, limits: readLimits(await res.json()) };
  } catch (e) {
    return { ...profile, plan, error: `Offline: ${e?.message ?? e}` };
  }
}

/** Turns the API answer into rows. The `limits` list is newer; `five_hour` and `seven_day` are the fallback. */
function readLimits(data) {
  if (Array.isArray(data?.limits) && data.limits.length) {
    return data.limits.map((l) => ({
      label: l.scope?.model?.display_name ? `${l.scope.model.display_name} weekly` : LIMIT_LABELS[l.kind] ?? l.kind,
      percent: l.percent ?? 0,
      severity: l.severity,
      resetsAt: l.resets_at,
    }));
  }
  return [
    ["Session (5-hour)", data?.five_hour],
    ["Weekly (7-day)", data?.seven_day],
  ].filter(([, v]) => v).map(([label, v]) => ({ label, percent: v.utilization ?? 0, resetsAt: v.resets_at }));
}

/**
 * Reads the limits a Claude Code status line wrote into `<profile>/usage-limits.json`
 * (see RECIPE.md). Claude Code gets them for free with every reply, so this works when the
 * usage endpoint refuses with 429. Older than FEED_MAX_AGE_MS counts as missing.
 */
async function readFeed(profile) {
  const text = await fs.readFile(`${profile.dir}/usage-limits.json`, "utf8").catch(() => null);
  try {
    const feed = JSON.parse(text);
    if (!feed?.rate_limits || Date.now() - feed.at * 1000 > FEED_MAX_AGE_MS) return null;
    return [
      ["Session (5-hour)", feed.rate_limits.five_hour],
      ["Weekly (7-day)", feed.rate_limits.seven_day],
    ].filter(([, v]) => v).map(([label, v]) => ({ label, percent: v.used_percentage ?? 0, resetsAt: new Date(v.resets_at * 1000).toISOString() }));
  } catch {
    return null;
  }
}

/** Bigger plans first (team above pro); a profile with an error goes below the ones with numbers. */
function byPlan(a, b) {
  const rank = (x) => (x.error ? PLAN_ORDER.length + 1 : PLAN_ORDER.indexOf(x.plan) === -1 ? PLAN_ORDER.length : PLAN_ORDER.indexOf(x.plan));
  return rank(a) - rank(b) || a.label.localeCompare(b.label);
}

async function readSystem() {
  const r = await exec("sh", ["-c", STATS_SCRIPT]).catch(() => null);
  try {
    return r?.code === 0 ? JSON.parse(r.stdout) : null;
  } catch {
    return null;
  }
}

function resetText(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (!(ms > 0)) return "";
  const m = Math.round(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return `resets in ${d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`}`;
}

const gb = (bytes) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

export default class Usage extends View {
  init(_props, cx) {
    const cached = shared(CACHE_KEY) ?? {};
    this.accounts = cached.accounts ?? [];
    this.system = cached.system ?? null;
    this.loading = !this.accounts.length;
    /**
     * `props()` can still be empty while `init` runs for a popup opened by a click, so the
     * form is checked at each tick and in `render`, not once here. Only the popup does work.
     */
    const limits = (cx) => this.isPopup() && cx.spawn(async (cx) => {
      try {
        const fresh = await Promise.all((await findProfiles()).map(async (profile) => {
          const a = await fetchLimits(profile);
          if (!a.error || a.error === "Not signed in") return a;
          const feed = await readFeed(profile);
          return feed ? { ...a, error: null, status: null, limits: feed, note: "From the Claude Code status line" } : a;
        }));
        /** A folder with no sign-in is an unused profile, so it is left out. */
        this.accounts = fresh.filter((a) => a.error !== "Not signed in").map((a) => {
          const last = this.accounts.find((b) => b.label === a.label);
          /** The endpoint answers 429 when asked too often; the last numbers stay, marked as old. */
          return a.status === 429 && last?.limits ? { ...last, note: "Not updated: too many requests" } : a;
        }).sort(byPlan);
      } catch (e) {
        this.accounts = [{ label: "error", error: String(e?.message ?? e) }];
      }
      this.loading = false;
      this.save();
      cx.notify();
    });
    const system = (cx) => this.isPopup() && cx.spawn(async (cx) => {
      this.system = await readSystem();
      this.save();
      cx.notify();
    });
    /** A one-off early tick catches a popup whose props arrived after `init`. */
    this.started = this.isPopup();
    limits(cx);
    system(cx);
    cx.timer.every(500, (cx) => {
      if (this.started || !this.isPopup()) return;
      this.started = true;
      limits(cx);
      system(cx);
    });
    cx.timer.every(LIMITS_EVERY_MS, limits);
    cx.timer.every(SYSTEM_EVERY_MS, system);
  }

  isPopup() {
    const p = props();
    return Boolean(p?.overlay || p?.popup);
  }

  /** Keeps percentages and names only, never a token: every mod can read shared values. */
  save() {
    const accounts = this.accounts.map(({ label, plan, limits, error, note }) => ({ label, plan, limits, error, note }));
    setShared(CACHE_KEY, { accounts, system: this.system });
  }

  barColor(t, percent, severity) {
    if (severity === "critical" || severity === "exceeded" || percent >= ALERT_AT) return t.ansi1;
    if (severity === "warning" || percent >= WARN_AT) return t.ansi3;
    return t.accent;
  }

  meter(t, key, { label, value, detail, percent, severity }) {
    /** The numbers can come from a file on disk, so anything that is not a number counts as 0. */
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    return v_flex().id(key).gap(5)
      .child(h_flex().justify_between().text_size(12.5)
        .child(div().text_color(t.foreground).child(label))
        .child(div().text_color(t.muted).child(value)))
      .child(div().w_full().h(6).rounded(3).bg(t.hover)
        .child(div().h_full().w(`${p}%`).rounded(3).bg(this.barColor(t, p, severity))))
      .when(Boolean(detail), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(detail)));
  }

  card(t, key, title, badge, children) {
    return v_flex().id(key).gap(12).p(14).rounded(10).bg(t.surface).border(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().text_size(13.5).font_semibold().text_color(t.foreground).child(title))
        .when(Boolean(badge), (el) => el.child(div().px(6).py(1).rounded(5).border(1).border_color(t.border).text_size(11).text_color(t.muted).child(badge))))
      .children(children);
  }

  render() {
    const t = theme();
    if (!this.isPopup()) return this.button(t);
    const s = this.system;
    const systemRows = s ? [
      this.meter(t, "cpu", { label: "CPU", value: `${Math.round(s.cpu)}%`, percent: s.cpu }),
      this.meter(t, "mem", { label: "Memory", value: `${gb(s.memUsed)} of ${gb(s.memTotal)}`, percent: s.memTotal ? (s.memUsed * 100) / s.memTotal : 0 }),
      s.gpu === null
        ? h_flex().id("gpu").justify_between().text_size(12.5).child(div().text_color(t.foreground).child("GPU")).child(div().text_color(t.dim).child("–"))
        : this.meter(t, "gpu", { label: "GPU", value: `${Math.round(s.gpu)}%`, percent: s.gpu }),
    ] : [div().text_size(12).text_color(t.dim).child("Reading…")];
    const accountCards = this.accounts.map((a) => this.card(t, `acc-${a.label}`, `Claude · ${a.label}`, a.plan,
      a.error
        ? [div().text_size(12).text_color(t.ansi3).child(a.error)]
        : [
            ...(a.limits ?? []).map((l, i) => this.meter(t, `l-${a.label}-${i}`, { label: l.label, value: `${Math.round(100 - (Number(l.percent) || 0))}% left`, detail: resetText(l.resetsAt), percent: l.percent, severity: l.severity })),
            ...(a.note ? [div().text_size(11.5).text_color(t.dim).child(a.note)] : []),
          ]));
    return v_flex().id("usage").w_full().bg(t.popover).text_color(t.foreground)
      .child(h_flex().px(16).pt(14).pb(10).gap(8).items_center()
        .child(svg("mods/usage/gauge.svg").size(15).text_color(t.muted))
        .child(div().text_size(14).font_semibold().child("Usage"))
        .when(this.loading, (el) => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(t.dim).spin(900))))
      .child(v_flex().id("usage-body").max_h(BODY_MAX_HEIGHT).px(12).pb(12).gap(10).overflow_y_scrollbar()
        .child(this.card(t, "system", "This computer", null, systemRows))
        .children(accountCards)
        .when(!this.loading && !this.accounts.length, (el) => el.child(div().px(4).text_size(12).text_color(t.dim).child("No Claude Code profile found in the home folder."))));
  }

  /** The block form: a small button, for a layout that places this mod in a bar. */
  button(t) {
    const session = this.accounts.flatMap((a) => a.limits ?? [])[0];
    return h_flex().id("usage-button").size_full().px(8).gap(5).items_center().rounded(6).text_size(12).text_color(t.muted)
      .hover((s) => s.bg(t.hover)).on_click(() => openOverlay({ mod: "usage", kind: "popup", width: 380, height: 560, props: { popup: true } }))
      .child(svg("mods/usage/gauge.svg").size(14))
      .child(session ? `${Math.round(session.percent)}%` : "Usage");
  }
}
