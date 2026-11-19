# Devpost submission draft — Atlassian Telemetry (win-grade, ready to paste)

## Title
Telemetry — risk radar, standup digest, and knowledge constellation in one

## Elevator pitch (≤ 200 chars; 194 chars)
One Forge app answering the three questions every delivery team asks: what's risky (7-signal Jira radar), what moved (standup digest), and who to ask (Teamwork Graph people ranking) — one agent, one MCP server.

## Inspiration
Every team I've been on lost sprints the same three ways: risk invisible until retro, standups burning fifteen minutes on roll call, and knowledge locked behind "who do I ask about X?" I built each of those answers as its own app first — a risk radar, a standup digest, a knowledge constellation — and kept noticing they share everything: the same Jira data, the same people, the same agent surface. Telemetry is what they become when they stop being three apps: one agent that can answer "what's risky, whose standup does it hit, and who should I ask about that area?" in a single conversation.

## What it does
- **Risk Radar** (Jira issue panel): instant audit with 7 deterministic signals — missing acceptance criteria, unestimated work, stale-in-progress, overdue sprint items, review load, blocking dependencies, scope churn — each with evidence and one-click "Draft follow-up".
- **Command Center** (Jira global page): board scans with signal rollup, top-risk issues, and a KVS-persisted risk trend; plus the **Standup tab** — a per-person digest of what moved, what's next, who's blocked, with a 24/48/72-hour window and copy-to-clipboard.
- **Constellation** (Confluence global page + page byline): your teams, their members, their linked spaces, live from the Atlassian Teamwork Graph; "who to ask" ranks the people behind any topic (owners weighted above contributors).
- **Telemetry agent** (rovo:agent): one agent with 10 actions spanning all three engines, two skill playbooks (risk audit, remediation) keeping it disciplined.
- **MCP server** (rovo:mcp): all 10 tools exposed for Rovo Studio custom agents and third-party MCP clients.
- **One-click demo content**: on a brand-new empty site, one click seeds a tuned demo sprint (every risk signal fires, including a real Blocks link) AND a demo Confluence space (4 owner-tagged pages) — the whole app lights up in a minute.

## How I built it
Forge (UI Kit global pages + issue panel + byline item, resolver, triggers, scheduled jobs), one Rovo agent with 10 actions and 2 skills, one MCP server, Jira REST v3 (search/jql with legacy fallback, agile sprints, changelog churn, subtasks, ADF comments, issue links), Bitbucket dev-status for review load, KVS for risk trends and digest caches, Confluence CQL search, and Teamwork Graph curated GraphQL queries (user teams, team members/spaces, page creator/owners/contributors). The three engines — risk, digest, who-to-ask ranking — are pure and unit-tested (40 tests), and every surface (panels, pages, agent, MCP) calls the same engines.

## Challenges I ran into
Merging three apps taught me where "shared" really lives: the Jira client had two defensive GET layers that had to become one; blocking-link detection had to read both link directions to fire on real boards; and the demo seeders had to unify so one click populates Jira and Confluence without either half failing the other. The Teamwork Graph is in Preview — curated queries only, partial data on missing scopes — so every graph surface degrades gracefully with a scope hint instead of an empty screen.

## Accomplishments I'm proud of
One agent that spans risk, standups and org-chart questions — and every answer carries evidence (issue keys, signal thresholds, page titles) rather than vibes. All 40 unit tests cover the three pure engines. And the judge path is one click: install, generate demo content, and every surface has something real to show within a minute.

## What I learned
Three small apps share more than they don't. The hard part of merging wasn't the code — it was deciding what stays separate (three pure engines) and what unifies (one agent, one MCP server, one seeder). Rovo's action-verb rules (GET-only for automation-invoked agents) reshaped the safety model in a good way.

## What's next for Telemetry
A Slack/Teams morning briefing that fuses all three (top risks + digest + "ask X about Y"), per-team threshold tuning, knowledge-health scores per space, and Teamwork Graph ingestion so risk signals can span tools.

## Built with (tags)
forge, atlassian, jira, confluence, teamwork-graph, rovo, mcp, ai-agents, react, nodejs, kvs, bitbucket, developer-tools

## Try it out link
https://github.com/mir-ashiq/atlassian-telemetry

## Testing instructions (Step 3 field)
1) Click the installation link and approve the app on your Atlassian site, granting ALL requested scopes (the Teamwork Graph ones are load-bearing; works on free sites). 2) Open Jira → Apps → Telemetry. EMPTY SITE? Click "Generate demo content" — one click seeds a demo sprint AND a demo Confluence space — then "Scan now" for the full risk radar and the Standup tab for the digest. 3) Open any Jira issue — the Risk Radar panel shows its audit with one-click follow-up drafting. 4) Open Confluence → Apps → Telemetry for the constellation and "who to ask" (give the graph ~a minute to index demo pages), and any page's byline chip for its people. 5) Rovo Chat → Browse agents → Telemetry → "What are the biggest risks in my current sprint?" / "Give me today's standup digest" / "Who should I ask about onboarding?" Note: if Rovo chat is not visible on a free site, all UI surfaces still work fully. The app is read-only by default; writes only happen on explicit user action, and the seeder only creates its own labeled project/space.

## Technology requirement (Step 3 field)
Telemetry is one Forge app: manifest.yml declares jira:globalPage, jira:issuePanel, confluence:globalPage, confluence:contentBylineItem, a rovo:agent with 10 actions, 2 rovo:skill playbooks, a rovo:mcp server exposing 10 tools, trigger and scheduledTrigger modules. It integrates deeply with Jira (REST v3 search/jql with legacy fallback, agile boards/sprints, issue changelog, subtasks, ADF comments, issue links, Bitbucket dev-status for review load) and with Confluence (CQL search, v2 content APIs) and the Atlassian Teamwork Graph (curated GraphQL queries). All three engines — risk, digest, who-to-ask — are pure and unit-tested (40 tests).

## Category + bonus
- Category: Apps for Software Teams
- Why this track: Telemetry lives in the sprint workflow where software teams already work: the issue view for risk, the board for standups, and the knowledge graph for "who do I ask". It turns three daily rituals into one command center.
- Bonus prize: Best Agents — Rovo/Assignable agents

## Forge experience / AI tools (Step 3 fields)
- Forge experience: One manifest describing panels, pages, byline, agent, skills, MCP tools and triggers is a genuinely great authoring model. KVS made trends and digest caches trivial. Friction: Jira's search API is mid-migration (I implemented both endpoints with transparent fallback); Rovo chat needs a provisioned site on free plans; and merging three apps meant unifying two defensive Jira layers that had drifted apart.
- AI tools used: An AI coding agent (GLM via z.ai) for scaffolding, implementation, unit tests and documentation; Atlassian developer documentation and the Forge CLI for API verification and deployment planning.
