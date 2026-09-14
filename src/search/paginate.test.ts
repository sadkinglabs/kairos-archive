import { describe, expect, it } from "vitest";
import { pageInfo, paginate } from "./paginate";

describe("pageInfo", () => {
  it("computes bounds for a full page", () => {
    expect(pageInfo(137, 1, 60)).toEqual({ page: 1, totalPages: 3, offset: 0, start: 1, end: 60, total: 137 });
    expect(pageInfo(137, 2, 60)).toEqual({ page: 2, totalPages: 3, offset: 60, start: 61, end: 120, total: 137 });
  });
  it("shortens the last page", () => {
    expect(pageInfo(137, 3, 60)).toEqual({ page: 3, totalPages: 3, offset: 120, start: 121, end: 137, total: 137 });
  });
  it("clamps a page past the end to the last page", () => {
    expect(pageInfo(137, 99, 60)).toEqual({ page: 3, totalPages: 3, offset: 120, start: 121, end: 137, total: 137 });
  });
  it("treats a non-positive or non-integer page as page 1", () => {
    for (const p of [0, -1, 1.5, NaN]) expect(pageInfo(137, p, 60).page).toBe(1);
  });
  it("always reports at least one page, even for zero results", () => {
    expect(pageInfo(0, 1, 60)).toEqual({ page: 1, totalPages: 1, offset: 0, start: 0, end: 0, total: 0 });
  });
  it("handles exact multiples of the page size", () => {
    expect(pageInfo(120, 2, 60)).toEqual({ page: 2, totalPages: 2, offset: 60, start: 61, end: 120, total: 120 });
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 137 }, (_, i) => i);
  it("slices the requested page", () => {
    expect(paginate(items, 1, 60).items).toEqual(items.slice(0, 60));
    expect(paginate(items, 3, 60).items).toEqual(items.slice(120, 137));
  });
  it("returns the info alongside the slice", () => {
    const { info } = paginate(items, 2, 60);
    expect(info).toEqual({ page: 2, totalPages: 3, offset: 60, start: 61, end: 120, total: 137 });
  });
  it("slices an empty array without error", () => {
    expect(paginate([], 1, 60)).toEqual({ items: [], info: { page: 1, totalPages: 1, offset: 0, start: 0, end: 0, total: 0 } });
  });
});
