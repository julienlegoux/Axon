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
  if (result.errors.length > 0) {
    throw new Error(`Expected no errors, got: ${result.errors.map(e => e.message).join(", ")}`);
  }
}

function expectEffectError(source: string, effectName: string) {
  const ast = parseProgram(source);
  const result = check(ast);
  const hasMatch = result.errors.some(e =>
    e.message.toLowerCase().includes(effectName.toLowerCase())
  );
  if (!hasMatch) {
    throw new Error(
      `Expected effect error mentioning "${effectName}", got: ${result.errors.map(e => e.message).join(", ") || "no errors"}`
    );
  }
}

describe("Effect System", () => {
  test("pure function with no effects passes", () => {
    expectNoErrors("add : Int -> Int -> Int\nadd a b = a + b");
  });

  test("function calling print without @effect console fails", () => {
    expectEffectError(
      'greet : String -> Unit\ngreet name = print("hi")',
      "console"
    );
  });

  test("function with @effect console calling print passes", () => {
    expectNoErrors(
      '@effect console\ngreet : String -> Unit\ngreet name = print("hi")'
    );
  });

  test("effect propagation through call chain", () => {
    expectEffectError(`
@effect console
say_hi : Unit
say_hi = print("hi")

wrapper : Unit
wrapper = say_hi
    `, "console");
  });

  test("function with @effect console calling debug passes", () => {
    expectNoErrors(
      '@effect console\nshow : Int -> Unit\nshow x = debug(x)'
    );
  });

  test("main function is exempt from effect checking", () => {
    expectNoErrors(`
main : Unit
main = print("hello")
    `);
  });
});
