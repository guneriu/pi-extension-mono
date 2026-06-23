/**
 * Copilot Quota Extension (@guneriu/pi-copilot-quota)
 *
 * Shows GitHub Copilot AI Credits usage (premium_interactions quota) as a
 * persistent chip in the pi footer, fetched from the Copilot API.
 *
 * Supports both github.com and GitHub Enterprise (GHE) instances.
 *
 * ⚠️  WARNING: This extension uses the `copilot_internal` API endpoint which
 * is an undocumented internal GitHub API. It is NOT part of the official
 * GitHub REST API and has no stability guarantee. GitHub may rename, remove,
 * or auth-gate it at any time without notice or deprecation period.
 *
 * Commands:
 *   /copilot-usage  — open settings dialog (host, metric, refresh interval)
 *
 * Settings persisted in: <agent-dir>/extensions/pi-copilot-quota/settings.json
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import { Container, type SettingItem, SettingsList, Spacer, Text } from "@earendil-works/pi-tui";
import { exec } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  enabled: boolean;
  githubHost: string;           // "github.com" or any GHE hostname
  clearGithubTokenEnv: boolean; // needed for some GHE setups where GITHUB_TOKEN conflicts
  metric: "remaining" | "used" | "percent" | "remaining+percent";
  refreshEvery: 5 | 10 | 30;
  costFormat: "money" | "credits";
}

export type { Settings };

interface QuotaData {
  remaining: number;
  entitlement: number;
  percentRemaining: number;
  unlimited: boolean;
}

interface CopilotRates {
  input: number;
  output: number;
  cached: number;
}

interface SessionEntry {
  type: string;
  message?: {
    role: string;
    provider?: string;
    model?: string;
    responseModel?: string;
    usage?: {
      input: number;
      output: number;
      cacheRead: number;
    };
  };
}

// ─── Settings persistence ─────────────────────────────────────────────────────

function getSettingsFile(): string {
  const dir = join(getAgentDir(), "extensions", "pi-copilot-quota");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

const DEFAULTS: Settings = {
  enabled: true,
  githubHost: "github.com",
  clearGithubTokenEnv: false,
  metric: "remaining",
  refreshEvery: 10,
  costFormat: "money",
};

export function loadSettings(): Settings {
  try {
    const raw = readFileSync(getSettingsFile(), "utf-8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: Settings): void {
  try {
    writeFileSync(getSettingsFile(), JSON.stringify(s, null, 2), "utf-8");
  } catch {
    // non-fatal
  }
}

// ─── Auth & API ───────────────────────────────────────────────────────────────

const STATUS_KEY = "copilot-quota";

/** Build the quota API URL for the configured host.
 *  - github.com → https://api.github.com/copilot_internal/user
 *  - GHE        → https://<host>/api/v3/copilot_internal/user
 */
function getApiUrl(host: string): string {
  if (host === "github.com") {
    return "https://api.github.com/copilot_internal/user";
  }
  return `https://${host}/api/v3/copilot_internal/user`;
}

async function getToken(settings: Settings): Promise<string> {
  const hostFlag = settings.githubHost !== "github.com"
    ? `--hostname ${settings.githubHost}`
    : "";
  const env = settings.clearGithubTokenEnv
    ? { ...process.env, GITHUB_TOKEN: "" }
    : process.env;
  const { stdout } = await execAsync(`gh auth token ${hostFlag}`.trim(), { env });
  return stdout.trim();
}

async function fetchQuota(token: string, settings: Settings): Promise<QuotaData | null> {
  const url = getApiUrl(settings.githubHost);
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const prem = data?.quota_snapshots?.premium_interactions;
  if (!prem) return null;
  return {
    remaining: prem.remaining as number,
    entitlement: prem.entitlement as number,
    percentRemaining: prem.percent_remaining as number,
    unlimited: prem.unlimited as boolean,
  };
}

// ─── Copilot Cost Calculation ─────────────────────────────────────────────────

