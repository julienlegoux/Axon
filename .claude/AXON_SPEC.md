# Axon Language Specification v0.1

## Vision

Axon is a programming language designed **by AI, for AI**. Current programming languages were built for humans to write and machines to execute. Axon inverts this: it optimizes for **LLM reasoning** while remaining human-readable. Every design decision follows from three axioms:

1. **Every token must carry meaning** — no ceremony, no boilerplate
2. **Intent must be preserved** — not just *what* the code does, but *why*
3. **Side effects must be visible** — no hidden mutations, no implicit state

**Target**: Axon compiles to **TypeScript** as its initial backend. This is pragmatic — it gives us immediate access to the Node.js/Bun ecosystem, npm packages, and real-world deployability. The compiler itself is written in TypeScript.

---

## 1. Project Structure

```
axon/
├── src/
│   ├── lexer/           -- Tokenizer
│   │   ├── tokens.ts    -- Token type definitions
│   │   └── lexer.ts     -- Lexer implementation
│   ├── parser/          -- AST construction
│   │   ├── ast.ts       -- AST node types
│   │   └── parser.ts    -- Recursive descent parser
│   ├── checker/         -- Type checking & effect analysis
│   │   ├── types.ts     -- Type system internals
│   │   ├── effects.ts   -- Effect inference & checking
│   │   └── checker.ts   -- Main type checker
│   ├── codegen/         -- TypeScript code generation
│   │   └── codegen.ts   -- AST -> TypeScript emitter
│   ├── cli.ts           -- CLI entry point
│   └── index.ts         -- Library entry point
├── stdlib/              -- Standard library (in Axon)
├── examples/            -- Example programs
├── tests/               -- Test suite
├── package.json
└── tsconfig.json
```

---

## 2. Lexical Grammar

### 2.1 Comments

```
-- Single line comment
--- 
  Multi-line comment / doc block
  Supports markdown inside
---
```

### 2.2 Keywords

```
module, needs, type, alias, enum, match, if, then, else,
let, in, do, where, pub, mut, true, false, ok, err,
import, from, as, for, yield, return, with, trait, impl
```

### 2.3 Operators & Symbols

```
=       -- Binding / definition
<-      -- Monadic bind (extract from Result/Option + early return on error)
->      -- Function arrow / return type
|>      -- Pipe operator
|       -- Union / pattern alternative
:       -- Type annotation
?       -- Error tag (used after <- for naming error case)
::      -- Module access
@       -- Annotation prefix
..      -- Spread / range
_       -- Wildcard / discard
=>      -- Lambda / match arm
+  -  *  /  %  **    -- Arithmetic
==  !=  <  >  <=  >=  -- Comparison
&&  ||  !             -- Logical
&  ++                 -- String/List concat
```

### 2.4 Literals

```
42                    -- Int
3.14                  -- Float
"hello"               -- String (double-quoted, with interpolation via ${})
'c'                   -- Char
true / false          -- Bool
[1, 2, 3]            -- List
{a: 1, b: 2}         -- Record
(1, "two", true)      -- Tuple
```

### 2.5 Indentation

Axon uses **significant indentation** (2-space standard). Blocks are opened by `=` or `do` and continue while indentation is deeper. No braces, no `end` keywords.

---

## 3. Type System

### 3.1 Primitive Types

```
Int, Float, String, Char, Bool, Unit
```

`Unit` is the void/nothing type, used for side-effect-only functions.

### 3.2 Compound Types

```
List a           -- Homogeneous list
Map k v          -- Key-value map
Set a            -- Unique set
Option a         -- Some a | None
Result a e       -- Ok a | Err e
Tuple (a, b, c)  -- Fixed-length heterogeneous
```

### 3.3 Refinement Types

Refinement types encode **constraints into the type itself**. This is a core Axon feature — it eliminates entire classes of validation bugs.

```
type Email = String { matches: /^[^@]+@[^@]+\.[^@]+$/ }
type Port = Int { min: 1, max: 65535 }
type NonEmpty a = List a { min_length: 1 }
type Password = String { min: 12, opaque: true }
type Percentage = Float { min: 0.0, max: 100.0 }
type UserId = String { format: "uuid", opaque: false }
```

**Refinement constraints:**

