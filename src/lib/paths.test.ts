import { describe, expect, it } from "vitest";
import { collectionOf } from "./paths";

describe("collectionOf", () => {
  it("returns the collection folder for paths inside it", () => {
    expect(collectionOf("collections/api/x.request.json")).toBe("collections/api");
    expect(collectionOf("collections/api/auth/login.request.json")).toBe("collections/api");
  });

  it("returns null for anything else", () => {
    expect(collectionOf("collections/api")).toBeNull();
    expect(collectionOf("environments/dev.env.json")).toBeNull();
  });
});
