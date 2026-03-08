# Axon Language Compiler — Claude Code Implementation Prompt

You are building **Axon**, a programming language designed for AI-native coding. You have a full specification in `AXON_SPEC.md` in this directory — read it thoroughly before writing any code.

## Critical Rules

1. **Read `AXON_SPEC.md` FIRST.** Do not start coding until you have read the entire spec.
2. **Work incrementally.** Follow the milestones below IN ORDER. Do not skip ahead.
3. **Test every phase before moving on.** Each milestone ends with a validation step. If tests fail, fix them before proceeding.
4. **Use TypeScript for the compiler.** The compiler is written in TypeScript, targeting Bun as runtime.
5. **No external parser libraries.** Write the lexer and parser by hand (recursive descent + Pratt parsing for expressions). This is essential for learning and control.
6. **Commit-quality code.** Clean, well-typed, well-commented. No `any` types unless absolutely necessary.

## Project Setup

Initialize the project first:

```bash
mkdir -p axon/src/{lexer,parser,checker,codegen} axon/tests/{lexer,parser,codegen,e2e} axon/examples axon/stdlib
cd axon
bun init -y
```

Create `tsconfig.json` with strict mode enabled. Add a `"scripts"` section in `package.json`:
```json
{
  "scripts": {
    "build": "bun build src/cli.ts --outdir dist --target node",
    "test": "bun test",
    "axon": "bun run src/cli.ts"
  }
}
```

Install dev dependency: `bun add -d @types/bun`

---

## MILESTONE 1 — Lexer + Basic Parser + Codegen + CLI (Core Pipeline)

**Goal**: Compile and run a simple Axon program that defines a pure function, calls it, and prints the result.

### Target program (`examples/hello.axon`):

```
-- First Axon program

add : Int -> Int -> Int
add a b = a + b

main : Int
main = add 3 4
```

Expected compiled output (`hello.ts`):
```typescript
function add(a: number, b: number): number {
  return a + b;
}

function main(): number {
  return add(3, 4);
}

// Entry point
console.log(main());
```

### Step 1.1 — Token Types (`src/lexer/tokens.ts`)

Define a `TokenType` enum with at minimum:
```
// Literals
INT, FLOAT, STRING, CHAR, TRUE, FALSE

// Identifiers & Types
IDENT,          // lowercase start: variable/function names
TYPE_IDENT,     // uppercase start: type names

// Keywords
MODULE, NEEDS, TYPE, ALIAS, ENUM, MATCH, IF, THEN, ELSE,
LET, IN, DO, WHERE, PUB, MUT, OK, ERR, IMPORT, FROM, AS,
FOR, YIELD, RETURN, WITH, TRAIT, IMPL

// Operators
PLUS, MINUS, STAR, SLASH, PERCENT, POWER,
EQ, NEQ, LT, GT, LTE, GTE,
AND, OR, NOT,
ASSIGN,         // =
ARROW,          // ->
BIND,           // <-
PIPE,           // |>
BAR,            // |
COLON,          // :
QUESTION,       // ?
DOUBLE_COLON,   // ::
AT,             // @
SPREAD,         // ..
UNDERSCORE,     // _
FAT_ARROW,      // =>
CONCAT,         // ++
AMPERSAND,      // &

// Delimiters
LPAREN, RPAREN, LBRACKET, RBRACKET, LBRACE, RBRACE, COMMA,

// Whitespace
INDENT, DEDENT, NEWLINE,

// Special
EOF, COMMENT
```

Define a `Token` interface:
```typescript
interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
```

### Step 1.2 — Lexer (`src/lexer/lexer.ts`)

Implement a `Lexer` class that takes a source string and produces `Token[]`.

Key behaviors:
- Skip `--` single-line comments (but store them for potential `@intent` extraction later)
- Differentiate `IDENT` (starts lowercase or `_`) from `TYPE_IDENT` (starts uppercase)
- Recognize keywords from identifiers using a lookup table
- Handle multi-char operators: `->`, `<-`, `|>`, `=>`, `::`, `..`, `++`, `==`, `!=`, `<=`, `>=`, `&&`, `||`, `**`
- **Indentation tracking**: Track indent levels using a stack. At each NEWLINE, compare leading spaces to current indent level. Emit `INDENT` token if deeper, `DEDENT` token(s) if shallower. Use 2-space increments.
- String literals with `${...}` interpolation: for MVP, just tokenize as a single STRING token. Interpolation can come later.

Write tests (`tests/lexer/lexer.test.ts`):
- Tokenize `add : Int -> Int -> Int` → verify token types and values
- Tokenize integers, strings, booleans
- Tokenize operators: `<-`, `|>`, `=>`, `->`, `==`
- Verify INDENT/DEDENT generation for nested blocks
- Verify keywords are recognized (not treated as IDENT)