| Constraint    | Applies to    | Meaning                              |
|---------------|---------------|--------------------------------------|
| `min`         | Int, Float    | Minimum value (inclusive)            |
| `max`         | Int, Float    | Maximum value (inclusive)            |
| `min_length`  | String, List  | Minimum length                       |
| `max_length`  | String, List  | Maximum length                       |
| `matches`     | String        | Must match regex                     |
| `format`      | String        | Named format (uuid, iso8601, etc.)   |
| `opaque`      | any           | Excluded from logs/serialization     |

At **compile time**, refinement types generate validation functions. When a raw `String` is assigned to an `Email`, the compiler inserts a runtime check at the boundary.

### 3.4 Records (Structural Types)

```
type User = {
  id: UserId
  email: Email
  name: String
  created_at: String
}
```

Records are **structural** — two types with the same shape are compatible. Named types add documentation but not nominal distinction (use `enum` for that).

### 3.5 Enums (Tagged Unions / ADTs)

```
enum AuthError =
  | UserNotFound
  | InvalidCredentials
  | AccountLocked { until: String }
  | RateLimited { retry_after: Int }

enum Shape =
  | Circle { radius: Float }
  | Rect { width: Float, height: Float }
  | Point
```

Each variant is a constructor. Pattern matching must be **exhaustive**.

### 3.6 Generics

```
type Pair a b = { first: a, second: b }

map : (a -> b) -> List a -> List b
filter : (a -> Bool) -> List a -> List a
```

Standard Hindley-Milner style type inference with explicit annotations encouraged.

### 3.7 Traits (Interfaces)

```
trait Show a =
  show : a -> String

trait Eq a =
  eq : a -> a -> Bool

impl Show User =
  show user = "User(${user.name}, ${user.email})"

impl Eq UserId =
  eq a b = a.value == b.value
```

---

## 4. Functions

### 4.1 Named Functions

```
--- Calculates the area of a shape ---
area : Shape -> Float
area shape = match shape
  Circle { radius } => 3.14159 * radius ** 2
  Rect { width, height } => width * height
  Point => 0.0
```

Function definition structure:
1. Optional doc comment (`--- ... ---`)
2. Optional annotations (`@intent`, `@effect`, etc.)
3. Type signature: `name : InputType -> OutputType`
4. Implementation: `name params = body`

### 4.2 Anonymous Functions (Lambdas)

```
double = (x) => x * 2
greet = (name, greeting) => "${greeting}, ${name}!"

-- Single-arg lambdas can omit parens
increment = x => x + 1

-- Used inline
users |> filter(u => u.active) |> map(u => u.name)
```

### 4.3 Pipe Operator

The pipe `|>` passes the result of the left expression as the **last argument** to the right function.

```
result = raw_input
  |> trim
  |> validate_email    -- returns Result Email ValidationError
  |> map(normalize)    -- operates on the Ok value
```

### 4.4 Pattern Matching

```
describe : Option Int -> String
describe opt = match opt
  Some x if x > 0 => "positive: ${x}"
  Some 0           => "zero"
  Some x           => "negative: ${x}"
  None             => "nothing"
```

Match arms use `=>`. Guards use `if`. The compiler enforces exhaustiveness.

### 4.5 Let Bindings & Where Clauses

```
circumference : Float -> Float
circumference radius =
  let tau = 2 * pi
  in tau * radius

-- OR equivalently:
circumference radius = tau * radius
  where tau = 2 * pi
```

### 4.6 Error Handling with `<-` and `?`

This is one of Axon's most important features. The `<-` operator extracts a value from a `Result` or `Option`. If the value is an error, it **short-circuits** and returns early with the error tagged by `?`.

```
@effect db.read, http.response
login : LoginRequest -> Result Session AuthError
login req = do
  user     <- db.find_user(req.email)       ? UserNotFound
  _        <- verify(user.hash, req.password) ? InvalidCredentials
  _        <- check_not_locked(user)          ? AccountLocked
  session  <- session.create(user, ttl: 8h)
  ok session
```

**How `<-` compiles**: Each `<-` becomes a check. If the right side returns `Err`, it wraps it in the error variant named after `?` and returns immediately. This replaces try/catch entirely.

**Without `?`** (when the error type already matches):
```
data <- fetch_data(url)    -- propagates error as-is
```

---

## 5. Annotations

