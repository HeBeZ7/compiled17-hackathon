/** Cursor pagination state. The provider only gives "next", so earlier cursors are remembered here. */
export interface CatalogNav {
  query: string;
  cursors: (string | undefined)[];
  index: number;
  /** Bumped by a retry so the same request runs again. */
  attempt: number;
}

export const INITIAL_NAV: CatalogNav = { query: "", cursors: [undefined], index: 0, attempt: 0 };

export function searchNav(nav: CatalogNav, query: string): CatalogNav {
  return query === nav.query ? nav : { query, cursors: [undefined], index: 0, attempt: nav.attempt };
}

export function nextNav(nav: CatalogNav, nextCursor: string): CatalogNav {
  return { ...nav, cursors: [...nav.cursors.slice(0, nav.index + 1), nextCursor], index: nav.index + 1 };
}

export function previousNav(nav: CatalogNav): CatalogNav {
  return nav.index === 0 ? nav : { ...nav, index: nav.index - 1 };
}

export function retryNav(nav: CatalogNav): CatalogNav {
  return { ...nav, attempt: nav.attempt + 1 };
}
