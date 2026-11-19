/**
 * Telemetry — SD-style board issue fetch (link-aware) on top of the shared
 * SG jira-client. One Jira access layer for the whole app: this bridge adds
 * the digest engine's normalized issue shape (with blockingLinks) without
 * duplicating the defensive GET plumbing.
 */
import api, { route } from '@forge/api';

/** Issues of the board's active sprint, digest-shaped (falls back to board issues). */
export async function getBoardIssuesSd(boardId) {
  try {
    const sprintR = await api.asUser().requestJira(
      route`/rest/agile/1.0/board/${boardId}/sprint?${new URLSearchParams('state=active')}`
    );
    if (sprintR.status === 200) {
      const sprintJson = await sprintR.json();
      const sprint = (sprintJson.values || [])[0];
      if (sprint) {
        const issuesR = await api.asUser().requestJira(
          route`/rest/agile/1.0/sprint/${sprint.id}/issue?${new URLSearchParams({maxResults: '100', fields: 'summary,status,assignee,updated,created,statuscategorychangedate,issuelinks'})}`
        );
        if (issuesR.status === 200) {
          const issuesJson = await issuesR.json();
          return (issuesJson.issues || []).map(mapIssue);
        }
      }
    }
  } catch { /* fall through to board-level fetch */ }
  try {
    const r = await api.asUser().requestJira(
      route`/rest/agile/1.0/board/${boardId}/issue?${new URLSearchParams({maxResults: '100', fields: 'summary,status,assignee,updated,created,issuelinks'})}`
    );
    if (r.status === 200) {
      const json = await r.json();
      return (json.issues || []).map(mapIssue);
    }
  } catch { /* fall through */ }
  return [];
}

function mapIssue(raw) {
  const f = raw.fields || {};
  const links = Array.isArray(f.issuelinks) ? f.issuelinks : [];
  const blockingLinks = links
    .filter((l) => {
      const inward = String(l.type?.inward || '').toLowerCase();
      return inward.includes('blocked') && l.inwardIssue;
    })
    .map((l) => ({
      key: l.inwardIssue.key,
      resolved: Boolean(l.inwardIssue.fields?.resolutiondate),
    }));
  return {
    key: raw.key,
    summary: f.summary || '',
    status: (f.status && f.status.name) || '',
    statusCategory: f.status && f.status.statusCategory ? f.status.statusCategory.key : '',
    assignee: f.assignee && f.assignee.displayName ? f.assignee.displayName : 'Unassigned',
    updated: f.updated || '',
    created: f.created || '',
    blockingLinks,
  };
}