Annotations are **structured metadata**, not throwaway comments. They are preserved in the AST and available to tooling.

### 5.1 `@intent`

Declares the **purpose** of a function in natural language. Tooling can verify that implementation matches intent.

```
@intent "Authenticate a user by email/password and return a time-limited session"
login : LoginRequest -> Result Session AuthError
```

### 5.2 `@effect`

Declares what side effects a function may perform. The type checker enforces this.

```
@effect none                    -- Pure function, no side effects
@effect db.read                 -- Reads from database
@effect db.write                -- Writes to database
@effect http.request            -- Makes outbound HTTP calls
@effect http.response           -- Produces HTTP response
@effect fs.read                 -- Reads filesystem
@effect fs.write                -- Writes filesystem
@effect console                 -- Console output
@effect random                  -- Uses randomness (non-deterministic)
@effect time                    -- Reads system clock
```

**Composition**: A function that calls another function inherits its effects. If `login` calls `db.find_user` (which has `@effect db.read`), then `login` must declare at least `db.read`. The checker flags mismatches.

```
-- ERROR: function calls db.find_user but doesn't declare db.read
@effect http.response
login req = do
  user <- db.find_user(req.email) ? UserNotFound   -- Checker error here
  ...
```

### 5.3 `@invariant`

Runtime-checkable postconditions.

```
@invariant result.ttl <= 24h
@invariant result.ttl >= 1h
create_session : User -> Result Session SessionError
```

### 5.4 `@deprecated`

```
@deprecated "Use login_v2 instead, this will be removed in 0.5"
login : LoginRequest -> Result Session AuthError
```

### 5.5 `@test`

Inline tests — they live next to the code they test.

```
@test "area of unit circle"
  assert area(Circle { radius: 1.0 }) == 3.14159

@test "area of point is zero"
  assert area(Point) == 0.0
```

---

## 6. Modules

Each `.axon` file is a module. Modules declare their dependencies explicitly.

```
module Auth needs [db: UserStore, session: SessionManager, hasher: Hasher]

-- Everything inside this file can use db, session, hasher
-- Dependencies are injected — making testing trivial

pub login : LoginRequest -> Result Session AuthError
login req = do
  user <- db.find_user(req.email) ? UserNotFound
  ...
```

### 6.1 Visibility

- `pub` — exported, visible to other modules
- No modifier — internal to the module

### 6.2 Imports

```
import Auth from "./auth"                 -- Import module
import { login, logout } from "./auth"    -- Import specific items
import Http.Response as Res               -- Aliased import
```

### 6.3 Module `needs` (Dependency Injection)

The `needs` clause is **the** dependency injection mechanism. No DI framework needed.

```
module UserService needs [
  db: UserStore,
  cache: Cache,
  events: EventBus
]
```

At the application entry point, dependencies are wired:

```
module Main

app = UserService with [
  db: PostgresUserStore,
  cache: RedisCache,
  events: NatsEventBus
]
```

This compiles to constructor injection in TypeScript.

---

## 7. Effect System — Detailed

### 7.1 Effect Inference

The checker walks the call graph and infers effects bottom-up:

```
@effect none
pure_add : Int -> Int -> Int
pure_add a b = a + b              -- OK: no effects

@effect db.read
get_user : Email -> Result User DbError
get_user email = db.query(...)    -- OK: declares db.read

-- Inferred: db.read (from get_user) + http.response
@effect db.read, http.response
handle_request : Request -> Response
handle_request req = do
  user <- get_user(req.email)     -- Inherits db.read
  respond(200, user)              -- http.response
```

### 7.2 Effect Boundaries

At module boundaries, effects must be **declared or propagated**. This makes it trivially easy for an AI to understand what any function might do just by reading its signature.

### 7.3 Pure By Default

Functions with no `@effect` annotation are implicitly `@effect none`. If the checker detects effects, it raises an error — you must be explicit.

---

## 8. Standard Library

### 8.1 Core (always available)

