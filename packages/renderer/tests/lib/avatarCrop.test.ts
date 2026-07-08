import { describe, expect, it } from "vitest";
import {
  centeredOffset,
  clampOffset,
  coverScale,
  offsetForScale,
  sourceRectFromView,
} from "../../src/lib/avatarCrop.js";

const V = 200;

describe("avatar crop geometry", () => {
  it("coverScale fills the viewport on the constraining axis", () => {
    // wide image: height is the limiting dimension
    expect(coverScale({ w: 1000, h: 500 }, V)).toBeCloseTo(0.4);
    // tall image: width limits
    expect(coverScale({ w: 500, h: 1000 }, V)).toBeCloseTo(0.4);
    // square
    expect(coverScale({ w: 400, h: 400 }, V)).toBeCloseTo(0.5);
  });

  it("centeredOffset centers the scaled image", () => {
    // 1000x500 at 0.4 -> 400x200; centered in 200 viewport
    expect(centeredOffset({ w: 1000, h: 500 }, 0.4, V)).toEqual({
      x: -100,
      y: 0,
    });
  });

  it("clampOffset keeps the image covering the viewport", () => {
    const natural = { w: 1000, h: 500 };
    // displayed 400x200 -> x in [-200,0], y fixed at 0
    expect(clampOffset({ x: 50, y: 30 }, natural, 0.4, V)).toEqual({
      x: 0,
      y: 0,
    });
    expect(clampOffset({ x: -999, y: -999 }, natural, 0.4, V)).toEqual({
      x: -200,
      y: 0,
    });
    expect(clampOffset({ x: -100, y: 0 }, natural, 0.4, V)).toEqual({
      x: -100,
      y: 0,
    });
  });

  it("sourceRectFromView maps the viewport to source pixels", () => {
    // centered wide image -> a square taken from the middle
    expect(sourceRectFromView({ x: -100, y: 0 }, 0.4, V)).toEqual({
      x: 250,
      y: 0,
      size: 500,
    });
  });

  it("offsetForScale anchors zoom to the viewport center", () => {
    // zoom 0.4 -> 0.8 around center; source-center point stays put
    expect(offsetForScale({ x: -100, y: 0 }, 0.4, 0.8, V)).toEqual({
      x: -300,
      y: -100,
    });
  });
});
