import { test, expect, describe } from "bun:test";
import { Lexer } from "../../src/lexer/lexer.ts";
import { Parser } from "../../src/parser/parser.ts";

function parse(source: string) {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe("Parser", () => {
  test("parses type signature: add : Int -> Int -> Int", () => {
    const ast = parse("add : Int -> Int -> Int\nadd a b = a + b");
    expect(ast.declarations.length).toBe(1);
    const decl = ast.declarations[0];
    expect(decl.kind).toBe("FuncDecl");
    if (decl.kind === "FuncDecl") {
      expect(decl.name).toBe("add");
      expect(decl.typeSig).toBeDefined();
      expect(decl.typeSig!.name).toBe("add");
      expect(decl.typeSig!.params.length).toBe(2);
      expect(decl.typeSig!.returnType.kind).toBe("NamedType");
    }
  });

  test("parses function definition: add a b = a + b", () => {
    const ast = parse("add a b = a + b");
    const decl = ast.declarations[0];
    expect(decl.kind).toBe("FuncDecl");
    if (decl.kind === "FuncDecl") {
      expect(decl.name).toBe("add");
      expect(decl.params).toEqual(["a", "b"]);
      expect(decl.body.kind).toBe("BinaryExpr");
    }
  });

  test("parses function call: add 3 4", () => {
    const ast = parse("f x = add 3 4");
    const decl = ast.declarations[0];
    if (decl.kind === "FuncDecl") {
      expect(decl.body.kind).toBe("CallExpr");
      if (decl.body.kind === "CallExpr") {
        expect(decl.body.callee.kind).toBe("Ident");
        expect(decl.body.args.length).toBe(2);
      }
    }
  });

  test("respects operator precedence: a + b * c", () => {
    const ast = parse("f x = a + b * c");
    const decl = ast.declarations[0];
    if (decl.kind === "FuncDecl") {
      expect(decl.body.kind).toBe("BinaryExpr");
      if (decl.body.kind === "BinaryExpr") {
        expect(decl.body.op).toBe("+");
        expect(decl.body.left.kind).toBe("Ident");
        expect(decl.body.right.kind).toBe("BinaryExpr");
        if (decl.body.right.kind === "BinaryExpr") {
          expect(decl.body.right.op).toBe("*");
        }
      }
    }
  });

  test("parses parenthesized function call: square (double 3)", () => {
    const ast = parse("f x = square (double 3)");
    const decl = ast.declarations[0];
    if (decl.kind === "FuncDecl") {
      expect(decl.body.kind).toBe("CallExpr");
    }
  });

  test("parses annotations", () => {
    const ast = parse('@intent "Test function"\nadd : Int -> Int -> Int\nadd a b = a + b');
    const decl = ast.declarations[0];
    if (decl.kind === "FuncDecl") {
      expect(decl.annotations.length).toBe(1);
      expect(decl.annotations[0].name).toBe("intent");
      expect(decl.annotations[0].value).toBe("Test function");
    }
  });

  test("parses multiple function declarations", () => {
    const source = `add : Int -> Int -> Int
add a b = a + b

mul : Int -> Int -> Int
mul a b = a * b`;
    const ast = parse(source);
    expect(ast.declarations.length).toBe(2);
  });

  test("parses boolean and comparison expressions", () => {
    const ast = parse("f x = x > 0");
    const decl = ast.declarations[0];
    if (decl.kind === "FuncDecl") {
      expect(decl.body.kind).toBe("BinaryExpr");
      if (decl.body.kind === "BinaryExpr") {
        expect(decl.body.op).toBe(">");
      }
    }
  });
});
