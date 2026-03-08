import { test, expect, describe } from "bun:test";
import { Lexer } from "../../src/lexer/lexer.ts";
import { Parser } from "../../src/parser/parser.ts";
import { check } from "../../src/checker/checker.ts";

function parseProgram(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function expectNoErrors(source: string) {
  const ast = parseProgram(source);
  const result = check(ast);
  expect(result.errors).toHaveLength(0);
}

function expectError(source: string, messagePart: string) {
  const ast = parseProgram(source);
  const result = check(ast);
  expect(result.errors.length).toBeGreaterThan(0);
  const hasMatch = result.errors.some(e =>
    e.message.toLowerCase().includes(messagePart.toLowerCase())
  );
  if (!hasMatch) {
    throw new Error(
      `Expected error containing "${messagePart}", got: ${result.errors.map(e => e.message).join(", ")}`
    );
  }
}

function expectNoWarnings(source: string) {
  const ast = parseProgram(source);
  const result = check(ast);
  expect(result.errors).toHaveLength(0);
  expect(result.warnings).toHaveLength(0);
}

function expectWarning(source: string, messagePart: string) {
  const ast = parseProgram(source);
  const result = check(ast);
  const hasMatch = result.warnings.some(w =>
    w.message.toLowerCase().includes(messagePart.toLowerCase())
  );
  if (!hasMatch) {
    throw new Error(
      `Expected warning containing "${messagePart}", got: ${result.warnings.map(w => w.message).join(", ")}`
    );
  }
}

describe("Type Checker - Should Pass", () => {
  test("accepts well-typed function", () => {
    expectNoErrors("add : Int -> Int -> Int\nadd a b = a + b");
  });

  test("accepts match with correct types", () => {
    expectNoErrors(`
enum Shape =
  | Circle { radius: Float }
  | Point

area : Shape -> Float
area s = match s
  Circle { radius } => radius * radius
  Point => 0.0
    `);
  });

  test("accepts if-then-else with same types", () => {
    expectNoErrors(`
f : Int -> Int
f x = if x > 0 then x else 0
    `);
  });

  test("accepts boolean operations", () => {
    expectNoErrors(`
both : Bool -> Bool -> Bool
both a b = a && b
    `);
  });

  test("accepts let expressions", () => {
    expectNoErrors(`
f : Int -> Int
f x = let y = x + 1 in y * 2
    `);
  });

  test("accepts function calls", () => {
    expectNoErrors(`
double : Int -> Int
double x = x + x

main : Int
main = double 5
    `);
  });

  test("accepts string interpolation", () => {
    expectNoErrors(`
greet : String -> String
greet name = "hello \${name}"
    `);
  });

  test("accepts list literals", () => {
    expectNoErrors(`
main : Int
main = length([1, 2, 3])
    `);
  });

  test("accepts record access", () => {
    expectNoErrors(`
main : String
main = { name: "Alice", age: 30 }.name
    `);
  });

  test("accepts stdlib functions", () => {
    expectNoErrors(`
main : String
main = join(", ", ["hello", "world"])
    `);
  });
});

describe("Type Checker - Should Fail", () => {
  test("rejects adding Int and String", () => {
    expectError(
      'f : Int -> Int\nf x = x + "hello"',
      "type mismatch"
    );
  });

  test("rejects if-then-else with different branch types", () => {
    expectError(
      'f : Int -> Int\nf x = if x > 0 then x else "nope"',
      "type mismatch"
    );
  });

  test("rejects function returning wrong type", () => {
    expectError(
      'f : Int -> Int\nf x = "hello"',
      "type mismatch"
    );
  });

  test("rejects boolean operator with non-bool", () => {
    expectError(
      'f : Int -> Bool\nf x = x && true',
      "type mismatch"
    );
  });

  test("rejects not operator with non-bool", () => {
    expectError(
      'f : Int -> Bool\nf x = !x',
      "type mismatch"
    );
  });
});

describe("Type Checker - Exhaustiveness Warnings", () => {
  test("exhaustive enum match produces no warning", () => {
    expectNoWarnings(`
enum Color =
  | Red
  | Green
  | Blue

name : Color -> String
name c = match c
  Red => "red"
  Green => "green"
  Blue => "blue"
    `);
  });

  test("non-exhaustive enum match produces warning", () => {
    expectWarning(`
enum Color =
  | Red
  | Green
  | Blue

name : Color -> String
name c = match c
  Red => "red"
  Green => "green"
    `, "missing variants: Blue");
  });

  test("wildcard makes match exhaustive", () => {
    expectNoWarnings(`
enum Color =
  | Red
  | Green
  | Blue

name : Color -> String
name c = match c
  Red => "red"
  _ => "other"
    `);
  });
});
