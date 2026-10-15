// Types for tools/nightly_qa.mjs (used by tests/nightlyQa.test.ts)
export interface Finding { kind: 'crash' | 'softlock' | 'error' | 'hud-overlap' | 'false-marker' | 'double-loss'; scenario: string; detail: string; key: string }
export interface Meta { date?: string; sha?: string; runUrl?: string; sweepResult?: string }
export const STUCK_S: number;
export function scenario(row: any): string;
export function classify(row: any): Finding[];
export function shardJobs<T>(jobs: T[], shard: number, n: number): T[];
export function parseShard(s: string | undefined): { shard: number; n: number } | null;
export function summarize(rows: any[], meta?: Meta): { markdown: string; findings: Finding[] };
export function reportedKeys(texts: (string | null | undefined)[]): Set<string>;
export function issueBody(findings: Finding[], known?: Set<string>, meta?: Meta): string;
