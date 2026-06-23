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
  input: number;       // credits/M for input tokens
  output: number;      // credits/M for output tokens
  cached: number;      // credits/M for cache reads
  cacheWrite?: number; // credits/M for cache writes (Anthropic only — thinking tokens)
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

interface RatesCache {
  updatedAt: string;                      // ISO timestamp of last fetch
  rates: Record<string, CopilotRates>;   // exact model-name keys from GitHub YAML
}

function getRatesCacheFile(): string {
  return join(getAgentDir(), "extensions", "pi-copilot-quota", "rates.json");
}

/**
 * Copilot credit rates (per 1M tokens). 1 credit = $0.01.
 *
 * Source: https://github.com/github/docs/blob/main/data/tables/copilot/models-and-pricing.yml
 * Last verified: 2026-06-23.
 *
 * NOTE: NOT used for session/subagent cost calculation — those use pi's
 * usage.cost.total directly (accurate, includes thinking tokens).
 * This table is the FALLBACK for the model-selector chip (future feature).
 * Use /copilot-usage → "Refresh rates" to fetch latest from GitHub.
 */
export const COPILOT_RATES: Record<string, CopilotRates> = {
  // Claude family — source: github/docs models-and-pricing.yml
  "claude-fable":   { input: 1000, output: 5000, cached: 100, cacheWrite: 1250 },
  "claude-opus":    { input: 500,  output: 2500, cached: 50,  cacheWrite: 625  },
  "claude-sonnet":  { input: 300,  output: 1500, cached: 30,  cacheWrite: 375  },
  "claude-haiku":   { input: 100,  output: 500,  cached: 10,  cacheWrite: 125  },
  // GPT/OpenAI family
  "gpt-5.5":        { input: 500,  output: 3000, cached: 50   },
  "gpt-5.4-nano":   { input: 20,   output: 125,  cached: 2    },
  "gpt-5.4-mini":   { input: 75,   output: 450,  cached: 7.5  },
  "gpt-5.4":        { input: 250,  output: 1500, cached: 25   },
  "gpt-5.3":        { input: 175,  output: 1400, cached: 17.5 },
  "gpt-5-mini":     { input: 25,   output: 200,  cached: 2.5  },
  // Google Gemini family
  "gemini-3.5":     { input: 150,  output: 900,  cached: 15   },
  "gemini-3.1-pro": { input: 200,  output: 1200, cached: 20   },
  "gemini-3-flash": { input: 50,   output: 300,  cached: 5    },
  "gemini-2.5-pro": { input: 125,  output: 1000, cached: 12.5 },
  // Microsoft / GitHub fine-tuned
  "mai-code":       { input: 75,   output: 450,  cached: 7.5  },
  "raptor-mini":    { input: 25,   output: 200,  cached: 2.5  },
};

/** Load rates: fetched cache overrides hardcoded fallback. */
export function loadCopilotRates(): Record<string, CopilotRates> {
  try {
    const cache: RatesCache = JSON.parse(readFileSync(getRatesCacheFile(), "utf-8"));
    return { ...COPILOT_RATES, ...cache.rates };
  } catch {
    return { ...COPILOT_RATES };
  }
}

/** Return ISO timestamp of last rates fetch, or undefined if never fetched. */
export function getRatesUpdatedAt(): string | undefined {
  try {
    const cache: RatesCache = JSON.parse(readFileSync(getRatesCacheFile(), "utf-8"));
    return cache.updatedAt;
  } catch {
    return undefined;
  }
}

/**
 * Parse GitHub's models-and-pricing.yml into a CopilotRates map.
 * Keys are exact model names lowercased, spaces → dashes.
 * Skips non-default pricing tiers (e.g. GPT-5.4 "Long context" >272K).
 */
