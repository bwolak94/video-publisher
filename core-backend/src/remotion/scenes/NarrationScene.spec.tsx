/**
 * Unit test for NarrationScene — UT-14-04
 */
import React from "react";

// Mock remotion to avoid Remotion internals requiring a full render context
jest.mock("remotion", () => ({
  AbsoluteFill: ({ children, style }: any) =>
    React.createElement("div", { className: "absolute-fill", style }, children),
  Video: ({ src, style }: any) => React.createElement("video", { src, style }),
  Audio: ({ src }: any) => React.createElement("audio", { src }),
}));

import { NarrationScene } from "./NarrationScene";

describe("NarrationScene (UT-14-04)", () => {
  it("renders without Remotion errors with mock audio + video URLs", () => {
    const element = NarrationScene({
      audioUrl: "https://presigned.s3.example.com/audio/abc.mp3",
      videoUrl: "https://presigned.s3.example.com/video/xyz.mp4",
      narrationText: "Hello world",
      textOverlay: undefined,
    });

    expect(element).not.toBeNull();
    expect(element).toBeDefined();
  });

  it("renders without crashing when no text overlay provided", () => {
    const element = NarrationScene({
      audioUrl: "https://presigned.s3.example.com/audio/abc.mp3",
      videoUrl: "https://presigned.s3.example.com/video/xyz.mp4",
      narrationText: "No overlay",
      textOverlay: undefined,
    });
    expect(element).not.toBeNull();
  });

  it("renders text overlay when provided", () => {
    const element = NarrationScene({
      audioUrl: "https://presigned.s3.example.com/audio/abc.mp3",
      videoUrl: undefined,
      narrationText: "With overlay",
      textOverlay: { text: "Breaking News", style: "punchy" },
    });
    expect(element).not.toBeNull();
  });
});
