# Axon

A programming language designed **by AI, for AI**. Axon optimizes for LLM reasoning while remaining human-readable — every token carries meaning, intent is preserved alongside implementation, and side effects are tracked in the type system.

Axon compiles to TypeScript and runs on [Bun](https://bun.sh).

```
@intent "Authenticate user and return a session token"
@effect db.read
login : Email -> String -> Result Session AuthError
login email password = do
  user    <- db.find_user(email)       ? UserNotFound
  _       <- verify(user.hash, password) ? InvalidCredentials
  session <- session.create(user, ttl: 8h)
  ok session
```

## Why Axon?

Current languages were designed for humans to write and machines to execute. Axon inverts this — it's built around three axioms:

**Every token carries meaning.** No braces, no `return`, no `var`/`let`/`const`. Axon programs are ~40% shorter than equivalent TypeScript while being more explicit about what matters.

**Intent is preserved.** `@intent` annotations declare *why* a function exists, not just what it does. `@effect` annotations make side effects visible in the type signature. An AI reading Axon code can reason about a function's purpose without reverse-engineering its implementation.

**Side effects are visible.** Functions without `@effect` are pure by default. The compiler enforces this — call `print` without declaring `@effect console` and you get an error, not a runtime surprise.

## Quick Start

```bash
# Prerequisites: Bun (https://bun.sh)
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone <repo-url> && cd axon
bun install

# Run an example
bun run src/cli.ts run examples/hello.axon
# => 7

# Run the test suite
bun test
# => 81 pass, 0 fail
```

## Language Tour

### Functions

Functions are defined with a type signature and an implementation. No `function` keyword, no braces, no `return`.

```
add : Int -> Int -> Int
add a b = a + b

square : Int -> Int
square x = x * x

-- Call by juxtaposition or with parens
main : Int
main = square (add 3 4)
```

### Algebraic Data Types

Enums are tagged unions with optional fields. Pattern matching is exhaustive — the compiler warns if you miss a case.

```
enum Shape =
  | Circle { radius: Float }
  | Rect { width: Float, height: Float }
  | Point

area : Shape -> Float
area shape = match shape
  Circle { radius } => 3.14159 * radius * radius
  Rect { width, height } => width * height
  Point => 0.0
```

### Pattern Matching

Supports constructor patterns, tuple patterns, literal patterns, wildcards, guards, and variable bindings.

```
fizzbuzz : Int -> String
fizzbuzz n = match (n % 3, n % 5)
  (0, 0) => "FizzBuzz"
  (0, _) => "Fizz"
  (_, 0) => "Buzz"
  _      => "${n}"

enum Value =
  | Num { n: Int }
  | Zero

classify : Value -> String
classify v = match v
  Num { n } if n > 0 => "positive"
  Num { n } if n < 0 => "negative"
  _ => "zero"
```

### Pipe Operator

Chain transformations left-to-right. The pipe passes the left side as the last argument to the right side.

```
main : Int
main = 5 |> double |> increment
-- equivalent to: increment(double(5))
```

### Error Handling with Result

No exceptions. The `Result` type and `do`-notation with `<-` make error handling explicit and composable.

```
safe_div : Int -> Int -> Result Int String
safe_div a b = if b == 0 then err "division by zero" else ok (a / b)

main : String
main = match safe_div(10, 2)
  Ok val => "${val}"
  Err msg => msg
```

The `<-` operator in `do` blocks extracts from `Result` and short-circuits on error:

```
process : Request -> Result Response AppError
process req = do
  user    <- auth.verify(req.token)    ? Unauthorized
  data    <- db.fetch(user.id)         ? NotFound
  ok (build_response(data))
```

### Modules & Dependency Injection

Modules declare their dependencies with `needs`. No DI framework needed — it compiles to constructor injection.

```
module Auth needs [db: UserStore, hasher: Hasher]

@intent "Verify credentials and return user"
@effect db.read
pub authenticate : Email -> String -> Result User AuthError
authenticate email password = do
  user <- db.find_user(email) ? UserNotFound
  _    <- hasher.verify(user.hash, password) ? InvalidCredentials
  ok user
```

### Effect System

Functions are pure by default. Side effects must be declared or the type checker rejects the code.

```
-- Pure function: no annotation needed
add : Int -> Int -> Int
add a b = a + b

-- Effectful: must declare @effect
@effect console
greet : String -> Unit
greet name = print("Hello, ${name}!")

-- Effects propagate: calling greet requires declaring console
@effect console
main_greeting : Unit
main_greeting = greet "world"
```

The `main` function is exempt from effect checking for ergonomics.

### Let Expressions & Lambdas

```
circumference : Float -> Float
circumference radius =
  let tau = 2.0 * 3.14159
  in tau * radius

main : Int
main = apply_twice((x) => x + 1, 10)
-- => 12
```

### Records

Structural types with field access.

```
type Todo = { id: Int, title: String, done: Bool }

toggle : Todo -> Todo
toggle t = { id: t.id, title: t.title, done: !t.done }
```

### Inline Tests

Tests live next to the code they test. Run with `axon test`.

```
add : Int -> Int -> Int
add a b = a + b

@test "basic addition"
  assert add(2, 3) == 5

@test "identity"
  assert add(0, 0) == 0
```

### Annotations

Structured metadata, not throwaway comments. Preserved in the AST and enforced by tooling.

```
@intent "Calculate shipping cost based on weight and distance"
@effect db.read, http.request
@deprecated "Use calculate_shipping_v2 instead"
calculate_shipping : Order -> Result Cost ShippingError
```

## CLI

```bash
# Compile to TypeScript
bun run src/cli.ts build <file.axon>

# Compile and run
bun run src/cli.ts run <file.axon>

# Type check (no codegen)
bun run src/cli.ts check <file.axon>

# Run inline @test blocks
bun run src/cli.ts test <file.axon>
```

## Type System

| Axon Type | Description | Compiles To |
|-----------|-------------|-------------|
| `Int` | Integer | `number` |
| `Float` | Floating point | `number` |
| `String` | Text | `string` |
| `Bool` | Boolean | `boolean` |
| `Unit` | No value | `void` |
| `List a` | Homogeneous list | `a[]` |
| `Map k v` | Key-value map | `Map<k, v>` |
| `(a, b)` | Tuple | `[a, b]` |
| `Result a e` | Success or error | `{ ok, value/error }` |
| `Option a` | Value or null | `a \| null` |
| `{ f: T }` | Record | `interface` |

### Refinement Types

Encode constraints into the type itself. The compiler generates validation functions.

```
type Email = String { matches: /^[^@]+@[^@]+$/ }
type Port = Int { min: 1, max: 65535 }
type Password = String { min: 12, opaque: true }
```

## Standard Library

The runtime includes common functions that are auto-imported when used:

**Lists:** `map`, `filter`, `fold`, `find`, `any`, `all`, `head`, `tail`, `length`, `concat`, `flat_map`, `zip`, `sort_by`, `unique`, `group_by`, `chunk`, `take`

**Strings:** `trim`, `split`, `join`, `contains`, `replace`, `to_upper`, `to_lower`, `starts_with`, `ends_with`

**Math:** `abs`, `max`, `min`, `clamp`

**IO:** `print`, `debug`

**Result:** `ok`, `err`, `map_result`, `map_err`, `unwrap_result`

**Option:** `some`, `none`, `unwrap`, `unwrap_or`, `is_some`, `is_none`, `map_option`

## Examples

The `examples/` directory contains working programs:

| File | Description | Output |
|------|-------------|--------|
| `hello.axon` | Basic function call | `7` |
| `math.axon` | Nested function composition | `36` |
| `fibonacci.axon` | Recursive Fibonacci | `55` |
| `fizzbuzz.axon` | Tuple pattern matching | `FizzBuzz` |
| `shapes.axon` | ADTs and pattern matching | `78.53975` |
| `guards.axon` | Match guards | `positive` |
| `pipeline.axon` | Pipe operator | `11` |
| `higher_order.axon` | Higher-order functions | `12` |
| `result_chain.axon` | Result type and Ok/Err matching | `5` |
| `todo.axon` | Records, let-chains, negation | `done!` |
| `stdlib_demo.axon` | Print via stdlib | `hello from axon stdlib` |
| `list_ops.axon` | List length | `5` |
| `pipeline_stdlib.axon` | String join | `hello, world` |
| `test_demo.axon` | Inline tests | 3 passed |
| `test_shapes.axon` | ADT tests | 3 passed |

Run all examples:

```bash
for f in examples/*.axon; do
  if echo "$f" | grep -q "test_"; then
    echo "=== $f ===" && bun run src/cli.ts test "$f"
  else
    echo "=== $f ===" && bun run src/cli.ts run "$f"
  fi
done
```

## Architecture

```
src/
├── lexer/          Tokenizer with INDENT/DEDENT tracking
│   ├── tokens.ts   Token type definitions + keyword table
│   └── lexer.ts    Lexer implementation
├── parser/         Recursive descent + Pratt expression parsing
│   ├── ast.ts      AST node types (discriminated unions)
│   └── parser.ts   Parser implementation
├── checker/        Static analysis
│   ├── types.ts    Internal type representations
│   ├── env.ts      Scoped symbol table
│   ├── checker.ts  Two-pass type checker
│   └── effects.ts  Effect inference and checking
├── codegen/        TypeScript code generation
│   ├── codegen.ts  AST → TypeScript emitter
│   └── runtime-bundle.ts  Runtime function registry
├── runtime.ts      Standard library (Result, Option, List ops, etc.)
├── errors.ts       Source-snippet error formatter
├── cli.ts          CLI entry point (build/run/check/test)
└── index.ts        Library exports
```

The compiler pipeline: **Source → Lexer → Parser → Checker → Codegen → TypeScript → Bun**

## Known Limitations

- Type inference uses `Unknown` as an escape hatch for polymorphic types (no full Hindley-Milner)
- Effect checking doesn't track through higher-order function arguments
- Exhaustiveness checking covers enums but not nested or literal patterns
- Error messages don't yet carry precise source positions from the AST
- No incremental compilation or caching
- No `where` clauses (only `let...in`)
- No `axon fmt` formatter or LSP server yet

## Design Principles

| Principle | Mechanism | Why It Helps AI |
|-----------|-----------|-----------------|
| Semantic density | No braces, no return, no var/let/const | Fewer tokens = more code fits in context |
| Explicit effects | `@effect` system enforced by checker | AI knows exactly what a function can do |
| Preserved intent | `@intent` annotations | AI understands *why*, not just *what* |
| Forced error handling | `Result` type + `<-` operator | No hidden exceptions to miss |
| Exhaustive matching | Compiler warns on missing cases | AI can't forget a case |
| Colocation | Module-level deps, inline tests | Everything needed is in one file |
| Pure by default | Functions without `@effect` must be pure | Safe to refactor, reorder, cache |
| Dependency injection | `module needs` syntax | Easy to mock, test, swap |

## License

MIT