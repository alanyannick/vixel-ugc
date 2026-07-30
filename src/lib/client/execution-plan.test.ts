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

  it("keeps an adopted video ready for export until delivery is recorded", () => {
    const plan = buildExecutionPlanForCampaign(demoCampaign);
    expect(plan).not.toBeNull();
    const running = advanceExecutionPlan(plan, "video_submitted");
    const completed = advanceExecutionPlan(running, "video_succeeded");
    const adopted = advanceExecutionPlan(completed, "video_adopted");
    const adoptedItems =
      adopted?.stages.flatMap((stage) => stage.items) ?? [];

    expect(
      adoptedItems.find((item) => item.planner.kind === "video")?.runtime.status,
    )
      .toBe("succeeded");
    expect(
      adoptedItems.find((item) => item.planner.kind === "review")?.runtime.status,
    )
      .toBe("succeeded");
    expect(
      adoptedItems.find((item) => item.planner.kind === "export")?.runtime.status,
    )
      .toBe("ready");
    expect(adopted?.runtime.status).not.toBe("succeeded");

    const delivered = advanceExecutionPlan(adopted, "delivery_exported");
    const deliveredItems =
      delivered?.stages.flatMap((stage) => stage.items) ?? [];

    expect(
      deliveredItems.find((item) => item.planner.kind === "export")?.runtime
        .status,
    ).toBe("succeeded");
    expect(delivered?.runtime.status).toBe("succeeded");
  });

  it("does not complete delivery before a video is adopted", () => {
    const plan = buildExecutionPlanForCampaign(demoCampaign);
    expect(plan).not.toBeNull();

    const unchanged = advanceExecutionPlan(plan, "delivery_exported");

    expect(
      unchanged?.stages
        .flatMap((stage) => stage.items)
        .find((item) => item.planner.kind === "export")?.runtime.status,
    ).toBe("blocked");
    expect(unchanged?.revision).toBe(plan?.revision);
  });
});
