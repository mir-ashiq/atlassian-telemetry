/**
 * Atlassian Telemetry — UI Kit frontend.
 * One resource, four surfaces:
 *  - jira:globalPage            → Command Center (Risk + Digest tabs)
 *  - jira:issuePanel            → Risk Radar
 *  - confluence:globalPage      → Constellation (teams + who-to-ask)
 *  - confluence:contentBylineItem → Page People chip
 */
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Text, Heading, Box, Stack, Inline, Button, Lozenge, SectionMessage, Spinner,
  Link, Textfield, useProductContext,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const LEVEL_EMOJI = { low: '🟢', medium: '🟡', high: '🔴' };
const SIGNAL_LABELS = {
  'missing-acceptance-criteria': 'Missing acceptance criteria',
  'unestimated-work': 'Unestimated work',
  'stale-in-progress': 'Stale in progress',
  'overdue-sprint-item': 'Overdue sprint item',
  'review-load': 'Review load',
  'blocking-dependency': 'Blocking dependency',
  'scope-churn': 'Scope churn',
};
const label = (sig) => SIGNAL_LABELS[sig] || sig;

// ---------------------------------------------------------------------------
// Risk tab (from Sprint Guardian)
// ---------------------------------------------------------------------------
function SignalRow({ f, onDraft }) {
  return (
    <Stack space="small" xcss={{ backgroundColor: 'elevation.surface.sunken', padding: 'space.150', borderRadius: '3px' }}>
      <Inline space="space.100" grow="fill" blockAlign="center">
        <Lozenge appearance={f.severity === 'high' ? 'removed' : f.severity === 'medium' ? 'new' : 'default'}>{f.severity}</Lozenge>
        <Text weight="medium">{label(f.signal)}</Text>
      </Inline>
      <Text size="small" as="p">{f.evidence}</Text>
      <Text size="small" as="p">→ {f.suggestedAction}</Text>
      {onDraft && <Button appearance="primary" spacing="compact" onClick={() => onDraft(f)}>Draft follow-up</Button>}
    </Stack>
  );
}

function AuditView({ issueKey }) {
  const [report, setReport] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { invoke('auditIssue', { issueKeyOrId: issueKey }).then(setReport); }, [issueKey]);
  if (!report) return <Spinner size="medium" label="Auditing…" />;
  if (report.error) return <SectionMessage appearance="warning" title="Audit unavailable"><Text as="p">{report.error}</Text></SectionMessage>;
  const draft = async (f) => {
    const res = await invoke('draftFollowUp', {
      parentIssueKey: issueKey,
      summary: `Address ${f.signal} on ${issueKey}`,
      riskSignal: f.signal,
      findingsJson: JSON.stringify([f]),
    });
    setMsg(res);
  };
  return (
    <Stack space="space.200">
      <Inline space="space.100" blockAlign="center" grow="fill">
        <Text size="large" weight="semibold">{LEVEL_EMOJI[report.level]} {report.level.toUpperCase()} RISK</Text>
        <Lozenge>score {report.score}</Lozenge>
        <Text size="small">{report.findings.length} signals</Text>
      </Inline>
      {report.findings.length === 0 && <SectionMessage appearance="success" title="Clean"><Text as="p">No risk signals detected. Ship with confidence.</Text></SectionMessage>}
      {report.findings.map((f) => <SignalRow key={f.signal} f={f} onDraft={draft} />)}
      {msg && (
        <SectionMessage appearance="info" title="Action">
          <Text as="p">{typeof msg === 'object' && msg.key ? <>Created <Link href={`/browse/${msg.key}`}>{msg.key}</Link>.</> : String(msg)}</Text>
        </SectionMessage>
      )}
    </Stack>
  );
}

