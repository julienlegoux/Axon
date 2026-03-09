import { test, expect, describe } from "bun:test";
import { Lexer } from "../../src/lexer/lexer.ts";
import { Parser } from "../../src/parser/parser.ts";
import { generate, getUsedRuntimeFunctions } from "../../src/codegen/codegen.ts";
import { getRuntimeSource } from "../../src/codegen/runtime-bundle.ts";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";

function compileAndRun(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  const output = generate(ast);

  // Write to temp file and execute
  const tmpPath = resolve(__dirname, `_test_${Date.now()}.ts`);
  writeFileSync(tmpPath, output);

  // Write runtime if needed
  const runtimePath = join(dirname(tmpPath), "axon_runtime.ts");
  const usedRuntime = getUsedRuntimeFunctions(ast);
  let wroteRuntime = false;
  if (usedRuntime.length > 0 && !existsSync(runtimePath)) {
    writeFileSync(runtimePath, getRuntimeSource());
    wroteRuntime = true;
  }

  try {
    const proc = Bun.spawnSync(["bun", "run", tmpPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    return new TextDecoder().decode(proc.stdout).trim();
  } finally {
    try { unlinkSync(tmpPath); } catch {}
    if (wroteRuntime) { try { unlinkSync(runtimePath); } catch {} }
  }
}

describe("End-to-End", () => {
  test("hello.axon outputs 7", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/hello.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("7");
  });

  test("math.axon outputs 36", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/math.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("36");
  });

  test("simple addition", () => {
    const result = compileAndRun(`
add : Int -> Int -> Int
add a b = a + b

main : Int
main = add 10 20
    `);
    expect(result).toBe("30");
  });

  test("multiplication", () => {
    const result = compileAndRun(`
mul : Int -> Int -> Int
mul a b = a * b

main : Int
main = mul 6 7
    `);
    expect(result).toBe("42");
  });

  test("shapes.axon outputs 78.53975", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/shapes.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("78.53975");
  });

  test("option.axon outputs got value", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/option.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("got value");
  });

  test("enum pattern matching with Point", () => {
    const result = compileAndRun(`
enum Shape =
  | Circle { radius: Float }
  | Point

area : Shape -> Float
area shape = match shape
  Circle { radius } => 3.14 * radius * radius
  Point => 0.0

main : Float
main = area Point
    `);
    expect(result).toBe("0");
  });

  test("if-then-else expression", () => {
    const result = compileAndRun(`
abs : Int -> Int
abs x = if x > 0 then x else 0

main : Int
main = abs 5
    `);
    expect(result).toBe("5");
  });

  test("record type declaration", () => {
    const result = compileAndRun(`
type User = { name: String, age: Int }

main : Int
main = 42
    `);
    expect(result).toBe("42");
  });
  test("fibonacci.axon outputs 55", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/fibonacci.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("55");
  });

  test("fizzbuzz.axon outputs FizzBuzz", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/fizzbuzz.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("FizzBuzz");
  });

  test("guards.axon outputs positive", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/guards.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("positive");
  });

  test("pipeline.axon outputs 11", () => {
    const source = readFileSync(resolve(__dirname, "../../examples/pipeline.axon"), "utf-8");
    const result = compileAndRun(source);
    expect(result).toBe("11");
  });
});

function compileOnly(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return generate(ast);
}

describe("Milestone 4 - Ergonomics", () => {
  test("pipe operator", () => {
    const result = compileAndRun(`
double : Int -> Int
double x = x + x

inc : Int -> Int
inc x = x + 1

main : Int
main = 3 |> double |> inc
    `);
    expect(result).toBe("7");
  });

  test("lambda expression in function call", () => {
    const result = compileAndRun(`
apply : (Int -> Int) -> Int -> Int
apply f x = f(x)

main : Int
main = apply((x) => x + 10, 5)
    `);
    expect(result).toBe("15");
  });

  test("string interpolation", () => {
    const result = compileAndRun(`
main : String
main = "hello world"
    `);
    expect(result).toBe("hello world");
  });

  test("let-in expression", () => {
    const result = compileAndRun(`
main : Int
main = let x = 10 in x + 5
    `);
    expect(result).toBe("15");
  });

  test("list literal", () => {
    const output = compileOnly(`
main : Int
main = [1, 2, 3]
    `);
    expect(output).toContain("[1, 2, 3]");
  });

  test("record literal", () => {
    const result = compileAndRun(`
main : String
main = { name: "Alice", age: 30 }.name
    `);
    expect(result).toBe("Alice");
  });
});

describe("Milestone 3 - Modules & Effects", () => {
  test("module with needs generates class", () => {
    const output = compileOnly(`
module App needs [db: Database]

pub greet : String -> String
greet name = "hello"
    `);

    expect(output).toContain("export class App");
    expect(output).toContain("private db: Database");
    expect(output).toContain("greet(name: string): string");
  });

  test("import declaration codegen", () => {
    const output = compileOnly(`import Auth from "./auth"

main : Int
main = 42`);

    expect(output).toContain('import Auth from "./auth"');
  });

  test("effect annotations preserved as JSDoc", () => {
    const output = compileOnly(`
@effect db.read
get_user : Int -> Int
get_user id = id
    `);

    expect(output).toContain("@effect");
  });
});

describe("String Interpolation", () => {
  test("interpolation in match arms", () => {
    const result = compileAndRun(`
fizzbuzz : Int -> String
fizzbuzz n = match (n % 3, n % 5)
  (0, 0) => "FizzBuzz"
  (0, _) => "Fizz"
  (_, 0) => "Buzz"
  _      => "\${n}"

main : String
main = fizzbuzz 7
    `);
    expect(result).toBe("7");
  });

  test("interpolation in function body", () => {
    const result = compileAndRun(`
greet : String -> String
greet name = "hello \${name}"

main : String
main = greet "world"
    `);
    expect(result).toBe("hello world");
  });

  test("interpolation with arithmetic", () => {
    const result = compileAndRun(`
describe : Int -> String
describe x = "result is \${x + 1}"

main : String
main = describe 41
    `);
    expect(result).toBe("result is 42");
  });

  test("multiple interpolations in one string", () => {
    const result = compileAndRun(`
pair : Int -> Int -> String
pair a b = "\${a} and \${b}"

main : String
main = pair 1 2
    `);
    expect(result).toBe("1 and 2");
  });
});

describe("Stdlib Integration", () => {
  test("print function", () => {
    const result = compileAndRun(`
main : Unit
main = print("hello stdlib")
    `);
    expect(result).toBe("hello stdlib");
  });

  test("length function", () => {
    const result = compileAndRun(`
main : Int
main = length([1, 2, 3, 4, 5])
    `);
    expect(result).toBe("5");
  });

  test("join function", () => {
    const result = compileAndRun(`
main : String
main = join(", ", ["hello", "world"])
    `);
    expect(result).toBe("hello, world");
  });
});
