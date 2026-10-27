import type { AgentEvent } from "../shared/types";
export type Delivery = {
  agent: string;
  text: string;
  more?: boolean;
  failed?: boolean;
};
export type VisualJob = {
  id: string;
  target: string;
  deliveries: Delivery[];
  readyAt: number;
  delegationOwner?: string;
};
/** Presentation queue only: never awaits, changes, or calls any adapter. */
export class ChoreographyQueue {
  jobs: VisualJob[] = [];
  private seen = new Set<string>();
  enqueue(event: AgentEvent, now: number) {
    if (event.kind !== "delegation" && event.kind !== "final_reply") return;
    const id =
      event.kind === "delegation"
        ? `${event.delegationId}:${event.phase}`
        : `final:${event.agentId}:${event.ts}:${event.text}`;
    if (this.seen.has(id)) return;
    this.seen.add(id);
    if (this.seen.size > 512)
      this.seen.delete(this.seen.values().next().value!);
    if (event.kind === "final_reply") {
      const done = this.jobs.find((j) => j.delegationOwner === event.agentId);
      if (done) {
        done.target = "user";
        done.deliveries.push({
          agent: event.agentId,
          text: event.text,
          more: true,
        });
        done.delegationOwner = undefined;
        done.readyAt = now + 160;
        return;
      }
      const previous = this.jobs.find(
        (j) =>
          j.target === "user" &&
          j.deliveries.length === 1 &&
          j.deliveries[0].agent === event.agentId,
      );
      if (previous) {
        previous.deliveries[0].text += "\n" + event.text;
        return;
      }
      this.jobs.push({
        id,
        target: "user",
        deliveries: [{ agent: event.agentId, text: event.text, more: true }],
        readyAt: now + 900,
      });
    } else if (event.phase === "done") {
      const reply = this.jobs.find(
        (j) =>
          j.target === "user" &&
          j.deliveries.some((d) => d.agent === event.agentId),
      );
      if (reply) {
        reply.deliveries.unshift({
          agent: event.to,
          text: event.summary,
          more: true,
        });
        reply.readyAt = now + 160;
        return;
      }
      this.jobs.push({
        id,
        target: event.agentId,
        deliveries: [{ agent: event.to, text: event.summary }],
        delegationOwner: event.agentId,
        readyAt: now + 900,
      });
    } else
      this.jobs.push({
        id,
        target: event.to,
        deliveries: [
          {
            agent: event.agentId,
            text: event.summary,
            failed: event.phase === "failed",
          },
        ],
        readyAt: now + 160,
      });
  }
  bridge(from: string, to: string, text: string, now: number) {
    const duplicate = this.jobs.some(
      (j) =>
        j.target === to &&
        j.deliveries.some((d) => d.agent === from && d.text === text),
    );
    if (!duplicate)
      this.jobs.push({
        id: `bridge:${now}`,
        target: to,
        deliveries: [{ agent: from, text }],
        readyAt: now + 200,
      });
  }
  take(now: number, ownerBusy: (id: string) => boolean = () => false) {
    // A completed delegation can be followed by the owner's real final reply.
    // Wait while that owner is still composing, without blocking other jobs.
    const index = this.jobs.findIndex(
      (job) =>
        job.readyAt <= now &&
        (!job.delegationOwner || !ownerBusy(job.delegationOwner)),
    );
    if (index >= 0) return this.jobs.splice(index, 1)[0];
  }
  clear() {
    this.jobs = [];
    this.seen.clear();
  }
}