```
-- Math
abs : Int -> Int
max : Int -> Int -> Int
min : Int -> Int -> Int
clamp : Int -> Int -> Int -> Int

-- String
trim : String -> String
split : String -> String -> List String
join : String -> List String -> String
contains : String -> String -> Bool
replace : String -> String -> String -> String
to_upper : String -> String
to_lower : String -> String
starts_with : String -> String -> Bool
ends_with : String -> String -> Bool

-- List
map : (a -> b) -> List a -> List b
filter : (a -> Bool) -> List a -> List a
fold : (b -> a -> b) -> b -> List a -> b
find : (a -> Bool) -> List a -> Option a
any : (a -> Bool) -> List a -> Bool
all : (a -> Bool) -> List a -> Bool
head : List a -> Option a
tail : List a -> List a
length : List a -> Int
concat : List a -> List a -> List a
flat_map : (a -> List b) -> List a -> List b
zip : List a -> List b -> List (a, b)
sort_by : (a -> a -> Int) -> List a -> List a
unique : List a -> List a
group_by : (a -> k) -> List a -> Map k (List a)
chunk : Int -> List a -> List (List a)

-- Option
unwrap : Option a -> a           -- Panics on None (use sparingly)
unwrap_or : a -> Option a -> a
map_option : (a -> b) -> Option a -> Option b
is_some : Option a -> Bool
is_none : Option a -> Bool

-- Result
map_result : (a -> b) -> Result a e -> Result b e
map_err : (e -> f) -> Result a e -> Result a f
unwrap_result : Result a e -> a   -- Panics on Err
ok : a -> Result a e
err : e -> Result a e

-- Debug / IO
@effect console
print : String -> Unit
@effect console
debug : a -> Unit                 -- Pretty-prints any value
```

### 8.2 Extended Modules

```
module Json       -- parse, stringify, schema validation
module Http       -- client & server primitives
module Db         -- generic database interface
module Crypto     -- hashing, tokens, encryption
module Time       -- timestamps, durations, formatting
module Fs         -- file system operations
module Env        -- environment variable access
module Test       -- assertion library
```

---

## 9. Compilation to TypeScript

### 9.1 Core Mapping Rules

| Axon Concept         | TypeScript Output                           |
|----------------------|---------------------------------------------|
| `Int`, `Float`       | `number`                                    |
| `String`             | `string`                                    |
| `Bool`               | `boolean`                                   |
| `Unit`               | `void`                                      |
| `List a`             | `a[]`                                       |
| `Map k v`            | `Map<k, v>`                                 |
| `Option a`           | `a \| null`                                 |
| `Result a e`         | `{ ok: true, value: a } \| { ok: false, error: e }` |
| `enum`               | Discriminated union with `_tag` field       |
| `Record`             | TypeScript `interface`                      |
| `module needs`       | Class with constructor injection            |
| `<-` bind            | `if (!result.ok) return { ok: false, ... }` |
| `\|>` pipe           | Nested function calls                       |
| `match`              | `switch` on `_tag` or chained ternaries     |
| Refinement type      | Branded type + validation function          |
| `@test`              | Test runner compatible functions             |
| `@intent`            | JSDoc comment preserved in output           |
| `@effect`            | JSDoc tag (runtime checking optional)       |

### 9.2 Example Compilation

**Axon source:**
```
module Auth needs [db: UserStore]

type Email = String { matches: /^[^@]+@[^@]+$/ }

enum AuthError =
  | UserNotFound
  | InvalidCredentials

@intent "Verify credentials and return user"
@effect db.read
pub authenticate : Email -> String -> Result User AuthError
authenticate email password = do
  user <- db.find_user(email) ? UserNotFound
  _    <- verify(user.hash, password) ? InvalidCredentials
  ok user
```

**Generated TypeScript:**
```typescript
// Generated by Axon Compiler v0.1
// @intent Verify credentials and return user
// @effect db.read

import { Result, ok, err } from "./axon_runtime";

// Refinement type: Email
type Email = string & { readonly __brand: "Email" };
function parseEmail(raw: string): Result<Email, string> {
  if (/^[^@]+@[^@]+$/.test(raw)) {
    return ok(raw as Email);
  }
  return err("Invalid Email: must match /^[^@]+@[^@]+$/");
}

// Enum: AuthError
type AuthError =
  | { _tag: "UserNotFound" }
  | { _tag: "InvalidCredentials" };

const AuthError = {
  UserNotFound: { _tag: "UserNotFound" } as AuthError,
  InvalidCredentials: { _tag: "InvalidCredentials" } as AuthError,
} as const;

// Module: Auth
export class Auth {
  constructor(private db: UserStore) {}

  /** @intent Verify credentials and return user */
  /** @effect db.read */
  authenticate(email: Email, password: string): Result<User, AuthError> {
    const _r0 = this.db.find_user(email);
    if (!_r0.ok) return err(AuthError.UserNotFound);
    const user = _r0.value;

    const _r1 = verify(user.hash, password);
    if (!_r1.ok) return err(AuthError.InvalidCredentials);

    return ok(user);
  }
}
```