/**
 * Copilot credit rates (per 1M tokens). 1 credit = $0.01.
 * Last verified: 2026-06-22. Submit a PR to update rates for new models.
 */
export const COPILOT_RATES: Record<string, CopilotRates> = {
  // Claude family
  "claude-opus":    { input: 250, output: 750,  cached: 25   },
  "claude-fable":   { input: 250, output: 750,  cached: 25   },
  "claude-sonnet":  { input: 80,  output: 400,  cached: 8    },
  "claude-haiku":   { input: 10,  output: 50,   cached: 1    },
  // GPT family
  "gpt-4.1":        { input: 100, output: 300,  cached: 10   },
  "gpt-5-mini":     { input: 25,  output: 50,   cached: 2.5  },
  "gpt-5.2":        { input: 175, output: 700,  cached: 17.5 },
  "gpt-5.3":        { input: 175, output: 700,  cached: 17.5 },
  "gpt-5.4-nano":   { input: 20,  output: 80,   cached: 2    },
  "gpt-5.4-mini":   { input: 75,  output: 300,  cached: 7.5  },
  "gpt-5.4":        { input: 250, output: 1000, cached: 25   },
  "gpt-5.5":        { input: 500, output: 2000, cached: 50   },
  // Gemini family
  "gemini-2.5-pro": { input: 125, output: 250,  cached: 12.5 },
  "gemini-3-flash": { input: 50,  output: 200,  cached: 5    },
  "gemini-3.1-pro": { input: 200, output: 800,  cached: 20   },
  "gemini-3.5":     { input: 150, output: 600,  cached: 15   },
  // Other
  "raptor-mini":    { input: 10,  output: 50,   cached: 1    },
};

