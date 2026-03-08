# Axon Compiler — Phase 2 Changelog

## What Was Implemented

### Milestone 6: Runtime Auto-Import & Stdlib Integration
- Created `src/codegen/runtime-bundle.ts` with a list of all known runtime functions
- Modified `src/codegen/codegen.ts` to walk the AST, detect which stdlib functions are used, and emit selective `import` statements at the top of generated code
- Modified `src/cli.ts` to write `axon_runtime.ts` alongside compiled output during `build` and `run`
- Added `Unit` return type handling: `main : Unit` functions no longer wrap output with `console.log()`
- New examples: `stdlib_demo.axon`, `list_ops.axon`, `pipeline_stdlib.axon`

### Milestone 7: String Interpolation Fix
- Verified codegen correctly handles `${expr}` in all contexts (match arms, function bodies, arithmetic, multiple interpolations)
- Fixed `fizzbuzz.axon` to use proper `"${n}"` interpolation instead of `"other"` hack
- Added `fizzbuzz2.axon` to test non-divisible numbers
- Added comprehensive e2e tests for string interpolation

### Milestone 8: Real Test Runner
- Added `assert` keyword: new `ASSERT` token type, `AssertExpr` AST node, parser support, codegen as runtime assertion
- Implemented real test execution in `src/cli.ts`: each `@test` block is compiled to a standalone program with a synthesized `main`, executed, and exit code determines pass/fail
- New test examples: `test_demo.axon` (3 tests), `test_shapes.axon` (3 tests)

### Milestone 9: Type Checker (Phase 1)
- Created `src/checker/types.ts`: internal type representations (`Primitive`, `Func`, `List`, `Map`, `Tuple`, `Record`, `Enum`, `Result`, `Option`, `TypeVar`, `Unknown`)
- Created `src/checker/env.ts`: scoped symbol table with type aliases and enum definitions
- Created `src/checker/checker.ts`: two-pass type checker
  - Pass 1: Register all type/enum declarations and function signatures
  - Pass 2: Check each function body against its declared type
- Type checking rules implemented:
  - Literal type inference (Int, Float, String, Bool)
  - Binary operator type checking (+, -, *, /, %, **, ==, !=, <, >, <=, >=, &&, ||, ++)
  - Unary operator type checking (!, -)
  - If expression: condition must be Bool, branches must match
  - Function call: argument count and type checking
  - Match expression: all arms must return same type
  - Let expression: inferred binding types
  - Constructor expression: field type checking
  - Record and list literal inference
- Stdlib functions registered with proper type signatures
- Wired into `axon check` CLI command
- 18 type checker tests

### Milestone 10: Effect System
- Created `src/checker/effects.ts`: effect type definitions and inference
- Known effects: `none`, `db.read`, `db.write`, `http.request`, `http.response`, `fs.read`, `fs.write`, `console`, `random`, `time`
- Effect inference: walks function bodies to determine which effects are performed
- Effect checking: compares inferred effects against `@effect` annotations
- Rules: pure by default, `main` is exempt, effect propagation through call chains
- 6 effect system tests

### Milestone 11: Exhaustiveness Checking
- Integrated into the type checker's match expression analysis
- Enum variant coverage tracking
- Wildcard/identifier patterns cover all remaining variants
- Guard clauses make patterns non-exhaustive
- Non-exhaustive matches produce warnings (not errors)
- 3 exhaustiveness tests

### Milestone 12: Error Messages Polish
- Created `src/errors.ts`: rich error formatter with source snippets
- Error format: `error[CODE]: message` with file location, source line, underline, help text, and fix suggestions
- Wired into CLI for type checker errors and warnings
- 3 error formatting tests

### Milestone 13: Final Integration & Validation
- Fixed parenthesized type expressions (e.g., `(Int -> Int)` as function parameter type)
- Fixed multi-line `let...in` parsing (newlines before `in`)
- Fixed `Ok`/`Err` pattern matching to use Result type's `{ ok: true/false }` structure
- Fixed constructor pattern matching for positional fields after `=>`
- New examples: `todo.axon`, `higher_order.axon`, `result_chain.axon`

## Test Suite Results

```
81 pass, 0 fail
155 expect() calls
Ran 81 tests across 7 files
```

## Example Outputs

| Example | Output |
|---------|--------|
| hello.axon | `7` |
| math.axon | `36` |
| fibonacci.axon | `55` |
| fizzbuzz.axon | `FizzBuzz` |
| fizzbuzz2.axon | `7` |
| shapes.axon | `78.53975` |
| option.axon | `got value` |
| guards.axon | `positive` |
| pipeline.axon | `11` |
| stdlib_demo.axon | `hello from axon stdlib` |
| list_ops.axon | `5` |
| pipeline_stdlib.axon | `hello, world` |
| higher_order.axon | `12` |
| result_chain.axon | `5` |
| todo.axon | `done!` |
| test_demo.axon | 3 passed, 0 failed |
| test_shapes.axon | 3 passed, 0 failed |

## Known Limitations
- Type checker uses `Unknown` as escape hatch for polymorphic/generic types (no full Hindley-Milner inference)
- Effect system doesn't track effects through higher-order function arguments
- Exhaustiveness checking only handles enums (not literal patterns or nested patterns)
- Error messages don't yet include precise line/column from the AST (most show line 1)
- No incremental compilation or caching
- Generated runtime file is not cleaned up after `axon build`
