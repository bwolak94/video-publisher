import { mapAspectRatioToSize, sizeToWidthHeight } from "./resolution-mapper";

describe("mapAspectRatioToSize", () => {
  // UT-11-01
  it("UT-11-01: 9:16 → 1024x1792", () => {
    expect(mapAspectRatioToSize("9:16")).toBe("1024x1792");
  });

  // UT-11-02
  it("UT-11-02: 16:9 → 1792x1024", () => {
    expect(mapAspectRatioToSize("16:9")).toBe("1792x1024");
  });

  it("1:1 → 1024x1024", () => {
    expect(mapAspectRatioToSize("1:1")).toBe("1024x1024");
  });

  it("unknown aspect ratio defaults to 1792x1024", () => {
    expect(mapAspectRatioToSize("4:3")).toBe("1792x1024");
  });
});

describe("sizeToWidthHeight", () => {
  it("parses 1024x1792 correctly", () => {
    expect(sizeToWidthHeight("1024x1792")).toEqual({ width: 1024, height: 1792 });
  });

  it("parses 1792x1024 correctly", () => {
    expect(sizeToWidthHeight("1792x1024")).toEqual({ width: 1792, height: 1024 });
  });
});
