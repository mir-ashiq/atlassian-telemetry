/**
 * Atlassian Telemetry — Forge entry point.
 * One app: sprint risk radar + standup digest + knowledge constellation.
 * Every action below is shared by the UI resolver, the Rovo agent and the
 * MCP server — one engine, three surfaces.
 */
import Resolver from '@forge/resolver';
import kvs from '@forge/kvs';
import { getAllBoards, getBoardIssuesSd } from './backend/jira-sd-bridge';
import {
  getAllBoards as sgGetAllBoards,
  createSubtask,
  postComment,
} from './backend/jira-client';
import { scanBoard, getTrend, getLatest, auditOne } from './backend/scan';
import { SIGNAL_CATALOG, explainSignal, LEVEL_META } from './backend/risk-engine';
import { buildDigest, renderDigest } from './backend/digest-engine';
import { seedDemoData as seedSg } from './backend/sg-seeder';
import { seedDemoData as seedSd } from './backend/sd-seeder';
import { seedDemoData as seedCo } from './backend/co-seeder';
import {
  userTeams, teamMembers, teamSpaces, spaceTeams, pagePeople,
} from './backend/twg-client';
import { searchPages } from './backend/confluence-client';

// ---------------------------------------------------------------------------
// Resolver (frontend bridge)
// ---------------------------------------------------------------------------
const resolver = new Resolver();

resolver.define('getBoards', async () => ({ boards: await sgGetAllBoards() }));

// Unified empty-site rescue: seeds BOTH the Jira demo project and the
// Confluence demo space in one click, so every tab lights up.
resolver.define('seedAll', async () => {
  const [jira, confluence] = await Promise.all([seedSg(), seedCo()]);
  return { jira, confluence };
});

resolver.define('getBoardState', async ({ payload }) => {
  const boardId = String(payload.boardId);
  const [latest, trend] = await Promise.all([getLatest(boardId), getTrend(boardId)]);
  return { latest, trend };
});

resolver.define('scanBoard', async ({ payload }) => {
  const result = await scanBoard(String(payload.boardId));
  return { summary: result.summary, audits: result.audits, scannedAt: result.scannedAt };
});

resolver.define('auditIssue', async ({ payload }) => auditOne(String(payload.issueKeyOrId)));

resolver.define('draftFollowUp', async ({ payload }) => {
  const result = await actDraftFollowUpTask(payload);
  const m = typeof result === 'string' ? result.match(/([A-Z][A-Z0-9]+-\d+)/) : null;
  return m ? { key: m[1] } : result;
});

resolver.define('getDigest', async ({ payload }) => {
  const boardId = String(payload.boardId || '');
  if (!boardId) return { error: 'No board specified.' };
  const sinceHours = Number(payload.sinceHours) || 24;
  const issues = await getBoardIssuesSd(boardId);
  if (!issues.length) return { error: 'No issues found on this board (or no active sprint).' };
  const digest = buildDigest(issues, Date.now(), sinceHours);
  try { await kvs.set(`digest:${boardId}`, { at: digest.generatedAt, sinceHours, digest }); } catch {}
  return { digest, text: renderDigest(digest) };
});

resolver.define('getMyTeams', async (req) => {
  const ari = req?.context?.accountId ? `ari:cloud:identity::user/${req.context.accountId}` : null;
  if (!ari) return { error: 'No user in context.' };
  const teams = await userTeams(ari);
  if (teams.error) return teams;
  return { ari, teams };
});

resolver.define('getTeamDetail', async ({ payload }) => {
  const teamAri = String(payload.teamAri || '');
  if (!teamAri) return { error: 'No team specified.' };
  const [members, spaces] = await Promise.all([teamMembers(teamAri), teamSpaces(teamAri)]);
  return { teamAri, members: members.error ? [] : members, spaces: spaces.error ? [] : spaces };
});

resolver.define('getPagePeople', async ({ payload }) => {
  const contentId = String(payload.contentId || '');
  if (!contentId) return { error: 'No page specified.' };
  return pagePeople(contentId);
});

resolver.define('whoToAsk', async ({ payload }) => whoToAsk(String(payload.topic || '')));

export const handler = resolver.getDefinitions();

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------
export async function onIssueCreated(event) {
  try {
    const issue = event?.issue ?? event?.data?.issue;
    if (!issue || !issue.id) return;
    console.log(`Telemetry saw new issue ${issue.key ?? issue.id}`);
  } catch (e) {
    console.error('onIssueCreated failed', String(e));
  }
}