---

## 10. Compiler Architecture

### Phase 1: Lexing
- Input: `.axon` source string
- Output: `Token[]`
- Handle significant whitespace / indentation → generate `INDENT` / `DEDENT` tokens
- Track line/column for error reporting

### Phase 2: Parsing
- Input: `Token[]`
- Output: AST (`Program` node)
- Recursive descent parser
- Handle operator precedence with Pratt parsing
- Produce clear error messages with source location

### Phase 3: Type Checking & Effect Analysis
- Input: AST
- Output: Annotated AST (types resolved, effects computed)
- Hindley-Milner type inference where annotations are missing
- Refinement type constraint validation
- Effect propagation through call graph
- Exhaustiveness checking for pattern matches

### Phase 4: Code Generation
- Input: Annotated AST
- Output: TypeScript source string
- Apply mapping rules from section 9.1
- Generate runtime validation for refinement types
- Emit source maps for debugging

### Phase 5: CLI
- `axon build <file.axon>` → Compile to TypeScript
- `axon run <file.axon>` → Compile + execute via Bun/Node
- `axon check <file.axon>` → Type check only
- `axon test <file.axon>` → Run `@test` blocks
- `axon fmt <file.axon>` → Format source
- `axon init` → Scaffold a new project

---

## 11. Runtime Library (`axon_runtime.ts`)

The compiled TypeScript depends on a small runtime:

```typescript
// Result type
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

// Option helpers
export function some<T>(value: T): T { return value; }
export const none = null;

// Pipe helper (for complex pipes)
export function pipe<T>(value: T, ...fns: Function[]): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}

// Refinement validation error
export class RefinementError extends Error {
  constructor(public typeName: string, public constraint: string, public value: unknown) {
    super(`${typeName} validation failed: ${constraint} (got ${JSON.stringify(value)})`);
  }
}
```

---

## 12. Implementation Roadmap

### Milestone 1 — "Hello World" (MVP)
- [ ] Lexer with basic tokens (no indentation handling yet, use explicit `do`/`end`)
- [ ] Parser for: type signatures, function definitions, let bindings, literals, basic expressions
- [ ] Codegen for: functions, let bindings, if/else, basic types (Int, String, Bool)
- [ ] CLI: `axon build` and `axon run`
- [ ] Runtime library with Result/Option types
- **Goal**: Compile and run a pure function that takes args and returns a value

### Milestone 2 — Type System
- [ ] Record types
- [ ] Enum types (ADTs)
- [ ] Pattern matching with exhaustiveness checking
- [ ] Generics / type parameters
- [ ] Type inference (basic)
- [ ] Refinement types with generated validators

### Milestone 3 — Effects & Modules
- [ ] `module ... needs` syntax
- [ ] Dependency injection codegen
- [ ] `@effect` annotations
- [ ] Effect inference and checking
- [ ] Import/export system
- [ ] `pub` visibility

### Milestone 4 — Ergonomics
- [ ] `<-` monadic bind with `?` error tagging
- [ ] `|>` pipe operator
- [ ] String interpolation
- [ ] Significant indentation (INDENT/DEDENT tokens)
- [ ] `@intent`, `@invariant`, `@deprecated` annotations
- [ ] `@test` blocks with built-in runner
- [ ] Formatted error messages with source snippets

### Milestone 5 — Standard Library & Polish
- [ ] Core stdlib (String, List, Map, Option, Result functions)
- [ ] Json, Http, Fs modules
- [ ] Source maps
- [ ] `axon fmt` formatter
- [ ] `axon init` project scaffolding
- [ ] Documentation generator from `@intent` + type signatures
- [ ] LSP server for editor support (stretch goal)

---

## 13. Testing Strategy

Each compiler phase should have its own test suite:

