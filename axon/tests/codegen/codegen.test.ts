import { test, expect, describe } from "bun:test";
import { Lexer } from "../../src/lexer/lexer.ts";
import { Parser } from "../../src/parser/parser.ts";
import { generate } from "../../src/codegen/codegen.ts";

function compile(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return generate(ast);
}

describe("Code Generator", () => {
  test("compiles simple function with type signature", () => {
    const output = compile("add : Int -> Int -> Int\nadd a b = a + b");
    expect(output).toContain("function add(a: number, b: number): number");
    expect(output).toContain("return (a + b)");
  });

  test("compiles program with main entry point", () => {
    const output = compile(
      "main : Int\nmain = 42"
    );
    expect(output).toContain("function main(): number");
    expect(output).toContain("console.log(main())");
  });

  test("compiles function call", () => {
    const output = compile(
      "add : Int -> Int -> Int\nadd a b = a + b\n\nmain : Int\nmain = add(3, 4)"
    );
    expect(output).toContain("add(3, 4)");
    expect(output).toContain("console.log(main())");
  });

  test("compiles hello.axon program", () => {
    const source = `-- First Axon program
add : Int -> Int -> Int
add a b = a + b

main : Int
main = add 3 4`;

    const output = compile(source);
    expect(output).toContain("function add(a: number, b: number): number");
    expect(output).toContain("function main(): number");
    expect(output).toContain("console.log(main())");
  });

  test("compiles math.axon program", () => {
    const source = `-- Basic math operations
square : Int -> Int
square x = x * x

double : Int -> Int
double x = x + x

main : Int
main = square (double 3)`;

    const output = compile(source);
    expect(output).toContain("function square(x: number): number");
    expect(output).toContain("function double(x: number): number");
    expect(output).toContain("function main(): number");
  });
});