function parseRatesYaml(yaml: string): Record<string, CopilotRates> {
  const rates: Record<string, CopilotRates> = {};
  const sections = yaml.split(/(?=^- model:)/m).filter(s => s.trim().startsWith("- model:"));

  for (const section of sections) {
    // Skip non-default tiers
    if (/^\s+tier:/m.test(section) && !/tier:\s*['"]?Default['"]?/m.test(section)) continue;

    const modelMatch  = section.match(/^- model:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
    const inputMatch  = section.match(/^  input:\s*\$([0-9.]+)/m);
    const cachedMatch = section.match(/^  cached_input:\s*\$([0-9.]+)/m);
    const outputMatch = section.match(/^  output:\s*\$([0-9.]+)/m);

    if (!modelMatch || !inputMatch || !outputMatch) continue;

    const name   = modelMatch[1].trim();
    const key    = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9.-]/g, "");
    const input  = Math.round(parseFloat(inputMatch[1])  * 100);
    const cached = cachedMatch ? Math.round(parseFloat(cachedMatch[1]) * 100) : Math.round(input * 0.1);
    const output = Math.round(parseFloat(outputMatch[1]) * 100);

    const cacheWriteMatch = section.match(/^  cache_write:\s*\$([0-9.]+)/m);
    const cacheWrite = cacheWriteMatch ? Math.round(parseFloat(cacheWriteMatch[1]) * 100) : undefined;

    if (input > 0 && output > 0) {
      rates[key] = { input, cached, output, ...(cacheWrite !== undefined ? { cacheWrite } : {}) };
    }
  }

  return rates;
}

/**
 * Fetch the latest Copilot credit rates from GitHub's public docs repo,
 * parse the YAML, save to rates.json, return count + timestamp.
 * Always fetches from github.com (docs are public, no auth needed).
 */
export async function fetchAndSaveCopilotRates(): Promise<{ count: number; updatedAt: string }> {
  const url = "https://raw.githubusercontent.com/github/docs/main/data/tables/copilot/models-and-pricing.yml";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch rates: HTTP ${res.status}`);
  const yaml = await res.text();

  const rates = parseRatesYaml(yaml);
  if (Object.keys(rates).length === 0) {
    throw new Error("Parsed 0 rates — YAML format may have changed");
  }

  const updatedAt = new Date().toISOString();
  writeFileSync(getRatesCacheFile(), JSON.stringify({ updatedAt, rates }, null, 2), "utf-8");
  return { count: Object.keys(rates).length, updatedAt };
}

/** Match a model ID against the live rates table (cached > hardcoded fallback).
 *  Uses longest prefix matching so "claude-sonnet-4.6" matches "claude-sonnet-4.6"
 *  exactly if fetched, or falls back to the "claude-sonnet" prefix key. */
export function getCopilotRates(modelId: string): CopilotRates | undefined {
  const rates = loadCopilotRates(); // cached (fetched) overrides hardcoded fallback
  let best: CopilotRates | undefined;
  let bestLen = 0;
  for (const [prefix, r] of Object.entries(rates)) {
    if (modelId.startsWith(prefix) && prefix.length > bestLen) {
      best = r;
      bestLen = prefix.length;
    }
  }
  return best;
}

/**
 * Calculate cost for a single message using Copilot credit rates.
 * Used ONLY for the model-selector chip (future feature) where
 * we need to estimate cost by model name before any usage data exists.
 * For actual session/subagent cost, use usage.cost.total directly.
 */
export function copilotMsgCost(
  usage: { input: number; output: number; cacheRead: number },
  rates: CopilotRates,
): number {
  const inputCredits  = (usage.input     / 1_000_000) * rates.input;
  const outputCredits = (usage.output    / 1_000_000) * rates.output;
  const cachedCredits = (usage.cacheRead / 1_000_000) * rates.cached;
  return (inputCredits + outputCredits + cachedCredits) * 0.01;
}

/**
 * Calculate total session Copilot cost in dollars.
 *
 * Uses pi's usage.cost.total directly — this is the most accurate approach:
 *   ✅ Pi registers official GitHub Copilot rates ($/M, from github/docs)
 *   ✅ Includes ALL token types: input, output, cacheRead, cacheWrite
 *   ✅ cacheWrite = thinking tokens (e.g. 97% of cost when extended thinking active)
 *   ✅ Automatically correct when GitHub updates rates in pi
 *
 * Returns 0 if disabled or no github-copilot messages found.
 */
export function calculateSessionCopilotCost(branch: SessionEntry[]): number {
  const settings = loadSettings();
  if (!settings.enabled) return 0;

  let totalCost = 0;
  for (const entry of branch) {
    if (entry.type === "message" && entry.message?.role === "assistant") {
      const m = entry.message as any;
      if (m.provider === "github-copilot" && typeof m.usage?.cost?.total === "number") {
        totalCost += m.usage.cost.total;
      }
    }
  }
  return totalCost;
}

/**
 * Calculate total Copilot cost for subagents from the parent session branch.
 *
 * Subagent toolResults store usage differently from assistant messages:
 *   toolResult.details.results[].usage.cost is a SCALAR (not an object)
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
      const cost = r.usage?.cost;
      // Subagent cost is a scalar number (not an object like parent messages)
      if (typeof cost === "number") {
        totalCost += cost;
      } else if (typeof cost?.total === "number") {
        // Fallback: handle if shape ever changes to match parent messages
        totalCost += cost.total;
      }
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

// ─── Provider cost patch ──────────────────────────────────────────────────────

/**
 * Patch the github-copilot provider models with Copilot credit rates so pi's
 * built-in /model picker shows credit costs rather than raw Anthropic dollar rates.
 *
 * Cost field unit: $/token  (credits/M × 1e-8 = $/token)
 * Models with no rate match keep their original cost (never removed from picker).
 */
async function patchGithubCopilotRates(piApi: ExtensionAPI, ctx: any): Promise<void> {
  const allModels: any[] = ctx.modelRegistry.getAll();
  const copilotModels = allModels.filter((m: any) => m.provider === "github-copilot");
  if (copilotModels.length === 0) return;

  const toPerToken = (crPerM: number): number => crPerM * 1e-8;

  const patchedModels = copilotModels.map((m: any) => {
    const rates = getCopilotRates(m.id);
    return {
      id:               m.id,
      name:             m.name,
      api:              m.api,
      baseUrl:          m.baseUrl,
      reasoning:        m.reasoning ?? false,
      thinkingLevelMap: m.thinkingLevelMap,
      input:            m.input ?? ["text"],
      contextWindow:    m.contextWindow ?? 200_000,
      maxTokens:        m.maxTokens ?? 16_384,
      headers:          m.headers,
      compat:           m.compat,
      cost: rates ? {
        input:      toPerToken(rates.input),
        output:     toPerToken(rates.output),
        cacheRead:  toPerToken(rates.cached),
        cacheWrite: toPerToken(rates.cacheWrite ?? rates.cached),
      } : m.cost,
    };
  });

  piApi.registerProvider("github-copilot", { models: patchedModels });
}

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
    // Patch /model picker to show Copilot credit rates
    void patchGithubCopilotRates(pi, ctx);
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
            label: "↺  Refresh quota now",
            currentValue: "",
            values: [""],
          },
          {
            id: "refresh-rates",
            label: "↺  Refresh rates from GitHub",
            currentValue: getRatesUpdatedAt()
              ? `last: ${new Date(getRatesUpdatedAt()!).toLocaleDateString()}`
              : "never fetched",
            values: [getRatesUpdatedAt()
              ? `last: ${new Date(getRatesUpdatedAt()!).toLocaleDateString()}`
              : "never fetched"],
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
            if (id === "refresh-rates") {
              done(undefined); // close dialog first — fetchAndSaveCopilotRates is async
              ctx.ui.notify("Fetching rates from GitHub…", "info");
              void fetchAndSaveCopilotRates()
                .then(({ count, updatedAt }) => {
                  const date = new Date(updatedAt).toLocaleDateString();
                  ctx.ui.notify(`✅ Rates updated: ${count} models (${date})`, "info");
                  // Re-patch the /model picker with freshly fetched rates
                  if (activeCtx) void patchGithubCopilotRates(pi, activeCtx);
                })
                .catch((err: Error) => {
                  ctx.ui.notify(`❌ Failed to fetch rates: ${err.message}`, "error");
                });
              return;
            }
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