```
tests/
├── lexer/
│   ├── tokens.test.ts        -- Individual token recognition
│   ├── indentation.test.ts   -- INDENT/DEDENT generation
│   └── errors.test.ts        -- Malformed input
├── parser/
│   ├── expressions.test.ts   -- Literals, operators, calls
│   ├── types.test.ts         -- Type annotations, refinements
│   ├── functions.test.ts     -- Function defs, lambdas
│   ├── patterns.test.ts      -- Match expressions
│   └── modules.test.ts       -- Module declarations
├── checker/
│   ├── types.test.ts         -- Type checking & inference
│   ├── effects.test.ts       -- Effect tracking
│   └── exhaustive.test.ts    -- Pattern exhaustiveness
├── codegen/
│   ├── snapshot.test.ts      -- Snapshot tests: axon -> ts
│   └── e2e.test.ts           -- Compile + run + assert output
└── examples/
    └── integration.test.ts   -- Full programs compile & run correctly
```

Use **snapshot testing** for codegen: store expected TypeScript output and diff against actual.

---

## 14. Example Programs

### 14.1 FizzBuzz

```
@intent "Classic FizzBuzz for numbers 1 to n"
@effect console
fizzbuzz : Int -> Unit
fizzbuzz n =
  for i in 1..n do
    print (match (i % 3, i % 5)
      (0, 0) => "FizzBuzz"
      (0, _) => "Fizz"
      (_, 0) => "Buzz"
      _      => "${i}")
```

### 14.2 REST API Handler

```
module TodoApi needs [db: TodoStore, auth: AuthService]

type TodoId = String { format: "uuid" }
type Title = String { min_length: 1, max_length: 200 }

type Todo = {
  id: TodoId
  title: Title
  done: Bool
  owner: UserId
}

enum TodoError =
  | NotFound
  | Unauthorized
  | InvalidInput { reason: String }

@intent "Create a new todo for the authenticated user"
@effect db.write, http.response
pub create : Request -> Result Todo TodoError
create req = do
  user    <- auth.verify(req.token)     ? Unauthorized
  title   <- parse_title(req.body.title) ? InvalidInput
  todo    <- db.insert({ title: title, done: false, owner: user.id })
  ok todo

@intent "Toggle the done status of a todo"
@effect db.read, db.write
pub toggle : TodoId -> UserId -> Result Todo TodoError
toggle id user_id = do
  todo <- db.find(id)                   ? NotFound
  _    <- check(todo.owner == user_id)  ? Unauthorized
  db.update(id, { done: !todo.done })
```

### 14.3 Data Pipeline

```
module Analytics needs [db: EventStore, cache: Cache]

type Event = {
  user_id: UserId
  action: String
  timestamp: String
  metadata: Map String String
}

type Report = {
  total_events: Int
  unique_users: Int
  top_actions: List (String, Int)
}

@intent "Generate a usage report for the given time range"
@effect db.read, cache.read, cache.write
pub generate_report : String -> String -> Result Report DbError
generate_report from to = do
  cached <- cache.get("report:${from}:${to}")
  match cached
    Some report => ok report
    None => do
      events <- db.query_range(from, to)
      report = build_report(events)
      cache.set("report:${from}:${to}", report, ttl: 1h)
      ok report

@effect none
build_report : List Event -> Report
build_report events = {
  total_events: length(events)
  unique_users: events |> map(e => e.user_id) |> unique |> length
  top_actions: events
    |> group_by(e => e.action)
    |> map_entries((action, evts) => (action, length(evts)))
    |> sort_by((_, count) => -count)
    |> take(10)
}
```

---

## 15. Design Principles Summary

| Principle              | Mechanism                                  | Why It Helps AI                         |
|------------------------|--------------------------------------------|-----------------------------------------|
| Semantic density       | No braces, no return, no var/let/const     | Fewer tokens = more code in context     |
| Explicit effects       | `@effect` system                           | AI knows what a function can do         |
| Preserved intent       | `@intent` annotations                      | AI understands *why*, not just *what*   |
| Forced error handling  | `Result` type + `<-` operator              | No hidden exceptions to miss            |
| Exhaustive matching    | Compiler-enforced exhaustive match         | AI can't forget a case                  |
| Colocation             | Module-level deps, inline tests            | Everything in one file = full context   |
| Structural typing      | Records are structurally typed             | Less boilerplate, flexible composition  |
| Pure by default        | Functions without `@effect` must be pure   | Safe to refactor, reorder, cache        |
| Refinement types       | Constraints in the type, not scattered     | Validation is guaranteed, not forgotten |
| Dependency injection   | `module needs` syntax                      | Easy to mock, test, swap implementations|

