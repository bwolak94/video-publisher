/**
 * Unit test for TextOverlay — UT-14-05
 */
import React from "react";
import { TextOverlay, getTextStyleClass } from "./TextOverlay";

describe("TextOverlay (UT-14-05)", () => {
  // Pure function test — no rendering needed
  it("getTextStyleClass('punchy') returns overlay-punchy class", () => {
    expect(getTextStyleClass("punchy")).toBe("overlay-punchy");
  });

  it("getTextStyleClass('standard') returns overlay-standard class", () => {
    expect(getTextStyleClass("standard")).toBe("overlay-standard");
  });

  it("getTextStyleClass('funny_sub') returns overlay-funny-sub class", () => {
    expect(getTextStyleClass("funny_sub")).toBe("overlay-funny-sub");
  });

  it("TextOverlay component renders with punchy style (UT-14-05)", () => {
    const element = TextOverlay({
      text: "This is punchy!",
      style: "punchy",
      position: "bottom",
    });

    expect(element).not.toBeNull();
    // The element is a React element — check its props contain the punchy class
    expect((element as any).props.className).toBe("overlay-punchy");
  });
});