**Run `bun test` and make sure all lexer tests pass before continuing.**

### Step 1.3 — AST Node Types (`src/parser/ast.ts`)

Define AST node types. Use discriminated unions with a `kind` field:

```typescript
type ASTNode = Program | FuncDecl | TypeSig | ... ;

interface Program {
  kind: "Program";
  declarations: Declaration[];
}

interface FuncDecl {
  kind: "FuncDecl";
  name: string;
  params: string[];
  body: Expr;
  typeSig?: TypeSig;
  annotations: Annotation[];
}

interface TypeSig {
  kind: "TypeSig";
  name: string;
  params: TypeExpr[];
  returnType: TypeExpr;
  isPublic: boolean;
}
```

Define expression nodes:
```
IntLit, FloatLit, StringLit, BoolLit,
Ident, BinaryExpr, UnaryExpr, CallExpr, IfExpr,
MatchExpr, LetExpr, DoExpr, BindExpr, PipeExpr, LambdaExpr,
ListLit, RecordLit, TupleLit, MemberExpr
```

Define type expression nodes:
```
NamedType, FuncType, ListType, MapType, TupleType, RecordType, RefinedType, GenericType
```

Define declaration nodes:
```
FuncDecl, TypeDecl, EnumDecl, ModuleDecl, ImportDecl, TraitDecl, ImplDecl, TestDecl
```

### Step 1.4 — Parser (`src/parser/parser.ts`)

Implement a recursive descent parser with Pratt parsing for expressions.

**Operator precedence (lowest to highest):**
```
1. |>  (pipe, left-associative)
2. || (logical or)
3. && (logical and)
4. == != (equality)
5. < > <= >= (comparison)
6. ++ & (concat)
7. + - (additive)
8. * / % (multiplicative)
9. ** (power, right-associative)
10. ! - (unary prefix)
11. function application (juxtaposition)
```

For Milestone 1, implement parsing of:
- Type signatures (`name : Type -> Type -> ReturnType`)
- Function declarations (`name params = body`)
- Binary expressions (arithmetic and comparison)
- Integer and string literals
- Identifiers
- Function calls (juxtaposition: `add 3 4` and also `add(3, 4)` paren style)
- Annotations (`@intent "..."`, `@effect ...`) — parse and attach to next declaration
- Comments (skip)

**Important**: In Axon, function application by juxtaposition (`add 3 4`) has the highest precedence. The parser must handle this. `add 3 4` means `add(3)(4)` but for MVP, treat it as `add(3, 4)` — collect arguments until you hit something that's not an atom.

Write tests (`tests/parser/parser.test.ts`):
- Parse `add : Int -> Int -> Int` into a TypeSig node
- Parse `add a b = a + b` into a FuncDecl node
- Parse `add 3 4` into a CallExpr
- Parse nested expressions: `a + b * c` respects precedence
- Parse annotations attached to functions

**Run `bun test` and make sure all parser tests pass before continuing.**

### Step 1.5 — Code Generator (`src/codegen/codegen.ts`)

Implement a `generate(ast: Program): string` function that walks the AST and emits TypeScript.

Mapping rules for Milestone 1:
- `Int`, `Float` → `number`
- `String` → `string`
- `Bool` → `boolean`
- `Unit` → `void`
- Function declarations → TypeScript functions
- Binary expressions → same operators (Axon `**` → TS `**`, etc.)
- Function calls → standard TS call syntax
- If a function named `main` exists, append `console.log(main());` at the end

Write snapshot tests (`tests/codegen/codegen.test.ts`):
- Compile `add : Int -> Int -> Int\nadd a b = a + b` and verify output
- Compile program with `main` and verify entry point is generated

**Run `bun test` and make sure all codegen tests pass before continuing.**

### Step 1.6 — CLI (`src/cli.ts`)

Create a CLI with subcommands:
- `axon build <file.axon>` — Read file, lex, parse, generate, write `.ts` file next to source
- `axon run <file.axon>` — Build then execute with `bun run <output.ts>`
- `axon check <file.axon>` — Parse only, report errors (for now, just syntax check)

Use `process.argv` directly, no CLI library needed for MVP.

### Step 1.7 — End-to-End Validation

Create `examples/hello.axon`:
```
-- First Axon program
add : Int -> Int -> Int
add a b = a + b

main : Int
main = add 3 4
```

Run: `bun run src/cli.ts run examples/hello.axon`

Expected output: `7`

Create `examples/math.axon`:
```
-- Basic math operations
square : Int -> Int
square x = x * x

double : Int -> Int
double x = x + x

main : Int
main = square (double 3)
```

