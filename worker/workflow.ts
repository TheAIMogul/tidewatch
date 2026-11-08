// The import pipeline as a Cloudflare Workflow: each step is durable and retries on its own.
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import * as P from "./lib/pipeline";

type Params = { runId: number };
const CFG = { retries: { limit: 2, delay: "3 seconds" as const, backoff: "linear" as const }, timeout: "10 minutes" as const };

export async function runPipeline(env: Env, runId: number, step?: WorkflowStep) {
  const s = (name: string, fn: () => Promise<unknown>) => (step ? step.do(name, CFG, async () => { await fn(); return name; }) : fn());
  try {
    await s("parse", () => P.parse(env, runId));
    await s("exact", () => P.exact(env, runId));
    await s("embed-and-pair", () => P.embedAndPair(env, runId));
    await s("judge", () => P.judge(env, runId));
    await s("people", () => P.people(env, runId));
    await s("score", () => P.score(env, runId));
    await s("draft", () => P.drafts(env, runId));
    await s("finish", () => P.finish(env, runId));
  } catch (e: any) {
    await env.DB.prepare("UPDATE runs SET status = 'error', error = ?, finished_at = ? WHERE id = ?").bind(String(e?.message ?? e).slice(0, 500), new Date().toISOString(), runId).run();
    throw e;
  }
}

export class ImportWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    await runPipeline(this.env, event.payload.runId, step);
  }
}