/** Match a model ID to its Copilot credit rates (longest prefix wins). */
export function getCopilotRates(modelId: string): CopilotRates | undefined {
  let best: CopilotRates | undefined;
  let bestLen = 0;
  for (const [prefix, rates] of Object.entries(COPILOT_RATES)) {
    if (modelId.startsWith(prefix) && prefix.length > bestLen) {
      best = rates;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** Calculate cost for a single message using Copilot rates (in dollars). */
function copilotMsgCost(
  usage: { input: number; output: number; cacheRead: number },
  rates: CopilotRates,
): number {
  const inputCredits  = (usage.input     / 1_000_000) * rates.input;
  const outputCredits = (usage.output    / 1_000_000) * rates.output;
  const cachedCredits = (usage.cacheRead / 1_000_000) * rates.cached;
  return (inputCredits + outputCredits + cachedCredits) * 0.01;
}

/** Calculate total session cost using Copilot rates (github-copilot provider only).
 *  Returns 0 if disabled or no matching messages found. */
export function calculateSessionCopilotCost(branch: SessionEntry[]): number {
  const settings = loadSettings();
  if (!settings.enabled) return 0;

  let totalCost = 0;
  for (const entry of branch) {
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const m = entry.message;
      if (m.provider === "github-copilot" && m.usage) {
        const rates = getCopilotRates(m.model ?? m.responseModel ?? "");
        totalCost += rates ? copilotMsgCost(m.usage, rates) : 0;
      }
    }
  }
  return totalCost;
}

/**
 * Calculate total Copilot cost for subagents by reading toolResult entries
 * from the parent session branch. Subagents record usage at:
 *   toolResult.message.details.results[].usage / .model
 *
 * Works regardless of session persistence (--no-session subagents included).
 *
 * ⚠️  Only tracks pi's built-in `subagent` tool. Third-party subagent
 * extensions (@tintinweb/pi-subagents, pi-crew, etc.) use different tool
 * names and will not be counted here.
 */
export function calculateSubagentsCopilotCost(branch: SessionEntry[]): number {
  const settings = loadSettings();
  if (!settings.enabled) return 0;

  let totalCost = 0;
  for (const entry of branch) {
    if (entry.type !== "message") continue;
    const msg = entry.message as any;
    if (msg?.role !== "toolResult" || msg?.toolName !== "subagent") continue;

    const results: any[] = msg.details?.results ?? [];
    for (const r of results) {
      const usage = r.usage;
      const model: string = r.model ?? "";
      if (!usage || !model) continue;
      const rates = getCopilotRates(model);
      if (!rates) continue;
      totalCost += copilotMsgCost({
        input:     usage.input     ?? 0,
        output:    usage.output    ?? 0,
        cacheRead: usage.cacheRead ?? 0,
      }, rates);
    }
  }
  return totalCost;
}

/** Format Copilot cost for display. Shows parent ↳ subagent breakdown when subagents ran. */
export function formatSessionCopilotCostDisplay(
  parentCost: number,
  subagentCost: number = 0,
): string {
  const settings = loadSettings();
  const totalCost = parentCost + subagentCost;
  if (!settings.enabled || totalCost === 0) return "";

  if (settings.costFormat === "credits") {
    const totalCr = Math.round(totalCost / 0.01);
    if (subagentCost > 0) {
      const subCr = Math.round(subagentCost / 0.01);
      return `${totalCr} cr ↳ ${subCr} cr`;
    }
    return `${totalCr} cr`;
  }

  if (subagentCost > 0) {
    return `$${parentCost.toFixed(3)} ↳ $${subagentCost.toFixed(3)}`;
  }
  return `$${parentCost.toFixed(3)}`;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function formatCompact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

type Theme = { fg: (color: string, text: string) => string; bold: (text: string) => string };

function buildChipText(data: QuotaData, settings: Settings, theme: Theme): string {
  const used = data.entitlement - data.remaining;
  let label: string;
  switch (settings.metric) {
    case "remaining":
      label = `🤖 ${formatCompact(data.remaining)}/${formatCompact(data.entitlement)}`; break;
    case "used":
      label = `🤖 ${formatCompact(used)} used`; break;
    case "percent":
      label = `🤖 ${data.percentRemaining.toFixed(1)}%`; break;
    case "remaining+percent":
      label = `🤖 ${formatCompact(data.remaining)}/${formatCompact(data.entitlement)} · ${data.percentRemaining.toFixed(1)}%`; break;
  }
  const pct = data.percentRemaining;
  const color = pct > 50 ? "success" : pct > 25 ? "warning" : "error";
  return theme.fg(color, label!);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastData: QuotaData | null = null;
  let activeCtx: any = null;

  async function doFetch(): Promise<void> {
    if (!activeCtx) return;
    const ctx = activeCtx;
    const settings = loadSettings();
    if (!settings.enabled) return;

    let token: string;
    try {
      token = await getToken(settings);
    } catch {
      const hint = settings.githubHost !== "github.com"
        ? `gh auth refresh --hostname ${settings.githubHost}`
        : "gh auth refresh";
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("warning", `🤖 auth? (${hint})`));
      return;
    }

    let data: QuotaData | null;
    try {
      data = await fetchQuota(token, settings);
    } catch {
      if (lastData) {
        ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", buildChipText(lastData, settings, ctx.ui.theme)));
      } else {
        ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "🤖 ?"));
      }
      return;
    }

    if (!data) {
      const hint = settings.githubHost !== "github.com"
        ? `gh auth refresh --hostname ${settings.githubHost}`
        : "gh auth refresh";
      ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("warning", `🤖 auth? (${hint})`));
      return;
    }

    lastData = data;
    ctx.ui.setStatus(STATUS_KEY, buildChipText(data, settings, ctx.ui.theme));
  }

  function startTimer(settings: Settings): void {
    clearInterval(timer);
    timer = setInterval(() => { void doFetch(); }, settings.refreshEvery * 60 * 1000);
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    activeCtx = ctx;
    clearInterval(timer);
    const settings = loadSettings();
    if (!settings.enabled) return;
    ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "🤖 …"));
    void doFetch();
    startTimer(settings);
  });

  pi.on("session_shutdown", async () => {
    clearInterval(timer);
    timer = undefined;
    activeCtx = null;
  });

  pi.registerCommand("copilot-usage", {
    description: "GitHub Copilot quota settings",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/copilot-usage requires TUI mode", "error");
        return;
      }

      const settings = loadSettings();
      let openHostInput = false;

      await ctx.ui.custom((tui, theme, _kb, done) => {
        const items: SettingItem[] = [
          {
            id: "enabled",
            label: "Enabled",
            currentValue: settings.enabled ? "on" : "off",
            values: ["on", "off"],
          },
          {
            id: "githubHost",
            label: "GitHub host",
            currentValue: settings.githubHost,
            values: [settings.githubHost],   // display-only — use action row below to change
          },
          {
            id: "set-host",
            label: "  ⌨  Set GitHub host…",
            currentValue: "",
            values: [""],
          },
          {
            id: "clearGithubTokenEnv",
            label: "Clear GITHUB_TOKEN",
            currentValue: settings.clearGithubTokenEnv ? "on" : "off",
            values: ["off", "on"],
          },
          {
            id: "metric",
            label: "Show metric",
            currentValue: settings.metric,
            values: ["remaining", "used", "percent", "remaining+percent"],
          },
          {
            id: "refreshEvery",
            label: "Refresh every",
            currentValue: `${settings.refreshEvery} min`,
            values: ["5 min", "10 min", "30 min"],
          },
          {
            id: "costFormat",
            label: "Cost format",
            currentValue: settings.costFormat,
            values: ["money", "credits"],
          },
          {
            id: "refresh-now",
            label: "↺  Refresh now",
            currentValue: "",
            values: [""],
          },
        ];

        const container = new Container();
        container.addChild(new Text(theme.fg("accent", theme.bold(" Copilot Quota")), 1, 0));
        container.addChild(new Spacer(1));

        const list = new SettingsList(
          items,
          Math.min(items.length + 4, 14),
          getSettingsListTheme(),
          (id, newValue) => {
            if (id === "refresh-now") { void doFetch(); ctx.ui.notify("Refreshing quota…", "info"); return; }
            if (id === "set-host") {
              // Close dialog first, then open input prompt
              openHostInput = true;
              done(undefined);
              return;
            }
            if (id === "enabled") {
              settings.enabled = newValue === "on";
              if (!settings.enabled) { ctx.ui.setStatus(STATUS_KEY, undefined); clearInterval(timer); timer = undefined; }
              else { ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg("dim", "🤖 …")); activeCtx = ctx; void doFetch(); startTimer(settings); }
            }
            if (id === "clearGithubTokenEnv") settings.clearGithubTokenEnv = newValue === "on";
            if (id === "metric") { settings.metric = newValue as Settings["metric"]; if (settings.enabled && lastData) ctx.ui.setStatus(STATUS_KEY, buildChipText(lastData, settings, ctx.ui.theme)); }
            if (id === "refreshEvery") { settings.refreshEvery = parseInt(newValue) as Settings["refreshEvery"]; if (settings.enabled) startTimer(settings); }
            if (id === "costFormat") { settings.costFormat = newValue as Settings["costFormat"]; activeCtx?.ui.requestRender?.(); }
            saveSettings(settings);
          },
          () => done(undefined),
          { enableSearch: false },
        );

        container.addChild(list);
        container.addChild(new Spacer(1));
        container.addChild(new Text(theme.fg("dim", " ↑↓ navigate  ←→ cycle  esc close"), 1, 0));

        return {
          render: (w: number) => container.render(w),
          invalidate: () => container.invalidate(),
          handleInput: (data: string) => { list.handleInput?.(data); tui.requestRender(); },
        };
      });

      // After dialog closes: if user pressed "Set GitHub host…", open input prompt
      if (openHostInput) {
        const entered = await ctx.ui.input(
          "GitHub host:",
          settings.githubHost,   // pre-filled with current value
        );
        if (entered && entered.trim()) {
          settings.githubHost = entered.trim();
          saveSettings(settings);
          ctx.ui.notify(`GitHub host set to: ${settings.githubHost}`, "info");
        }
      }
    },
  });
}
