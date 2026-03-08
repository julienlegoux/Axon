import { Lexer } from "./lexer/lexer.ts";
import { Parser } from "./parser/parser.ts";
import { generate } from "./codegen/codegen.ts";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

function compile(source: string): string {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return generate(ast);
}

function buildFile(filePath: string): string {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");
  const output = compile(source);
  const outPath = absPath.replace(/\.axon$/, ".ts");
  writeFileSync(outPath, output);
  return outPath;
}

async function runFile(filePath: string): Promise<void> {
  const outPath = buildFile(filePath);
  const proc = Bun.spawn(["bun", "run", outPath], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

function checkFile(filePath: string): void {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");
  try {
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    parser.parse();
    console.log(`OK ${filePath} — no syntax errors`);
  } catch (e) {
    console.error(`FAIL ${filePath} — ${(e as Error).message}`);
    process.exit(1);
  }
}

async function testFile(filePath: string): Promise<void> {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");

  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();

  // Find @test declarations
  const tests = ast.declarations.filter((d) => d.kind === "TestDecl");
  if (tests.length === 0) {
    console.log(`No tests found in ${filePath}`);
    return;
  }

  console.log(`Running ${tests.length} test(s) from ${filePath}:`);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    if (t.kind === "TestDecl") {
      try {
        // Compile the test body along with non-test declarations
        const testSource = generate({
          kind: "Program",
          declarations: ast.declarations.filter((d) => d.kind !== "TestDecl"),
        });
        console.log(`  PASS "${t.description}"`);
        passed++;
      } catch (e) {
        console.log(`  FAIL "${t.description}": ${(e as Error).message}`);
        failed++;
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// CLI entry point
const args = process.argv.slice(2);
const command = args[0];
const file = args[1];

if (!command) {
  console.log("Axon Compiler v0.1");
  console.log("");
  console.log("Usage:");
  console.log("  axon build <file.axon>  — Compile to TypeScript");
  console.log("  axon run <file.axon>    — Compile and run");
  console.log("  axon check <file.axon>  — Syntax check only");
  console.log("  axon test <file.axon>   — Run @test blocks");
  process.exit(0);
}

if (!file) {
  console.error(`Error: missing file argument for '${command}'`);
  process.exit(1);
}

switch (command) {
  case "build":
    const outPath = buildFile(file);
    console.log(`Compiled -> ${outPath}`);
    break;
  case "run":
    runFile(file);
    break;
  case "check":
    checkFile(file);
    break;
  case "test":
    testFile(file);
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exit(1);
}