Expected output: `36`

Create an e2e test (`tests/e2e/e2e.test.ts`) that:
1. Compiles each example file
2. Runs the generated TypeScript
3. Asserts the expected output

**Run all tests. Everything must pass before moving to Milestone 2.**

---

## MILESTONE 2 — Type System: Records, Enums, Pattern Matching, Refinement Types

**Goal**: Support algebraic data types, pattern matching, and refinement types.

### Target program (`examples/shapes.axon`):

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

main : Float
main = area (Circle { radius: 5.0 })
```

Expected output: `78.53975`

### Step 2.1 — Enum (ADT) parsing and codegen

Parse `enum` declarations with variants, including variants with fields.

**Codegen**: Emit TypeScript discriminated unions:
```typescript
type Shape =
  | { _tag: "Circle"; radius: number }
  | { _tag: "Rect"; width: number; height: number }
  | { _tag: "Point" };

const Circle = (args: { radius: number }): Shape => ({ _tag: "Circle", ...args });
const Rect = (args: { width: number; height: number }): Shape => ({ _tag: "Rect", ...args });
const Point: Shape = { _tag: "Point" };
```

### Step 2.2 — Record types

Parse record type declarations: `type User = { name: String, email: String }`

Codegen: Emit TypeScript interfaces.

### Step 2.3 — Pattern matching

Parse `match` expressions with:
- Constructor patterns: `Circle { radius }`
- Literal patterns: `0`, `"hello"`, `true`
- Wildcard: `_`
- Variable binding: `x`
- Tuple patterns: `(0, _)`
- Guard clauses: `Some x if x > 0 => ...`

Codegen: Emit `switch` on `_tag` for enum matching, or chained ternaries for other patterns.

### Step 2.4 — Refinement types (basic)

Parse: `type Email = String { matches: /^[^@]+@[^@]+$/ }`

Codegen: Emit branded type + validation function:
```typescript
type Email = string & { readonly __brand: "Email" };
function parseEmail(raw: string): Result<Email, string> { ... }
```

### Step 2.5 — Tests and Validation

- Parse and compile `examples/shapes.axon`, verify output `78.53975`
- Add `examples/option.axon` using `Option` type (Some/None pattern matching)
- Snapshot tests for enum codegen, match codegen, refinement type codegen

**All tests must pass before proceeding.**

---

## MILESTONE 3 — Effects, Modules, and Dependency Injection

**Goal**: Implement the module system with `needs` (DI), `@effect` annotations, and imports.

### Target program (`examples/modules/`):

`examples/modules/store.axon`:
```
module Store

pub type Item = { id: Int, name: String, price: Float }

trait ItemStore a =
  find : Int -> Result Item String
  save : Item -> Result Item String
```

`examples/modules/app.axon`:
```
module App needs [store: ItemStore]

@intent "Get an item by ID, return 404 if not found"
@effect db.read
pub get_item : Int -> Result Item String
get_item id = do
  item <- store.find(id) ? "NotFound"
  ok item

main : String
main = match get_item(1)
  Ok item => item.name
  Err e => e
```

### Step 3.1 — Module declaration parsing

Parse `module Name needs [dep: Type, ...]`

### Step 3.2 — Module codegen as class

```typescript
export class App {
  constructor(private store: ItemStore) {}
  
  get_item(id: number): Result<Item, string> { ... }
}
```

### Step 3.3 — Do-notation and bind operator

Parse `do` blocks with `<-` bind and `?` error tag.

Codegen:
```typescript
const _r0 = this.store.find(id);
if (!_r0.ok) return err("NotFound");
const item = _r0.value;
return ok(item);
```

### Step 3.4 — Effect annotations

Parse `@effect` annotations and store them in the AST. For now, just preserve them as JSDoc in output. Full effect checking is a stretch goal.

### Step 3.5 — Import system

Parse `import X from "./file"` and `import { a, b } from "./file"`.

Codegen: Emit TypeScript `import` statements.

### Step 3.6 — Validation

- Compile the multi-module example
- Verify do-notation desugars correctly
- Test `<-` with `?` error tagging
- Test `ok` and `err` constructors

**All tests must pass before proceeding.**

---

## MILESTONE 4 — Ergonomics: Pipes, Lambdas, String Interpolation, Let/Where

**Goal**: Make Axon feel expressive and pleasant.

### Target program (`examples/pipeline.axon`):

```
type User = { name: String, age: Int, active: Bool }

adults : List User -> List String
adults users =
  users
    |> filter(u => u.active)
    |> filter(u => u.age >= 18)
    |> map(u => u.name)
    |> sort_by(a => a)

greet : String -> String
greet name = "Hello, ${name}!"