function Sparkline({ points }) {
  if (!points || points.length < 2) return null;
  const w = 160, h = 28, max = Math.max(...points, 1);
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - (p / max) * (h - 4) - 2).toFixed(1)}`).join(' ');
  return <svg width={w} height={h} style={{ verticalAlign: 'middle' }} aria-label="risk trend"><path d={d} fill="none" stroke="#DE350B" strokeWidth="2" /></svg>;
}

function RiskTab() {
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState(null);

  const loadBoards = () => {
    invoke('getBoards').then((r) => {
      setBoards(r.boards || []);
      if (r.boards?.length) setBoardId(String(r.boards[0].id));
    });
  };
  useEffect(loadBoards, []);
  useEffect(() => { if (boardId) invoke('getBoardState', { boardId }).then(setState); }, [boardId]);

  const seedAll = async () => {
    setSeeding(true); setSeedMsg(null);
    try {
      const r = await invoke('seedAll');
      const j = r.jira?.error ? `Jira seeding failed: ${r.jira.error}` : `Created ${r.jira?.issueCount ?? 0} demo issues`;
      const c = r.confluence?.error ? `Confluence seeding failed: ${r.confluence.error}` : `created ${r.confluence?.pageCount ?? 0} demo pages`;
      setSeedMsg(`${j}, ${c}. Boards appear below in a moment…`);
      setBoardId(null); loadBoards();
      setTimeout(loadBoards, 4000); setTimeout(loadBoards, 9000); setTimeout(loadBoards, 15000);
    } finally { setSeeding(false); }
  };

  const scanNow = async () => {
    setBusy(true);
    const r = await invoke('scanBoard', { boardId });
    setState((s) => ({ ...s, latest: { at: r.scannedAt, summary: r.summary } }));
    setBusy(false);
  };

  const s = state?.latest?.summary;
  return (
    <Stack space="space.250">
      <Inline space="space.100" wrap="wrap">
        {boards.map((b) => (
          <Button key={b.id} appearance={String(b.id) === boardId ? 'primary' : 'default'} spacing="compact" onClick={() => setBoardId(String(b.id))}>{b.name}</Button>
        ))}
      </Inline>
      {boardId && <Button appearance="primary" isDisabled={busy} onClick={scanNow}>{busy ? 'Scanning…' : 'Scan now'}</Button>}
      {boards.length === 0 && !state && (
        <SectionMessage appearance="warning" title="Nothing on this site yet">
          <Text as="p">One click seeds BOTH a demo Jira sprint (tuned to trip every risk signal, with a real Blocks link) and a demo Confluence space (4 pages with owners) — the whole app lights up.</Text>
          <Button appearance="primary" isDisabled={seeding} onClick={seedAll}>{seeding ? 'Seeding demo data…' : 'Generate demo content'}</Button>
          {seedMsg && <Text as="p" size="small">{seedMsg}</Text>}
        </SectionMessage>
      )}
      {!s && state && boards.length > 0 && (
        <SectionMessage appearance="information" title="No scan yet"><Text as="p">Click “Scan now” to audit the active sprint.</Text></SectionMessage>
      )}
      {s && (
        <Stack space="space.200">
          <Inline space="space.200" blockAlign="center">
            <Text size="xlarge" weight="semibold">{LEVEL_EMOJI[s.overall]} {s.overall.toUpperCase()}</Text>
            <Text>sprint “{s.sprint?.name || '—'}” · {s.issueCount} issues · avg risk {s.avgScore}</Text>
          </Inline>
          <Heading as="h4">Signals across the board</Heading>
          <Stack space="space.050">
            {Object.entries(s.bySignal).sort((a, b) => b[1] - a[1]).map(([sig, n]) => (
              <Inline key={sig} space="space.100" blockAlign="center"><Lozenge>{n}×</Lozenge><Text>{label(sig)}</Text></Inline>
            ))}
            {Object.keys(s.bySignal).length === 0 && <Text>No signals — clean sprint.</Text>}
          </Stack>
          <Heading as="h4">Highest-risk issues</Heading>
          <Stack space="space.050">
            {s.topIssues.map((t) => (
              <Inline key={t.key} space="space.100" blockAlign="center">
                <Lozenge appearance={t.score >= 5 ? 'removed' : 'new'}>{t.score}</Lozenge>
                <Link href={`/browse/${t.key}`}><Text weight="medium">{t.key}</Text></Link>
                <Text size="small">{t.summary}</Text>
              </Inline>
            ))}
          </Stack>
          <Inline space="space.150" blockAlign="center">
            <Text size="small" as="p">Trend ({(state?.trend || []).length} snapshots):</Text>
            <Sparkline points={(state?.trend || []).slice(-14).map((p) => p.avgScore)} />
          </Inline>
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Digest tab (from Standup Digest)
// ---------------------------------------------------------------------------
function PersonRow({ person }) {
  const keys = (arr) => arr.map((k) => <Link key={k} href={`/browse/${k}`}>{k}</Link>).reduce((acc, el) => acc === null ? [el] : [...acc, ', ', el], null);
  return (
    <Stack space="space.050" xcss={{ backgroundColor: 'elevation.surface.sunken', padding: 'space.150', borderRadius: '3px' }}>
      <Inline space="space.100" blockAlign="center" grow="fill">
        <Text weight="semibold">{person.name}</Text>
        {person.blocked.length > 0 && <Lozenge appearance="removed">blocked</Lozenge>}
      </Inline>
      {person.moved.length > 0 && <Text size="small" as="p">✅ moved: {keys(person.moved)}</Text>}
      {person.next.length > 0 && <Text size="small" as="p">➡️ next: {keys(person.next)}</Text>}
      {person.blocked.length > 0 && <Text size="small" as="p">⛔ blocked: {keys(person.blocked)}</Text>}
    </Stack>
  );
}

function DigestTab() {
  const [boards, setBoards] = useState([]);
  const [boardId, setBoardId] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sinceHours, setSinceHours] = useState(24);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke('getBoards').then((r) => {
      setBoards(r.boards || []);
      if (r.boards?.length) setBoardId(String(r.boards[0].id));
    });
  }, []);
  useEffect(() => { if (boardId) invoke('getDigest', { boardId, sinceHours }).then(setState); }, [boardId, sinceHours]);

  const refresh = async () => {
    setBusy(true);
    setState(await invoke('getDigest', { boardId, sinceHours }));
    setBusy(false);
  };
  const copyDigest = async () => {
    try {
      await navigator.clipboard.writeText(state?.text || '');
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard unavailable in some hosts */ }
  };

  const d = state?.digest;
  return (
    <Stack space="space.200">
      <Inline space="space.100" wrap="wrap">
        {boards.map((b) => (
          <Button key={b.id} appearance={String(b.id) === boardId ? 'primary' : 'default'} spacing="compact" onClick={() => setBoardId(String(b.id))}>{b.name}</Button>
        ))}
      </Inline>
      <Inline space="space.050" blockAlign="center">
        <Text size="small">Since:</Text>
        {[24, 48, 72].map((h) => (
          <Button key={h} appearance={sinceHours === h ? 'primary' : 'default'} spacing="compact" onClick={() => setSinceHours(h)}>{h}h</Button>
        ))}
        {state?.text && <Button spacing="compact" onClick={copyDigest}>{copied ? 'Copied!' : 'Copy digest text'}</Button>}
        {boardId && <Button appearance="primary" isDisabled={busy} onClick={refresh}>{busy ? 'Building…' : 'Refresh'}</Button>}
      </Inline>
      {!state && <Spinner label="Loading digest…" />}
      {state?.error && <SectionMessage appearance="warning" title="Digest unavailable"><Text as="p">{state.error}</Text></SectionMessage>}
      {d && (
        <Stack space="space.100">
          <Inline space="space.150" blockAlign="center">
            <Text>{d.personCount} people · {d.issueCount} issues</Text>
            {d.blockedCount > 0 && <Lozenge appearance="removed">{d.blockedCount} blocked</Lozenge>}
          </Inline>
          {d.people.map((p) => <PersonRow key={p.name} person={p} />)}
        </Stack>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Command Center (Jira global page): tabs
// ---------------------------------------------------------------------------
function CommandCenter() {
  const [tab, setTab] = useState('risk');
  return (
    <Stack space="space.250">
      <Inline space="space.200" blockAlign="center" grow="fill">
        <Heading as="h2">🔭 Telemetry Command Center</Heading>
        <Inline space="space.050">
          <Button appearance={tab === 'risk' ? 'primary' : 'default'} spacing="compact" onClick={() => setTab('risk')}>🛡️ Risk</Button>
          <Button appearance={tab === 'digest' ? 'primary' : 'default'} spacing="compact" onClick={() => setTab('digest')}>☀️ Standup</Button>
        </Inline>
      </Inline>
      {tab === 'risk' ? <RiskTab /> : <DigestTab />}
      <SectionMessage appearance="information" title="Talk to the agent">
        <Text as="p">In Rovo chat, ask Telemetry: “What are the biggest risks in my current sprint?”, “Give me today’s standup digest”, or “Who should I ask about onboarding?” — one agent, all three engines. All tools are also exposed over MCP for your own agents.</Text>
      </SectionMessage>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Constellation (Confluence global page) — from Constella
// ---------------------------------------------------------------------------
function PeopleChip({ label: l, people }) {
  if (!people || !people.length) return null;
  return (
    <Inline space="space.050" blockAlign="center">
      <Text size="small" weight="medium">{l}:</Text>
      {people.slice(0, 6).map((u) => <Lozenge key={u.ari || u.displayName}>{u.displayName}</Lozenge>)}
    </Inline>
  );
}

function PagePeopleView({ contentId }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (contentId) invoke('getPagePeople', { contentId }).then(setData); }, [contentId]);
  if (!data) return <Spinner size="small" label="Loading people…" />;
  if (data.error) return <SectionMessage appearance="warning" title="Teamwork Graph unavailable"><Text as="p">{String(data.error)}</Text></SectionMessage>;
  if (!data.creator && !data.owners?.length && !data.contributors?.length) {
    return <Text size="small">No people data in the graph for this page yet.</Text>;
  }
  return (
    <Stack space="space.050">
      <PeopleChip label="Created by" people={data.creator ? [data.creator] : []} />
      <PeopleChip label="Owners" people={data.owners} />
      <PeopleChip label="Recent contributors" people={data.contributors} />
    </Stack>
  );
}

function TeamDetail({ team, onBack }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => { invoke('getTeamDetail', { teamAri: team.ari }).then(setDetail); }, [team.ari]);
  if (!detail) return <Spinner label="Loading team…" />;
  return (
    <Stack space="space.150">
      <Inline space="space.100" blockAlign="center" grow="fill">
        <Heading as="h4">⭐ {team.displayName}</Heading>
        <Button spacing="compact" onClick={onBack}>← Back</Button>
      </Inline>
      <Heading as="h5">Members ({detail.members.length})</Heading>
      <Inline space="space.050" wrap="wrap">
        {detail.members.map((m) => <Lozenge key={m.ari}>{m.displayName}</Lozenge>)}
        {!detail.members.length && <Text size="small">No members found (check team privacy settings).</Text>}
      </Inline>
      <Heading as="h5">Linked spaces ({detail.spaces.length})</Heading>
      <Inline space="space.050" wrap="wrap">
        {detail.spaces.map((s) => <Lozenge key={s.ari}>{s.spaceType === 'confluence' ? '📄' : '🧭'} {s.title}</Lozenge>)}
        {!detail.spaces.length && <Text size="small">No linked spaces. Link one in the space's settings → Connect a team.</Text>}
      </Inline>
    </Stack>
  );
}

function Constellation() {
  const [myTeams, setMyTeams] = useState(null);
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState('');
  const [who, setWho] = useState(null);
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState(null);

  useEffect(() => { invoke('getMyTeams').then(setMyTeams); }, []);

  const seedDemo = async () => {
    setSeeding(true); setSeedMsg(null);
    try {
      const r = await invoke('seedAll');
      const c = r.confluence?.error ? `Confluence seeding failed: ${r.confluence.error}` : `created ${r.confluence?.pageCount ?? 0} demo pages`;
      setSeedMsg(`Seeded: ${c}. ${r.confluence?.note || ''}`);
    } finally { setSeeding(false); }
  };

  const search = async () => {
    setBusy(true);
    setWho(await invoke('whoToAsk', { topic }));
    setBusy(false);
  };

  return (
    <Stack space="space.200">
      <Heading as="h2">🔭 Telemetry — your team constellation</Heading>
      <SectionMessage appearance="information" title="What this shows">
        <Text as="p">Every team you belong to, its members, and its linked spaces — resolved live from the Atlassian Teamwork Graph. Open the byline item on any page for its people, or ask below who to consult about a topic.</Text>
      </SectionMessage>
      {!myTeams && <Spinner label="Resolving your teams from the graph…" />}
      {myTeams?.error && (
        <SectionMessage appearance="warning" title="Teamwork Graph unavailable">
          <Text as="p">{String(myTeams.error)}</Text>
          <Text as="p">This usually means the Teamwork Graph scopes (read:teamwork-graph:confluence / :jira) were not granted at install time. Reinstall and approve all requested permissions, then reload.</Text>
        </SectionMessage>
      )}
      {myTeams?.teams && !myTeams.teams.length && (
        <SectionMessage appearance="information" title="No teams found">
          <Text as="p">You don't belong to any Atlassian teams yet — create one in Team directory. Or seed demo content (a space with 4 owner-tagged pages) to try search and the byline:</Text>
          <Button appearance="primary" spacing="compact" isDisabled={seeding} onClick={seedDemo}>
            {seeding ? 'Seeding demo content…' : 'Generate demo content'}
          </Button>
          {seedMsg && <Text as="p" size="small">{seedMsg}</Text>}
        </SectionMessage>
      )}
      {selected ? <TeamDetail team={selected} onBack={() => setSelected(null)} /> : (
        <Stack space="space.100">
          {(myTeams?.teams || []).map((t) => (
            <Stack key={t.ari} space="space.050" xcss={{ backgroundColor: 'elevation.surface.sunken', padding: 'space.150', borderRadius: '3px' }}>
              <Inline space="space.100" grow="fill" blockAlign="center">
                <Text weight="semibold">⭐ {t.displayName}</Text>
                <Button spacing="compact" onClick={() => setSelected(t)}>Explore</Button>
              </Inline>
              {t.summary && <Text size="small" as="p">{t.summary}</Text>}
            </Stack>
          ))}
        </Stack>
      )}
      <Heading as="h4">🔎 Who should I ask?</Heading>
      <Inline space="space.100" blockAlign="center">
        <Textfield value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. onboarding, Q3 launch plan" />
        <Button appearance="primary" isDisabled={busy || !topic.trim()} onClick={search}>{busy ? 'Searching…' : 'Who to ask'}</Button>
      </Inline>
      {who && (who.error ? (
        <SectionMessage appearance="warning" title="Search unavailable"><Text as="p">{String(who.error)}</Text></SectionMessage>
      ) : who.people.length ? (
        <Stack space="space.050">
          {who.people.slice(0, 5).map((p, i) => (
            <Inline key={p.ari || i} space="space.100" blockAlign="center">
              <Lozenge appearance="new">#{i + 1}</Lozenge>
              <Text weight="medium">{p.displayName}</Text>
              <Text size="small" as="em">{p.reason}</Text>
            </Inline>
          ))}
        </Stack>
      ) : <Text size="small">No matches — try another keyword.</Text>)}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Root: surface routing
// ---------------------------------------------------------------------------
function App() {
  const context = useProductContext();
  const type = context?.type || '';
  if (type.startsWith('jira:issuePanel')) {
    const issueKey = context?.extension?.issue?.key;
    return (
      <Stack space="space.200">
        <Heading as="h4">🔭 Risk Radar</Heading>
        <Text size="small" as="p">Live audit of this issue — 7 deterministic signals with evidence. Open Apps → Telemetry for the Command Center (risk + standup).</Text>
        {issueKey ? <AuditView issueKey={issueKey} /> : <Text>Open on an issue to audit it.</Text>}
      </Stack>
    );
  }
  if (type.startsWith('confluence:contentBylineItem')) {
    const contentId = context?.extension?.content?.id;
    return (
      <Stack space="space.100">
        <Heading as="h5">🔭 Page people</Heading>
        {contentId ? <PagePeopleView contentId={String(contentId)} /> : <Text size="small">Open on a page.</Text>}
      </Stack>
    );
  }
  if (type.startsWith('confluence:globalPage')) return <Constellation />;
  return <CommandCenter />;
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
