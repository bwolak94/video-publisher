import React from "react";
import { render, screen } from "@testing-library/react";
import { CostBreakdown } from "@/components/timeline/CostBreakdown";
import { useTimelineStore } from "@/store/timelineStore";

jest.mock("@/store/timelineStore");

const mockUseTimelineStore = useTimelineStore as jest.MockedFunction<typeof useTimelineStore>;

function mockStoreWithScenes(scenes: Record<string, any>, sceneOrder: string[]) {
  mockUseTimelineStore.mockImplementation((selector: any) =>
    selector({ scenes, sceneOrder })
  );
}

// 8 dirty scenes, each with narrationDirty + visualDirty, 5s each
// audioTotal = 8 × $0.05 = $0.40
// videoTotal = 8 × $0.15 = $1.20
// renderTotal ≈ $0.00 (very small)
// total ≈ $1.60
function makeScene(id: string): [string, any] {
  return [id, {
    isDirty: true,
    narrationDirty: true,
    visualDirty: true,
    durationInSeconds: 5,
  }];
}

const EIGHT_SCENES = Object.fromEntries(Array.from({ length: 8 }, (_, i) => makeScene(`s${i}`)));
const EIGHT_ORDER = Array.from({ length: 8 }, (_, i) => `s${i}`);

describe("CostBreakdown", () => {
  // CT-25-01
  it("shows total cost approximately $1.60 for 8 dirty scenes", () => {
    mockStoreWithScenes(EIGHT_SCENES, EIGHT_ORDER);
    render(<CostBreakdown />);
    const total = screen.getByTestId("cost-total");
    expect(total.textContent).toContain("$1.60");
  });

  // CT-25-03
  it("shows audio, video, and render line items", () => {
    mockStoreWithScenes(EIGHT_SCENES, EIGHT_ORDER);
    render(<CostBreakdown />);
    expect(screen.getByTestId("cost-line-audio")).toBeInTheDocument();
    expect(screen.getByTestId("cost-line-video")).toBeInTheDocument();
    expect(screen.getByTestId("cost-line-render")).toBeInTheDocument();
  });

  it("renders nothing when there are no dirty scenes", () => {
    const cleanScene = { isDirty: false, narrationDirty: false, visualDirty: false, durationInSeconds: 5 };
    mockStoreWithScenes({ s0: cleanScene }, ["s0"]);
    const { container } = render(<CostBreakdown />);
    expect(container.firstChild).toBeNull();
  });

  it("shows budget exceeded message when budgetExceeded=true", () => {
    mockStoreWithScenes(EIGHT_SCENES, EIGHT_ORDER);
    render(<CostBreakdown budgetExceeded />);
    expect(screen.getByText("Budget exceeded")).toBeInTheDocument();
  });
});

// CT-25-02: budget exceeded → RegenerateAllButton disabled
import { RegenerateAllButton } from "@/components/timeline/RegenerateAllButton";

jest.mock("@/components/timeline/ConfirmRegenerateModal", () => ({
  ConfirmRegenerateModal: () => null,
}));

describe("RegenerateAllButton with budgetExceeded", () => {
  // CT-25-02
  it("is disabled when budgetExceeded=true even with dirty scenes", () => {
    mockUseTimelineStore.mockImplementation((selector: any) =>
      selector({
        scenes: EIGHT_SCENES,
        sceneOrder: EIGHT_ORDER,
      })
    );
    render(<RegenerateAllButton budgetExceeded />);
    const btn = screen.getByTestId("regenerate-all-btn");
    expect(btn).toBeDisabled();
  });
});
