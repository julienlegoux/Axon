import { test, expect, describe } from "bun:test";
import { Lexer } from "../../src/lexer/lexer.ts";
import { TokenType } from "../../src/lexer/tokens.ts";

describe("Lexer", () => {
  test("tokenizes type signature: add : Int -> Int -> Int", () => {
    const lexer = new Lexer("add : Int -> Int -> Int");
    const tokens = lexer.tokenize();
    const types = tokens.map((t) => t.type);

    expect(types).toContain(TokenType.IDENT);
    expect(types).toContain(TokenType.COLON);
    expect(types).toContain(TokenType.TYPE_IDENT);
    expect(types).toContain(TokenType.ARROW);

    expect(tokens[0].value).toBe("add");
    expect(tokens[0].type).toBe(TokenType.IDENT);
    expect(tokens[1].type).toBe(TokenType.COLON);
    expect(tokens[2].value).toBe("Int");
    expect(tokens[2].type).toBe(TokenType.TYPE_IDENT);
    expect(tokens[3].type).toBe(TokenType.ARROW);
  });

  test("tokenizes integer literals", () => {
    const lexer = new Lexer("42 0 100");
    const tokens = lexer.tokenize();
    const ints = tokens.filter((t) => t.type === TokenType.INT);
    expect(ints.length).toBe(3);
    expect(ints[0].value).toBe("42");
    expect(ints[1].value).toBe("0");
    expect(ints[2].value).toBe("100");
  });

  test("tokenizes float literals", () => {
    const lexer = new Lexer("3.14 0.5");
    const tokens = lexer.tokenize();
    const floats = tokens.filter((t) => t.type === TokenType.FLOAT);
    expect(floats.length).toBe(2);
    expect(floats[0].value).toBe("3.14");
  });

  test("tokenizes string literals", () => {
    const lexer = new Lexer('"hello world"');
    const tokens = lexer.tokenize();
    const strings = tokens.filter((t) => t.type === TokenType.STRING);
    expect(strings.length).toBe(1);
    expect(strings[0].value).toBe("hello world");
  });

  test("tokenizes boolean literals", () => {
    const lexer = new Lexer("true false");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.TRUE);
    expect(tokens[1].type).toBe(TokenType.FALSE);
  });

  test("tokenizes operators: <- |> => -> ==", () => {
    const lexer = new Lexer("<- |> => -> ==");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.BIND);
    expect(tokens[1].type).toBe(TokenType.PIPE);
    expect(tokens[2].type).toBe(TokenType.FAT_ARROW);
    expect(tokens[3].type).toBe(TokenType.ARROW);
    expect(tokens[4].type).toBe(TokenType.EQ);
  });

  test("recognizes keywords", () => {
    const lexer = new Lexer("module match if then else let in do where enum type");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.MODULE);
    expect(tokens[1].type).toBe(TokenType.MATCH);
    expect(tokens[2].type).toBe(TokenType.IF);
    expect(tokens[3].type).toBe(TokenType.THEN);
    expect(tokens[4].type).toBe(TokenType.ELSE);
    expect(tokens[5].type).toBe(TokenType.LET);
    expect(tokens[6].type).toBe(TokenType.IN);
    expect(tokens[7].type).toBe(TokenType.DO);
    expect(tokens[8].type).toBe(TokenType.WHERE);
    expect(tokens[9].type).toBe(TokenType.ENUM);
    expect(tokens[10].type).toBe(TokenType.TYPE);
  });

  test("differentiates IDENT from TYPE_IDENT", () => {
    const lexer = new Lexer("add Int myFunc String");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.IDENT);
    expect(tokens[1].type).toBe(TokenType.TYPE_IDENT);
    expect(tokens[2].type).toBe(TokenType.IDENT);
    expect(tokens[3].type).toBe(TokenType.TYPE_IDENT);
  });

  test("generates INDENT/DEDENT for nested blocks", () => {
    const source = "main =\n  add 3 4\n";
    const lexer = new Lexer(source);
    const tokens = lexer.tokenize();
    const types = tokens.map((t) => t.type);
    expect(types).toContain(TokenType.INDENT);
    expect(types).toContain(TokenType.DEDENT);
  });

  test("skips line comments", () => {
    const lexer = new Lexer("-- this is a comment\n42");
    const tokens = lexer.tokenize();
    const ints = tokens.filter((t) => t.type === TokenType.INT);
    expect(ints.length).toBe(1);
    expect(ints[0].value).toBe("42");
  });

  test("tokenizes multi-char operators", () => {
    const lexer = new Lexer("++ ** :: .. != <= >=");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.CONCAT);
    expect(tokens[1].type).toBe(TokenType.POWER);
    expect(tokens[2].type).toBe(TokenType.DOUBLE_COLON);
    expect(tokens[3].type).toBe(TokenType.SPREAD);
    expect(tokens[4].type).toBe(TokenType.NEQ);
    expect(tokens[5].type).toBe(TokenType.LTE);
    expect(tokens[6].type).toBe(TokenType.GTE);
  });

  test("tokenizes delimiters", () => {
    const lexer = new Lexer("( ) [ ] { } ,");
    const tokens = lexer.tokenize();
    expect(tokens[0].type).toBe(TokenType.LPAREN);
    expect(tokens[1].type).toBe(TokenType.RPAREN);
    expect(tokens[2].type).toBe(TokenType.LBRACKET);
    expect(tokens[3].type).toBe(TokenType.RBRACKET);
    expect(tokens[4].type).toBe(TokenType.LBRACE);
    expect(tokens[5].type).toBe(TokenType.RBRACE);
    expect(tokens[6].type).toBe(TokenType.COMMA);
  });
});
