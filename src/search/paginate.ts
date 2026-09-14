/** Pagination over a results array. The URL (?page=N) is the single
 * source of truth for page state (see search.astro); this module only
 * computes the slice and the bounds a caller renders. Pure: no DOM. */

export const PAGE_SIZE = 60;

export interface PageInfo {
  /** Clamped to [1, totalPages]. */
  page: number;
  totalPages: number;
  /** 0-based index into the source array where this page starts. */
  offset: number;
  /** 1-based bounds for "showing a-b of N"; both 0 when total is 0. */
  start: number;
  end: number;
  total: number;
}

/** Clamp a requested page against a result count and page size. Anything
 * that is not a positive integer (NaN, 0, negative, fractional, missing)
 * is treated as page 1; a page past the end clamps to the last page. */
export function pageInfo(total: number, requestedPage: number, perPage: number = PAGE_SIZE): PageInfo {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const wanted = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const page = Math.min(wanted, totalPages);
  const offset = (page - 1) * perPage;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + perPage, total);
  return { page, totalPages, offset, start, end, total };
}

/** Slice `items` to the requested page, alongside the bounds to render. */
export function paginate<T>(items: readonly T[], requestedPage: number, perPage: number = PAGE_SIZE): { items: T[]; info: PageInfo } {
  const info = pageInfo(items.length, requestedPage, perPage);
  return { items: items.slice(info.offset, info.offset + perPage), info };
}