/** Hourly: refresh risk snapshots (up to 3 boards) + digest caches. */
export async function hourlyRefresh() {
  try {
    const boards = await sgGetAllBoards();
    for (const board of boards.slice(0, 3)) {
      await scanBoard(String(board.id));
      const issues = await getBoardIssuesSd(String(board.id));
      if (issues.length) {
        const digest = buildDigest(issues);
        try { await kvs.set(`digest:${board.id}`, { at: digest.generatedAt, digest }); } catch {}
      }
    }
  } catch (e) {
    console.error('hourlyRefresh failed', String(e));
  }
}

// ---------------------------------------------------------------------------
// Rovo agent / MCP actions — risk radar
// ---------------------------------------------------------------------------
function boardIdFromContextOrInput(payload) {
  return payload?.boardId || payload?.context?.board?.id || null;
}

export async function actGetSprintSnapshot(payload) {
  const boardId = boardIdFromContextOrInput(payload);
  if (!boardId) return 'No board specified. Ask the user which board, or open the app on a board first.';
  const { summary, scannedAt } = await scanBoard(String(boardId));
  const meta = LEVEL_META[summary.overall] || LEVEL_META.low;
  return [
    `${meta.emoji} ${meta.label} — sprint "${summary.sprint?.name || 'unknown'}"`,
    `Issues: ${summary.issueCount} | avg risk: ${summary.avgScore} | overall: ${summary.overall}`,
    `Top risks: ${Object.entries(summary.bySignal).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, c]) => `${s} x${c}`).join(', ') || 'none'}`,
    `Highest-risk issues: ${summary.topIssues.map((t) => `${t.key} (${t.score})`).join(', ') || 'none'}`,
    `Scanned at ${scannedAt}`,
  ].join('\n');
}

export async function actAuditIssue(payload) {
  const keyOrId = payload?.issueKeyOrId || payload?.context?.jira?.issueKey;
  if (!keyOrId) return 'No issue specified for the audit.';
  const report = await auditOne(String(keyOrId));
  if (report.error) return report.error;
  const meta = LEVEL_META[report.level] || LEVEL_META.low;
  return [
    `${meta.emoji} ${meta.label} — ${report.issue.key}: ${report.issue.summary}`,
    ...report.findings.map((f) => `- ${f.signal} (${f.severity}): ${f.evidence} -> ${f.suggestedAction}`),
    `Score: ${report.score}`,
  ].join('\n');
}

export async function actExplainRiskSignal(payload) {
  const info = explainSignal(String(payload?.signal || ''));
  if (!info) return `Unknown signal. Known: ${Object.keys(SIGNAL_CATALOG).join(', ')}`;
  return `${info.signal} (${info.severity}, weight ${info.weight})\n${info.description}\nDetection: ${info.detection}\nRemediation: ${info.remediation}`;
}

export async function actRunBoardScan(payload) {
  const boardId = boardIdFromContextOrInput(payload);
  if (!boardId) return 'No board specified.';
  const { summary, scannedAt } = await scanBoard(String(boardId));
  return `Scan complete at ${scannedAt}. ${summary.issueCount} issues, avg risk ${summary.avgScore}, overall ${summary.overall}. Top signal: ${Object.entries(summary.bySignal).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none'}.`;
}

export async function actDraftFollowUpTask(payload) {
  const parentKey = payload?.parentIssueKey || payload?.context?.jira?.issueKey;
  if (!parentKey) return 'No parent issue specified.';
  const findings = [];
  try {
    if (payload?.findingsJson) findings.push(...JSON.parse(payload.findingsJson));
  } catch { /* tolerate malformed JSON from the LLM */ }
  const description = [
    `Created by Telemetry for risk signal: ${payload?.riskSignal || 'general'}`,
    '',
    ...(findings.length ? findings.map((f) => `- [${f.severity || '?'}] ${f.signal || f}`) : ['(no structured findings provided)']),
    '',
    'Review and adjust before starting work.',
  ];
  const result = await createSubtask(parentKey, payload?.summary || 'Follow-up', description);
  if (result.error) return `Could not create subtask: ${result.error}`;
  return `Created follow-up subtask ${result.key} under ${parentKey}.`;
}