describe : List User -> String
describe users =
  let names = adults(users)
  in "Found ${length(names)} adults: ${join(", ", names)}"
```

### Step 4.1 — Pipe operator `|>`

Parse and desugar: `a |> f(b)` → `f(b, a)` (last argument position).

Handle chained pipes.

### Step 4.2 — Lambda expressions

Parse: `(x) => x + 1`, `x => x + 1`, `(a, b) => a + b`

Codegen: Arrow functions.

### Step 4.3 — String interpolation

Lex `"Hello, ${name}!"` as a template literal.

Codegen: TypeScript template literal `` `Hello, ${name}!` ``

### Step 4.4 — Let/in and where clauses

Parse `let x = expr in body` and `body where x = expr`.

Both desugar to the same thing: `const x = expr; return body;`

### Step 4.5 — List/Record literals

Parse `[1, 2, 3]` and `{ name: "Alice", age: 30 }`.

### Step 4.6 — For expressions (basic)

Parse `for x in list do expr` as syntactic sugar for map.

### Step 4.7 — Validation

- Compile `examples/pipeline.axon` with mock data
- Test pipe operator desugaring
- Test lambda codegen
- Test string interpolation
- Test let/in and where

---

## MILESTONE 5 — Standard Library, Tests, Polish

**Goal**: Ship a usable language with built-in functions and a test runner.

### Step 5.1 — Runtime library (`src/runtime.ts`)

Create `axon_runtime.ts` with:
- `Result<T, E>` type and `ok`/`err` helpers
- `Option<T>` as `T | null` with `some`/`none`
- `pipe()` helper
- `RefinementError` class

The compiler prepends `import { ... } from "./axon_runtime"` to all output.

### Step 5.2 — Standard library functions

Implement as TypeScript functions that get bundled:
- `map`, `filter`, `fold`, `find`, `any`, `all`, `head`, `tail`, `length`, `concat`, `flat_map`, `zip`, `sort_by`, `unique`, `group_by`, `chunk`, `take`
- `trim`, `split`, `join`, `contains`, `replace`, `to_upper`, `to_lower`, `starts_with`, `ends_with`
- `abs`, `max`, `min`, `clamp`
- `print`, `debug`

### Step 5.3 — Inline test runner

Parse `@test "description"` blocks.

`axon test <file.axon>` extracts tests, compiles them, runs them, reports results.

### Step 5.4 — Error messages

Implement the error message format from the spec — with source snippets, line/column, and actionable fix suggestions.

### Step 5.5 — Final examples

Create and verify these example programs all compile and run:

`examples/fizzbuzz.axon`:
```
fizzbuzz : Int -> String
fizzbuzz n = match (n % 3, n % 5)
  (0, 0) => "FizzBuzz"
  (0, _) => "Fizz"
  (_, 0) => "Buzz"
  _      => "${n}"

main : Unit
main = for i in 1..15 do
  print(fizzbuzz(i))
```

`examples/todo.axon`:
```
type Todo = { id: Int, title: String, done: Bool }

enum TodoAction =
  | Add { title: String }
  | Toggle { id: Int }
  | Remove { id: Int }

apply : List Todo -> TodoAction -> List Todo
apply todos action = match action
  Add { title } => todos ++ [{ id: length(todos) + 1, title: title, done: false }]
  Toggle { id } => map(t => if t.id == id then { ...t, done: !t.done } else t, todos)
  Remove { id } => filter(t => t.id != id, todos)

main : Unit
main = do
  let todos = []
    |> apply(Add { title: "Learn Axon" })
    |> apply(Add { title: "Build something" })
    |> apply(Toggle { id: 1 })
  in for t in todos do
    print("${if t.done then "[x]" else "[ ]"} ${t.title}")
```

### Step 5.6 — Final Validation

Run the **entire test suite**: `bun test`

Run **every example**: 
```bash
for f in examples/*.axon; do
  echo "=== $f ==="
  bun run src/cli.ts run "$f"
done
```

Verify all compile and produce expected output.

---

## Summary Checklist

At the end, you should have:
- [ ] A working lexer that handles Axon syntax including indentation
- [ ] A recursive descent parser producing a typed AST
- [ ] A code generator emitting clean TypeScript
- [ ] A CLI with `build`, `run`, `check`, and `test` subcommands
- [ ] Support for: functions, enums/ADTs, pattern matching, records, refinement types, do-notation with `<-`, pipe operator, lambdas, string interpolation, let/where, modules with DI, annotations
- [ ] A runtime library and standard library
- [ ] An inline test runner
- [ ] 5+ example programs that compile and run correctly
- [ ] A comprehensive test suite that passes

**Good luck. Build something that makes AI coding feel native.**
