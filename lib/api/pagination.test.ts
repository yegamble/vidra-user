import { describe, expect, it } from "vitest";

import { FULL_LIST_LIMIT, pageQuery } from "./pagination";

describe("pageQuery", () => {
  it("passes both window fields through", () => {
    expect(pageQuery({ limit: 20, offset: 40 })).toEqual({ limit: 20, offset: 40 });
  });

  // Unset must stay `undefined`, not become 0: the request builder drops
  // undefined params entirely, whereas `offset=0` is a param the server sees.
  it("leaves an unset field undefined rather than defaulting it", () => {
    expect(pageQuery({})).toEqual({ limit: undefined, offset: undefined });
    expect(pageQuery({ limit: 5 })).toEqual({ limit: 5, offset: undefined });
  });

  it("ignores the endpoint's own filters", () => {
    expect(pageQuery({ limit: 5, offset: 0, q: "cat" } as never)).toEqual({
      limit: 5,
      offset: 0,
    });
  });
});

describe("FULL_LIST_LIMIT", () => {
  it("is the backend's maximum accepted page size", () => {
    expect(FULL_LIST_LIMIT).toBe(100);
  });
});