export async function actAnnotateIssue(payload) {
  const keyOrId = payload?.issueKeyOrId || payload?.context?.jira?.issueKey;
  if (!keyOrId) return 'No issue specified.';
  let report = null;
  try { report = payload?.reportJson ? JSON.parse(payload.reportJson) : null; } catch { report = null; }
  if (!report) report = await auditOne(String(keyOrId));
  if (report.error) return report.error;
  const meta = LEVEL_META[report.level] || LEVEL_META.low;
  const bulletLines = report.findings.map((f) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `${f.severity === 'high' ? '🔴' : f.severity === 'medium' ? '🟡' : '🟢'} ${f.signal} — ${f.evidence} → ${f.suggestedAction}` }],
  }));
  const adf = {
    type: 'doc', version: 1,
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: `${meta.emoji} Telemetry audit — ${meta.label} (score ${report.score})` }] },
      ...bulletLines,
      { type: 'paragraph', content: [{ type: 'text', text: 'Ask the Telemetry agent to draft a follow-up task for any finding.' }] },
    ],
  };
  const result = await postComment(String(keyOrId), adf);
  if (result.error) return `Could not post comment: ${result.error}`;
  return `Risk report posted as a comment on ${report.issue?.key || keyOrId}.`;
}

// ---------------------------------------------------------------------------
// Rovo agent / MCP actions — standup digest
// ---------------------------------------------------------------------------
export async function actGetStandupDigest(payload) {
  const boardId = boardIdFromContextOrInput(payload);
  if (!boardId) return 'No board specified. Ask the user which board, or open Telemetry first.';
  const issues = await getBoardIssuesSd(String(boardId));
  if (!issues.length) return 'No issues found on this board.';
  const digest = buildDigest(issues);
  return renderDigest(digest);
}

export async function actGetBlockers(payload) {
  const boardId = boardIdFromContextOrInput(payload);
  if (!boardId) return 'No board specified.';
  const issues = await getBoardIssuesSd(String(boardId));
  const blockers = issues.filter(
    (i) => /block/i.test(i.status) || (Array.isArray(i.blockingLinks) && i.blockingLinks.some((l) => !l.resolved))
  );
  if (!blockers.length) return 'No blocked issues on this board. 🎉';
  return blockers.map((b) => `${b.key}: ${b.summary} (${b.assignee})`).join('\n');
}

// ---------------------------------------------------------------------------
// Rovo agent / MCP actions — knowledge constellation
// ---------------------------------------------------------------------------
export async function actGetPagePeople(payload) {
  const contentId = payload?.contentId || payload?.context?.confluence?.contentId;
  if (!contentId) return 'No page specified. Ask the user to open the page, or use who-to-ask with the topic.';
  const r = await pagePeople(String(contentId));
  if (r.error) return r.error;
  const lines = [];
  if (r.creator) lines.push(`Creator: ${r.creator.displayName}`);
  if (r.owners?.length) lines.push(`Owners: ${r.owners.map((u) => u.displayName).join(', ')}`);
  if (r.contributors?.length) lines.push(`Recent contributors: ${r.contributors.map((u) => u.displayName).join(', ')}`);
  return lines.length ? lines.join('\n') : 'No people data found for this page.';
}

export async function actWhoToAsk(payload) {
  const topic = payload?.topic || payload?.context?.confluence?.pageTitle;
  if (!topic) return 'No topic specified.';
  const r = await whoToAsk(String(topic));
  if (r.error) return r.error;
  if (!r.people.length) return `No page matches "${topic}" — try a different keyword.`;
  const lines = [`For "${topic}", the best people to ask are:`];
  r.people.slice(0, 3).forEach((p, i) => lines.push(`${i + 1}. ${p.displayName} — ${p.reason}`));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Core: who-to-ask ranking (pure, testable)
// ---------------------------------------------------------------------------
export async function whoToAsk(topic) {
  const pages = await searchPages(topic, 10);
  if (!pages.length) return { people: [] };
  const people = new Map();
  const topPages = pages.slice(0, 5);
  const peopleByPage = await Promise.all(topPages.map((p) => pagePeople(p.contentId)));
  for (let i = 0; i < topPages.length; i++) {
    const p = topPages[i];
    const pp = peopleByPage[i];
    if (pp.error) continue;
    const add = (u, reason, weight) => {
      if (!u) return;
      const key = u.ari || u.displayName;
      const cur = people.get(key) || { displayName: u.displayName, ari: u.ari, score: 0, reasons: new Set() };
      cur.score += weight;
      cur.reasons.add(`${p.title} (${reason})`);
      people.set(key, cur);
    };
    add(pp.creator, 'creator', 2);
    (pp.owners || []).forEach((u) => add(u, 'owner', 3));
    (pp.contributors || []).forEach((u) => add(u, 'contributor', 1));
  }
  const ranked = [...people.values()].sort((a, b) => b.score - a.score).map((p) => ({
    displayName: p.displayName, ari: p.ari, reason: [...p.reasons].slice(0, 2).join('; '), score: p.score,
  }));
  return { people: ranked };
}
