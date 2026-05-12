// Thin wrapper around Apify's REST API. Three calls we need:
//   - startRun:        POST /v2/acts/{actor}/runs (returns immediately)
//   - getRun:          GET  /v2/actor-runs/{runId}
//   - getDatasetItems: GET  /v2/datasets/{datasetId}/items
//
// All take the API token explicitly so we don't accidentally rely on
// process.env. Token is fetched from app_settings inside route handlers.

const APIFY_BASE = 'https://api.apify.com/v2';

export type ApifyRunStatus =
  | 'READY'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'ABORTING'
  | 'ABORTED'
  | 'TIMING-OUT'
  | 'TIMED-OUT';

export interface ApifyRunMeta {
  id: string;
  status: ApifyRunStatus;
  defaultDatasetId: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ApifyApprovalRequired {
  approvalUrl: string;
}

export class ApifyError extends Error {
  http: number;
  bodyText: string;
  approvalUrl?: string;
  constructor(message: string, http: number, bodyText: string, approvalUrl?: string) {
    super(message);
    this.http = http;
    this.bodyText = bodyText;
    this.approvalUrl = approvalUrl;
  }
}

function pickApprovalUrl(bodyText: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const errObj = (parsed.error ?? parsed) as Record<string, unknown>;
    const data = errObj?.data as Record<string, unknown> | undefined;
    if (data && typeof data.approvalUrl === 'string') return data.approvalUrl;
  } catch {
    // not json
  }
  return undefined;
}

/**
 * Fire an Apify actor run asynchronously. Returns ~1s with the run id;
 * the actor itself runs in Apify's cloud and may take many minutes.
 */
export async function apifyStartRun(
  actor: string,
  input: unknown,
  token: string,
): Promise<ApifyRunMeta> {
  const url = `${APIFY_BASE}/acts/${actor}/runs?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ApifyError(
      `apify start: ${res.status}`,
      res.status,
      text,
      pickApprovalUrl(text),
    );
  }
  const body = JSON.parse(text) as { data?: ApifyRunMeta };
  if (!body.data?.id) throw new ApifyError('apify start: missing run id', 502, text);
  return body.data;
}

export async function apifyGetRun(
  runId: string,
  token: string,
): Promise<ApifyRunMeta> {
  const url = `${APIFY_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(8_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ApifyError(`apify get-run: ${res.status}`, res.status, text);
  }
  const body = JSON.parse(text) as { data?: ApifyRunMeta };
  if (!body.data) throw new ApifyError('apify get-run: missing data', 502, text);
  return body.data;
}

export async function apifyGetDatasetItems<T = unknown>(
  datasetId: string,
  token: string,
): Promise<T[]> {
  const url =
    `${APIFY_BASE}/datasets/${encodeURIComponent(datasetId)}/items` +
    `?token=${encodeURIComponent(token)}&clean=true&format=json`;
  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ApifyError(`apify dataset: ${res.status}`, res.status, text);
  }
  return JSON.parse(text) as T[];
}

export function isTerminalApifyStatus(s: ApifyRunStatus): boolean {
  return s === 'SUCCEEDED' || s === 'FAILED' || s === 'ABORTED' || s === 'TIMED-OUT';
}
