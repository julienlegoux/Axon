import { Lexer } from "./lexer/lexer.ts";
import { Parser } from "./parser/parser.ts";
import { generate, getUsedRuntimeFunctions } from "./codegen/codegen.ts";
import { getRuntimeSource } from "./codegen/runtime-bundle.ts";
import { check } from "./checker/checker.ts";
import { formatError, type SourceError } from "./errors.ts";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname, join } from "path";
import type { Program } from "./parser/ast.ts";

function parseSource(source: string): Program {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

function compile(source: string): { code: string; ast: Program } {
  const ast = parseSource(source);
  const code = generate(ast);
  return { code, ast };
}

function writeRuntimeIfNeeded(ast: Program, outputDir: string): string | null {
  const usedRuntime = getUsedRuntimeFunctions(ast);
  if (usedRuntime.length > 0) {
    const runtimeDest = join(outputDir, "axon_runtime.ts");
    if (!existsSync(runtimeDest)) {
      writeFileSync(runtimeDest, getRuntimeSource());
    }
    return runtimeDest;
  }
  return null;
}

function buildFile(filePath: string): string {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");
  const { code, ast } = compile(source);
  const outPath = absPath.replace(/\.axon$/, ".ts");
  writeFileSync(outPath, code);
  writeRuntimeIfNeeded(ast, dirname(outPath));
  return outPath;
}

async function runFile(filePath: string): Promise<void> {
  const outPath = buildFile(filePath);
  const outDir = dirname(outPath);
  const runtimePath = join(outDir, "axon_runtime.ts");
  const proc = Bun.spawn(["bun", "run", outPath], {
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
  // Clean up generated files
  try { unlinkSync(outPath); } catch {}
  try { unlinkSync(runtimePath); } catch {}
}

function checkFile(filePath: string): void {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");
  try {
    const ast = parseSource(source);
    const result = check(ast);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        const formatted = formatError({
          code: "T001",
          severity: "error",
          message: err.message,
          line: err.line || 1,
          column: err.column || 1,
          source,
          file: filePath,
          hint: err.hint,
        });
        console.error(formatted);
      }
      process.exit(1);
    }
    for (const warn of result.warnings) {
      const formatted = formatError({
        code: "W001",
        severity: "warning",
        message: warn.message,
        line: warn.line || 1,
        column: warn.column || 1,
        source,
        file: filePath,
        hint: warn.hint,
      });
      console.warn(formatted);
    }
    console.log(`OK ${filePath} — no errors`);
  } catch (e) {
    console.error(`FAIL ${filePath} — ${(e as Error).message}`);
    process.exit(1);
  }
}

async function testFile(filePath: string): Promise<void> {
  const absPath = resolve(filePath);
  const source = readFileSync(absPath, "utf-8");

  const ast = parseSource(source);

  // Find @test declarations
  const tests = ast.declarations.filter((d) => d.kind === "TestDecl");
  if (tests.length === 0) {
    console.log(`No tests found in ${filePath}`);
    return;
  }

  // Get all non-test declarations
  const nonTestDecls = ast.declarations.filter((d) => d.kind !== "TestDecl");

  console.log(`Running ${tests.length} test(s) from ${filePath}:`);
  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    if (t.kind !== "TestDecl") continue;

    // Synthesize a main function from the test body
    const testMainDecl: import("./parser/ast.ts").FuncDecl = {
      kind: "FuncDecl",
      name: "main",
      params: [],
      body: t.body,
      typeSig: {
        kind: "TypeSig",
        name: "main",
        params: [],
        returnType: { kind: "NamedType", name: "Unit" },
        isPublic: false,
      },
      annotations: [],
    };

    const testProgram: import("./parser/ast.ts").Program = {
      kind: "Program",
      declarations: [...nonTestDecls, testMainDecl],
    };

    const code = generate(testProgram);
    const tmpPath = resolve(dirname(absPath), `_test_${Date.now()}_${Math.random().toString(36).slice(2)}.ts`);
    const outDir = dirname(tmpPath);

    writeFileSync(tmpPath, code);
    writeRuntimeIfNeeded(testProgram, outDir);

    const runtimePath = join(outDir, "axon_runtime.ts");

    try {
      const proc = Bun.spawnSync(["bun", "run", tmpPath], {
        stdout: "pipe",
        stderr: "pipe",
      });

      if (proc.exitCode === 0) {
        console.log(`  PASS "${t.description}"`);
        passed++;
      } else {
        const stderr = new TextDecoder().decode(proc.stderr).trim();
        const errorLine = stderr.split("\n").find(l => l.includes("Assertion failed")) || stderr.split("\n")[0] || "unknown error";
        console.log(`  FAIL "${t.description}": ${errorLine}`);
        failed++;
      }
    } catch (e) {
      console.log(`  FAIL "${t.description}": ${(e as Error).message}`);
      failed++;
    } finally {
      try { unlinkSync(tmpPath); } catch {}
      try { unlinkSync(runtimePath); } catch {}
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
