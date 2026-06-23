/**
 * Custom Footer Extension (@guneriu/pi-footer)
 *
 * Replaces pi's default footer with a two-line layout:
 *   LINE 1: path (branch) · session-name
 *   LINE 2: ↑input ↓output 💾CH%  [ctx-bar] ctx%/window  $cost [↳$sub]  🤖quota  model · 🧠level
 *
 * Cost display: reads usage.cost.total directly from pi session data (accurate,
 * includes all token types — input, output, cacheRead, cacheWrite/thinking).
 * Credit-format conversion and subagent breakdown (↳) provided by co-installed
 * @guneriu/pi-copilot-quota extension.
 *
 * Thinking level indicators: 💭 min · 🤔 low · 🧠 med · 🔥 high · ⚡ max
 *
 * Commands:
 *   /custom-footer  — toggle enhanced footer on/off (restores pi's default when off)
 *
 * Settings: <agentDir>/extensions/pi-footer/settings.json
 */

import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { calculateSessionCopilotCost, calculateSubagentsCopilotCost, formatSessionCopilotCostDisplay } from "../../copilot-quota/extensions/copilot-quota";

const HOME = homedir();

/** Replace leading home dir with ~ */

function shortenPath(p: string): string {
  return p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function getSettingsFile(): string {
  const dir = join(getAgentDir(), "extensions", "pi-footer");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

interface FooterSettings {
  enabled: boolean;
}

const DEFAULTS: FooterSettings = { enabled: true };

function loadSettings(): FooterSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(getSettingsFile(), "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: FooterSettings): void {
  try {
    writeFileSync(getSettingsFile(), JSON.stringify(s, null, 2), "utf-8");
  } catch {
    // non-fatal
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/** Compact number: 92 → "92", 44000 → "44k", 4_400_000 → "4.4M" */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

// ─── Thinking level config ────────────────────────────────────────────────────

const THINKING: Record<string, { emoji: string; label: string; color: string }> = {
  minimal: { emoji: "💭", label: "min",  color: "muted"   },
  low:     { emoji: "🤔", label: "low",  color: "dim"     },
  medium:  { emoji: "🧠", label: "med",  color: "accent"  },
  high:    { emoji: "🔥", label: "high", color: "warning" },
  xhigh:   { emoji: "⚡", label: "max",  color: "error"   },
};

function contextColor(pct: number | null): string {
  if (pct === null) return "dim";
  if (pct < 50) return "success";
  if (pct < 80) return "warning";
  return "error";
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Hold TUI reference for imperative re-renders
  let storedTui: { requestRender(): void } | undefined;

  function applyFooter(ctx: any, piApi: ExtensionAPI): void {
    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      storedTui = tui;
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          unsub();
          storedTui = undefined;
        },

        invalidate() {},

        render(width: number): string[] {
          // ── Single branch snapshot ────────────────────────────────
          const branch = ctx.sessionManager.getBranch();

          // ── Accumulate token totals for footer display ─────────────────
          let input = 0;
          let output = 0;
          let cacheRead = 0;
          let cacheWrite = 0;

          for (const e of branch) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input     += m.usage.input;
              output    += m.usage.output;
              cacheRead  += m.usage.cacheRead;
              cacheWrite += m.usage.cacheWrite;
            }
          }

          // ── Copilot cost (uses pi's usage.cost.total — already correct) ───
          // Pi registers official GitHub Copilot rates for the github-copilot
          // provider, so usage.cost.total is accurate Copilot billing in $.
          // Plugin value: credits display mode + quota chip + subagent breakdown.
          const copilotCost = calculateSessionCopilotCost(branch as any);
          const subagentCost = calculateSubagentsCopilotCost(branch as any);
          const costFormatted = formatSessionCopilotCostDisplay(copilotCost, subagentCost);
          const costStr = costFormatted ? theme.fg("dim", costFormatted) : "";

          // ── Cache hit ratio ─────────────────────────────────────────────
          const totalIn = input + cacheRead + cacheWrite;
          const cacheHitPct = totalIn > 0 ? (cacheRead / totalIn) * 100 : null;
          const cacheStr = cacheHitPct !== null
            ? theme.fg("warning", `💾 CH${cacheHitPct.toFixed(1)}%`)
            : "";

          // ── Context window usage (with mini bar) ──────────────────────
          const ctxUsage = ctx.getContextUsage?.();
          let ctxStr = "";
          if (ctxUsage) {
            const pct    = ctxUsage.percent ?? 0;
            const filled = Math.min(6, Math.max(0, Math.round((pct / 100) * 6)));
            const bar    = "█".repeat(filled) + "░".repeat(6 - filled);
            const color  = contextColor(ctxUsage.percent);
            const label  = ctxUsage.percent !== null
              ? `${ctxUsage.percent.toFixed(1)}%/${fmt(ctxUsage.contextWindow)}`
              : `?/${fmt(ctxUsage.contextWindow)}`;
            ctxStr = theme.fg(color, `[${bar}] ${label}`);
          }

          // ── Copilot quota — read from copilot-quota extension's chip ────
          // copilot-quota.ts calls setStatus("copilot-quota", ...) which
          // surfaces here. Already styled with ANSI codes; embed as-is.
          const quotaChip = footerData.getExtensionStatuses().get("copilot-quota") ?? "";

          // ── LEFT: ↑input  ↓output  💾CH%  context  🤖quota ─────────────
          const left = [
            theme.fg("accent",  `↑${fmt(input)}`),
            theme.fg("success", `↓${fmt(output)}`),
            cacheStr,
            ctxStr,
            costStr,
            quotaChip,
          ]
            .filter(Boolean)
            .join("  ");

          // ── RIGHT: model · thinking ────────────────────────────────
          const level   = (piApi as any).getThinkingLevel?.() ?? "medium";
          const cfg     = THINKING[level];
          const modelId = ctx.model?.name ?? ctx.model?.id ?? "";

          const right = ctx.model?.reasoning === false
            // Model doesn't support thinking — just show model name in dim
            ? theme.fg("dim", modelId)
            // Thinking model — model name first, then colored indicator
            : theme.fg("dim", `${modelId} · `) +
              theme.fg(cfg?.color ?? "dim", `${cfg?.emoji ?? ""} ${cfg?.label ?? level}`);

          // ── Line 1: path  🌿 branch (inline, left-aligned) ────────────────
          const pathStr    = theme.fg("dim", shortenPath(process.cwd()));
          const gitBranch  = footerData.getGitBranch();
          const branchStr  = gitBranch ? theme.fg("dim", " (") + theme.fg("success", gitBranch) + theme.fg("dim", ")") : "";
          const sessionName = pi.getSessionName?.();
          const sessionStr  = sessionName ? theme.fg("dim", " · ") + theme.fg("muted", sessionName) : "";
          const line1       = truncateToWidth(pathStr + branchStr + sessionStr, width);

          // ── Line 2: tokens (left)  thinking+model (right) ───────────────
          const gap2 = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
          const line2 = truncateToWidth(left + " ".repeat(gap2) + right, width);

          return [line1, line2];
        },
      };
    });
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  let pollTimer: ReturnType<typeof setInterval> | undefined;

  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    if (loadSettings().enabled) {
      applyFooter(ctx, pi);
      clearInterval(pollTimer);
      pollTimer = setInterval(() => { storedTui?.requestRender(); }, 1000);
    }
  });

  pi.on("session_shutdown", async () => {
    clearInterval(pollTimer);
    pollTimer = undefined;
    storedTui = undefined;
  });

  // Event-based triggers for immediate response when events do fire
  pi.on("turn_end",              async () => { storedTui?.requestRender(); });
  pi.on("turn_start",            async () => { storedTui?.requestRender(); });
  pi.on("thinking_level_select", async () => { storedTui?.requestRender(); });
  pi.on("model_select",          async () => { storedTui?.requestRender(); });
  pi.on("message_start",         async () => { storedTui?.requestRender(); });

  // ── /custom-footer toggle ─────────────────────────────────────────────────

  pi.registerCommand("custom-footer", {
    description: "Toggle custom footer on/off (off restores pi's default)",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("/custom-footer requires TUI mode", "error");
        return;
      }

      const settings = loadSettings();
      settings.enabled = !settings.enabled;
      saveSettings(settings);

      if (settings.enabled) {
        applyFooter(ctx, pi);
        clearInterval(pollTimer);
        pollTimer = setInterval(() => { storedTui?.requestRender(); }, 1000);
        ctx.ui.notify("Custom footer enabled", "info");
      } else {
        ctx.ui.setFooter(undefined);
        clearInterval(pollTimer);
        pollTimer = undefined;
        ctx.ui.notify("Default footer restored", "info");
      }
    },
  });
}