---

## Appendix A: Full Grammar (EBNF-like)

```ebnf
program        = module_decl? (import_stmt)* (declaration)*

module_decl    = "module" IDENT ("needs" "[" dep_list "]")?
dep_list       = dep ("," dep)*
dep            = IDENT ":" TYPE_IDENT

import_stmt    = "import" import_spec "from" STRING
import_spec    = IDENT | "{" IDENT ("," IDENT)* "}"

declaration    = annotation* (type_decl | enum_decl | func_decl | test_decl | trait_decl | impl_decl)

annotation     = "@" IDENT expr

type_decl      = "type" TYPE_IDENT generics? "=" type_expr
enum_decl      = "enum" TYPE_IDENT generics? "=" ("|" variant)+
variant        = TYPE_IDENT ("{" field_list "}")?
field_list     = field ("," field)*
field          = IDENT ":" type_expr

trait_decl     = "trait" TYPE_IDENT IDENT "=" INDENT (func_sig)+ DEDENT
impl_decl      = "impl" TYPE_IDENT TYPE_IDENT "=" INDENT (func_decl)+ DEDENT

func_decl      = func_sig? IDENT param* "=" expr
func_sig       = "pub"? IDENT ":" type_expr

type_expr      = base_type | func_type | list_type | map_type | tuple_type 
               | record_type | refined_type | generic_apply
base_type      = TYPE_IDENT
func_type      = type_expr "->" type_expr
list_type      = "List" type_expr
map_type       = "Map" type_expr type_expr
tuple_type     = "(" type_expr ("," type_expr)+ ")"
record_type    = "{" field_list "}"
refined_type   = base_type "{" constraint_list "}"
generic_apply  = TYPE_IDENT type_expr+
generics       = IDENT+

expr           = let_expr | do_expr | match_expr | if_expr | pipe_expr
               | lambda | binary_expr | unary_expr | call_expr
               | literal | IDENT | "(" expr ")"

let_expr       = "let" IDENT "=" expr "in" expr
do_expr        = "do" INDENT (do_line)+ DEDENT
do_line        = bind_line | expr
bind_line      = IDENT "<-" expr ("?" TYPE_IDENT)?

match_expr     = "match" expr INDENT (match_arm)+ DEDENT
match_arm      = pattern ("if" expr)? "=>" expr
pattern        = literal | IDENT | "_" | TYPE_IDENT ("{" pattern_fields "}")? 
               | "(" pattern ("," pattern)* ")"

if_expr        = "if" expr "then" expr "else" expr

pipe_expr      = expr ("|>" expr)+
lambda         = "(" param_list? ")" "=>" expr | IDENT "=>" expr
binary_expr    = expr BINOP expr
unary_expr     = UNOP expr
call_expr      = expr "(" arg_list? ")"

literal        = INT | FLOAT | STRING | CHAR | BOOL | list_lit | record_lit
list_lit       = "[" (expr ("," expr)*)? "]"
record_lit     = "{" (IDENT ":" expr ("," IDENT ":" expr)*)? "}"

test_decl      = "@test" STRING INDENT (assert_stmt)+ DEDENT
assert_stmt    = "assert" expr

BINOP          = "+" | "-" | "*" | "/" | "%" | "**" | "==" | "!=" | "<" | ">" 
               | "<=" | ">=" | "&&" | "||" | "++" | "&"
UNOP           = "-" | "!"
```

---

## Appendix B: Error Messages Philosophy

Error messages must be:
1. **Actionable** — tell the user what to do, not just what went wrong
2. **Located** — show the exact source position with a code snippet
3. **Contextual** — explain *why* this is an error in Axon's model

Example:
```
error[E042]: Effect mismatch in function `login`

  --> src/auth.axon:14:3
   |
14 |   user <- db.find_user(email) ? UserNotFound
   |           ^^^^^^^^^^^^^^^^^^^ this call has effect `db.read`
   |
   = help: function `login` is declared with `@effect http.response`
           but calls `db.find_user` which requires `db.read`
   = fix: add `db.read` to the effect annotation:
           @effect db.read, http.response
```
