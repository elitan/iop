import { describe, expect, test } from "bun:test";
import { extractSubdomain } from "./domain-utils";

describe("extractSubdomain", () => {
  test("extracts subdomain from full domain", () => {
    expect(extractSubdomain("testapp.frost.j4labs.se")).toBe("testapp");
  });

  test("returns @ for apex domain (two parts)", () => {
    expect(extractSubdomain("example.com")).toBe("@");
  });

  test("returns @ for single part domain", () => {
    expect(extractSubdomain("localhost")).toBe("@");
  });

  test("handles www subdomain", () => {
    expect(extractSubdomain("www.example.com")).toBe("www");
  });

  test("handles deep subdomain (only returns first part)", () => {
    expect(extractSubdomain("api.v2.example.com")).toBe("api");
  });

  test("handles subdomain with hyphens", () => {
    expect(extractSubdomain("my-app.example.com")).toBe("my-app");
  });
});
