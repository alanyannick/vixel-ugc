import { describe, expect, it } from "vitest";

import { demoCampaign, newCampaign } from "./campaign-store";
import {
  advanceExecutionPlan,
  buildExecutionPlanForCampaign,
} from "./execution-plan";

describe("studio execution plan projection", () => {
  it("turns the approved demo decision into a stable, approved domain plan", () => {
    const first = buildExecutionPlanForCampaign(demoCampaign);
    const second = buildExecutionPlanForCampaign(demoCampaign);

    expect(first).not.toBeNull();
    expect(first?.id).toBe(second?.id);
    expect(
      first?.stages.map((stage) => ({
        id: stage.id,
        items: stage.items.map((item) => item.id),
      })),
    ).toEqual(
      second?.stages.map((stage) => ({
        id: stage.id,
        items: stage.items.map((item) => item.id),
      })),
    );
    expect(first?.runtime.approval?.inputSignature).toBe(
      first?.planner.inputSignature,
    );
    expect(first?.stages[0].runtime.status).toBe("succeeded");
    expect(
      first?.stages
        .flatMap((stage) => stage.items)
        .find((item) => item.planner.kind === "video")?.runtime.status,
    ).toBe("ready");
  });

  it("does not invent a plan before product truth and a decision exist", () => {
    expect(buildExecutionPlanForCampaign(newCampaign())).toBeNull();
  });

  it("advances only the targeted runtime items through video delivery", () => {
    const plan = buildExecutionPlanForCampaign(demoCampaign);
    expect(plan).not.toBeNull();
    const running = advanceExecutionPlan(plan, "video_submitted");
    const completed = advanceExecutionPlan(running, "video_succeeded");
    const adopted = advanceExecutionPlan(completed, "video_adopted");
    const items = adopted?.stages.flatMap((stage) => stage.items) ?? [];

    expect(items.find((item) => item.planner.kind === "video")?.runtime.status)
      .toBe("succeeded");
    expect(items.find((item) => item.planner.kind === "review")?.runtime.status)
      .toBe("succeeded");
    expect(items.find((item) => item.planner.kind === "export")?.runtime.status)
      .toBe("ready");
  });
});
