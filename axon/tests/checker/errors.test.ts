import { test, expect, describe } from "bun:test";
import { formatError, type SourceError } from "../../src/errors.ts";

describe("Error Formatting", () => {
  test("formats basic error with source snippet", () => {
    const err: SourceError = {
      code: "T001",
      severity: "error",
      message: 'Type mismatch: expected Int, got String',
      line: 3,
      column: 12,
      length: 7,
      source: 'f : Int -> Int\nf x = x + "hello"\nmain : Int',
      file: "test.axon",
      hint: 'the `+` operator requires both operands to be the same numeric type',
    };
    const output = formatError(err);
    expect(output).toContain("error[T001]");
    expect(output).toContain("Type mismatch");
    expect(output).toContain("--> test.axon:3:12");
    expect(output).toContain("^^^^^^^");
    expect(output).toContain("help:");
  });

  test("formats warning", () => {
    const err: SourceError = {
      code: "W001",
      severity: "warning",
      message: "Non-exhaustive match: missing variants: Point",
      line: 5,
      column: 1,
      source: "enum Shape =\n  | Circle { radius: Float }\n  | Point\n\narea shape = match shape\n  Circle { radius } => 3.14\n",
      file: "test.axon",
      hint: "add a case for `Point` or add a wildcard `_` arm",
    };
    const output = formatError(err);
    expect(output).toContain("warning[W001]");
    expect(output).toContain("Non-exhaustive");
    expect(output).toContain("help:");
  });

  test("formats error with fix suggestion", () => {
    const err: SourceError = {
      code: "E002",
      severity: "error",
      message: "Missing = in function definition",
      line: 2,
      column: 5,
      source: "f : Int\nf x",
      file: "test.axon",
      fix: "add = after the parameters",
    };
    const output = formatError(err);
    expect(output).toContain("fix:");
  });
});
