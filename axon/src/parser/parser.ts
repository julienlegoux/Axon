import { TokenType, Token } from "../lexer/tokens.ts";
import type {
  Program,
  Declaration,
  FuncDecl,
  TypeSig,
  TypeExpr,
  Expr,
  Annotation,
  EnumDecl,
  EnumVariant,
  TypeDecl,
  MatchArm,
  Pattern,
  ModuleDecl,
  ImportDecl,
  TraitDecl,
  ImplDecl,
  TestDecl,
  DoStatement,
} from "./ast.ts";

/** Operator precedence levels for Pratt parsing */
const enum Prec {
  NONE = 0,
  PIPE = 1,
  OR = 2,
  AND = 3,
  EQUALITY = 4,
  COMPARISON = 5,
  CONCAT = 6,
  ADDITIVE = 7,
  MULTIPLICATIVE = 8,
  POWER = 9,
  UNARY = 10,
  CALL = 11,
  MEMBER = 12,
}

function tokenPrec(type: TokenType): Prec {
  switch (type) {
    // PIPE is handled separately in parsePipeExpr, not here
    case TokenType.OR: return Prec.OR;
    case TokenType.AND: return Prec.AND;
    case TokenType.EQ:
    case TokenType.NEQ: return Prec.EQUALITY;
    case TokenType.LT:
    case TokenType.GT:
    case TokenType.LTE:
    case TokenType.GTE: return Prec.COMPARISON;
    case TokenType.CONCAT:
    case TokenType.AMPERSAND: return Prec.CONCAT;
    case TokenType.PLUS:
    case TokenType.MINUS: return Prec.ADDITIVE;
    case TokenType.STAR:
    case TokenType.SLASH:
    case TokenType.PERCENT: return Prec.MULTIPLICATIVE;
    case TokenType.POWER: return Prec.POWER;
    case TokenType.DOT: return Prec.MEMBER;
    default: return Prec.NONE;
  }
}

function isBinaryOp(type: TokenType): boolean {
  return tokenPrec(type) > Prec.NONE;
}

function opString(type: TokenType): string {
  switch (type) {
    case TokenType.PLUS: return "+";
    case TokenType.MINUS: return "-";
    case TokenType.STAR: return "*";
    case TokenType.SLASH: return "/";
    case TokenType.PERCENT: return "%";
    case TokenType.POWER: return "**";
    case TokenType.EQ: return "==";
    case TokenType.NEQ: return "!=";
    case TokenType.LT: return "<";
    case TokenType.GT: return ">";
    case TokenType.LTE: return "<=";
    case TokenType.GTE: return ">=";
    case TokenType.AND: return "&&";
    case TokenType.OR: return "||";
    case TokenType.CONCAT: return "++";
    case TokenType.AMPERSAND: return "&";
    case TokenType.PIPE: return "|>";
    case TokenType.DOT: return ".";
    default: return type;
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    // Filter out COMMENT tokens but keep NEWLINE for expression boundaries
    this.tokens = tokens.filter(
      (t) => t.type !== TokenType.COMMENT
    );
  }

  parse(): Program {
    const declarations: Declaration[] = [];
    while (!this.isAtEnd()) {
      this.skipNewlines();
      if (this.isAtEnd()) break;
      const decl = this.parseDeclaration();
      if (decl) declarations.push(decl);
    }
    return { kind: "Program", declarations };
  }

  private parseDeclaration(): Declaration | null {
    this.skipNewlines();
    if (this.isAtEnd()) return null;

    // Collect annotations
    const annotations: Annotation[] = [];
    while (this.check(TokenType.AT)) {
      annotations.push(this.parseAnnotation());
      this.skipNewlines();
    }

    // Module declaration
    if (this.check(TokenType.MODULE)) {
      return this.parseModuleDecl();
    }

    // Import declaration
    if (this.check(TokenType.IMPORT)) {
      return this.parseImportDecl();
    }

    // Type declaration
    if (this.check(TokenType.TYPE)) {
      return this.parseTypeDecl(annotations);
    }

    // Enum declaration
    if (this.check(TokenType.ENUM)) {
      return this.parseEnumDecl(annotations);
    }

    // Trait declaration
    if (this.check(TokenType.TRAIT)) {
      return this.parseTraitDecl(annotations);
    }

    // Impl declaration
    if (this.check(TokenType.IMPL)) {
      return this.parseImplDecl(annotations);
    }

    // Test declaration
    if (annotations.some((a) => a.name === "test")) {
      return this.parseTestDecl(annotations);
    }

    // Pub prefix
    let isPublic = false;
    if (this.check(TokenType.PUB)) {
      isPublic = true;
      this.advance();
      this.skipNewlines();
    }

    // Function: either type signature or definition
    if (this.check(TokenType.IDENT)) {
      return this.parseFuncOrTypeSig(annotations, isPublic);
    }

    // Skip unknown tokens
    this.advance();
    return null;
  }

  private parseAnnotation(): Annotation {
    this.expect(TokenType.AT);
    const name = this.current().value;
    this.advance(); // consume annotation name

    let value = "";
    // Read annotation value - could be a string or identifier(s)
    if (this.check(TokenType.STRING)) {
      value = this.current().value;
      this.advance();
    } else {
      // Read remaining tokens until NEWLINE as annotation value
      const parts: string[] = [];
      while (
        !this.isAtEnd() &&
        !this.check(TokenType.AT) &&
        !this.check(TokenType.NEWLINE) &&
        !this.check(TokenType.INDENT) &&
        !this.check(TokenType.DEDENT) &&
        !this.check(TokenType.EOF) &&
        !this.isDeclarationStart()
      ) {
        parts.push(this.current().value);
        this.advance();
      }
      value = parts.join(" ");
    }

    return { kind: "Annotation", name, value };
  }

  private isDeclarationStart(): boolean {
    const t = this.current().type;
    return (
      t === TokenType.PUB ||
      t === TokenType.TYPE ||
      t === TokenType.ENUM ||
      t === TokenType.MODULE ||
      t === TokenType.IMPORT ||
      t === TokenType.TRAIT ||
      t === TokenType.IMPL
    );
  }

  private parseModuleDecl(): ModuleDecl {
    this.expect(TokenType.MODULE);
    const name = this.expect(TokenType.TYPE_IDENT).value;
    const needs: { name: string; type: string }[] = [];

    if (this.check(TokenType.NEEDS)) {
      this.advance();
      this.expect(TokenType.LBRACKET);
      while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
        const depName = this.expect(TokenType.IDENT).value;
        this.expect(TokenType.COLON);
        const depType = this.expect(TokenType.TYPE_IDENT).value;
        needs.push({ name: depName, type: depType });
        if (this.check(TokenType.COMMA)) this.advance();
      }
      this.expect(TokenType.RBRACKET);
    }

    return { kind: "ModuleDecl", name, needs };
  }

  private parseImportDecl(): ImportDecl {
    this.expect(TokenType.IMPORT);

    let isDefault = true;
    const names: string[] = [];

    if (this.check(TokenType.LBRACE)) {
      isDefault = false;
      this.advance();
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        names.push(this.current().value);
        this.advance();
        if (this.check(TokenType.COMMA)) this.advance();
      }
      this.expect(TokenType.RBRACE);
    } else {
      names.push(this.current().value);
      this.advance();
    }

    this.expect(TokenType.FROM);
    const module = this.expect(TokenType.STRING).value;

    let alias: string | undefined;
    if (this.check(TokenType.AS)) {
      this.advance();
      alias = this.current().value;
      this.advance();
    }

    return { kind: "ImportDecl", names, module, alias, isDefault };
  }

  private parseTypeDecl(annotations: Annotation[]): TypeDecl {
    this.expect(TokenType.TYPE);

    let isPublic = false;
    // Check if pub was consumed before type keyword or handle it
    const name = this.expect(TokenType.TYPE_IDENT).value;

    // Collect type parameters
    const typeParams: string[] = [];
    while (this.check(TokenType.IDENT)) {
      typeParams.push(this.current().value);
      this.advance();
    }

    this.expect(TokenType.ASSIGN);
    const typeExpr = this.parseTypeExpr();

    return { kind: "TypeDecl", name, typeParams, typeExpr, isPublic, annotations };
  }

  private parseEnumDecl(annotations: Annotation[]): EnumDecl {
    this.expect(TokenType.ENUM);
    const name = this.expect(TokenType.TYPE_IDENT).value;

    const typeParams: string[] = [];
    while (this.check(TokenType.IDENT)) {
      typeParams.push(this.current().value);
      this.advance();
    }

    this.expect(TokenType.ASSIGN);
    this.skipNewlines();

    // Skip INDENT if present
    if (this.check(TokenType.INDENT)) this.advance();

    const variants: EnumVariant[] = [];
    while (this.check(TokenType.BAR)) {
      this.advance(); // skip |
      const variantName = this.expect(TokenType.TYPE_IDENT).value;
      const fields: { name: string; type: TypeExpr }[] = [];

      if (this.check(TokenType.LBRACE)) {
        this.advance();
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const fieldName = this.expect(TokenType.IDENT).value;
          this.expect(TokenType.COLON);
          const fieldType = this.parseTypeExpr();
          fields.push({ name: fieldName, type: fieldType });
          if (this.check(TokenType.COMMA)) this.advance();
        }
        this.expect(TokenType.RBRACE);
      }

      variants.push({ name: variantName, fields });
      this.skipNewlines();
    }

    // Skip DEDENT if present
    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "EnumDecl", name, typeParams, variants, isPublic: false, annotations };
  }

  private parseTraitDecl(annotations: Annotation[]): TraitDecl {
    this.expect(TokenType.TRAIT);
    const name = this.expect(TokenType.TYPE_IDENT).value;
    const typeParam = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.ASSIGN);
    this.skipNewlines();

    if (this.check(TokenType.INDENT)) this.advance();

    const methods: TypeSig[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd() && !this.isDeclarationStart()) {
      if (this.check(TokenType.IDENT)) {
        const sig = this.parseTypeSigOnly(false);
        if (sig) methods.push(sig);
      } else {
        break;
      }
    }

    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "TraitDecl", name, typeParam, methods, annotations };
  }

  private parseImplDecl(annotations: Annotation[]): ImplDecl {
    this.expect(TokenType.IMPL);
    const traitName = this.expect(TokenType.TYPE_IDENT).value;
    const typeName = this.expect(TokenType.TYPE_IDENT).value;
    this.expect(TokenType.ASSIGN);
    this.skipNewlines();

    if (this.check(TokenType.INDENT)) this.advance();

    const methods: FuncDecl[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      if (this.check(TokenType.IDENT)) {
        const decl = this.parseFuncOrTypeSig([], false);
        if (decl && decl.kind === "FuncDecl") methods.push(decl);
      } else {
        break;
      }
    }

    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "ImplDecl", traitName, typeName, methods, annotations };
  }

  private parseTestDecl(annotations: Annotation[]): TestDecl {
    const testAnnotation = annotations.find((a) => a.name === "test")!;
    const description = testAnnotation.value;

    if (this.check(TokenType.INDENT)) this.advance();

    const body = this.parseExpr();

    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "TestDecl", description, body, annotations };
  }

  private parseFuncOrTypeSig(
    annotations: Annotation[],
    isPublic: boolean
  ): FuncDecl | null {
    // Look ahead to determine if this is a type signature or function definition
    const savedPos = this.pos;
    const name = this.current().value;

    // Check if it's a type signature: name : Type -> ...
    this.advance();
    if (this.check(TokenType.COLON)) {
      this.pos = savedPos;
      return this.parseFuncDeclWithSig(annotations, isPublic);
    }

    // Otherwise, it's a function definition: name params = body
    this.pos = savedPos;
    return this.parseFuncDefOnly(annotations);
  }

  private parseTypeSigOnly(isPublic: boolean): TypeSig | null {
    const name = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.COLON);

    const typeExprs: TypeExpr[] = [];
    typeExprs.push(this.parseTypeAtom());

    while (this.check(TokenType.ARROW)) {
      this.advance();
      typeExprs.push(this.parseTypeAtom());
    }

    const returnType = typeExprs.pop()!;
    return { kind: "TypeSig", name, params: typeExprs, returnType, isPublic };
  }

  private parseFuncDeclWithSig(
    annotations: Annotation[],
    isPublic: boolean
  ): FuncDecl | null {
    // Parse type signature
    const name = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.COLON);

    const typeExprs: TypeExpr[] = [];
    typeExprs.push(this.parseTypeAtom());

    while (this.check(TokenType.ARROW)) {
      this.advance();
      typeExprs.push(this.parseTypeAtom());
    }

    const returnType = typeExprs.pop()!;
    const typeSig: TypeSig = {
      kind: "TypeSig",
      name,
      params: typeExprs,
      returnType,
      isPublic,
    };

    this.skipNewlines();

    // Now parse the function definition
    if (this.check(TokenType.IDENT) && this.current().value === name) {
      this.advance(); // consume function name

      // Parse parameters: collect IDENT tokens until we hit ASSIGN (=)
      const params: string[] = [];
      while (this.check(TokenType.IDENT) && !this.isAtEnd()) {
        params.push(this.current().value);
        this.advance();
      }

      this.expect(TokenType.ASSIGN);
      this.skipNewlines();

      // Handle INDENT for multi-line bodies
      let hasIndent = false;
      if (this.check(TokenType.INDENT)) {
        hasIndent = true;
        this.advance();
      }

      const body = this.parseExpr();

      if (hasIndent && this.check(TokenType.DEDENT)) {
        this.advance();
      }

      return { kind: "FuncDecl", name, params, body, typeSig, annotations };
    }

    // Type sig without body - might be in a trait
    // Return as a func decl with empty body
    return {
      kind: "FuncDecl",
      name,
      params: [],
      body: { kind: "Ident", name: "undefined" },
      typeSig,
      annotations,
    };
  }

  private parseFuncDefOnly(annotations: Annotation[]): FuncDecl | null {
    const name = this.expect(TokenType.IDENT).value;

    const params: string[] = [];
    while (this.check(TokenType.IDENT) && !this.isAtEnd()) {
      params.push(this.current().value);
      this.advance();
    }

    this.expect(TokenType.ASSIGN);
    this.skipNewlines();

    let hasIndent = false;
    if (this.check(TokenType.INDENT)) {
      hasIndent = true;
      this.advance();
    }

    const body = this.parseExpr();

    if (hasIndent && this.check(TokenType.DEDENT)) {
      this.advance();
    }

    return { kind: "FuncDecl", name, params, body, annotations };
  }

  // ---- Type Expression Parsing ----

  private parseTypeExpr(): TypeExpr {
    let left = this.parseTypeAtom();

    // Function type: A -> B
    while (this.check(TokenType.ARROW)) {
      this.advance();
      const right = this.parseTypeAtom();
      left = { kind: "FuncType", from: left, to: right };
    }

    return left;
  }

  private parseTypeAtom(): TypeExpr {
    // Record type: { name: Type, ... }
    if (this.check(TokenType.LBRACE)) {
      return this.parseRecordTypeExpr();
    }

    // Tuple type: (Type, Type, ...)
    if (this.check(TokenType.LPAREN)) {
      return this.parseTupleTypeExpr();
    }

    // Named type or generic application
    if (this.check(TokenType.TYPE_IDENT)) {
      const name = this.current().value;
      this.advance();

      // Check for refinement type: TypeName { constraints }
      if (this.check(TokenType.LBRACE)) {
        return this.parseRefinedTypeExpr(name);
      }

      // Check for generic application: List a, Map k v, Result a e
      if (name === "List" && this.hasTypeArg()) {
        const elemType = this.parseTypeAtom();
        return { kind: "ListType", elementType: elemType };
      }

      if (name === "Map" && this.hasTypeArg()) {
        const keyType = this.parseTypeAtom();
        const valType = this.parseTypeAtom();
        return { kind: "MapType", keyType, valueType: valType };
      }

      // Generic type application
      const args: TypeExpr[] = [];
      while (this.hasTypeArg()) {
        args.push(this.parseTypeAtom());
      }

      if (args.length > 0) {
        return { kind: "GenericType", name, args };
      }

      return { kind: "NamedType", name };
    }

    // Lowercase type variable (e.g., `a` in generics)
    if (this.check(TokenType.IDENT)) {
      const name = this.current().value;
      this.advance();
      return { kind: "NamedType", name };
    }

    throw this.error(`Expected type expression, got ${this.current().type} (${this.current().value})`);
  }

  private hasTypeArg(): boolean {
    if (this.check(TokenType.ARROW)) return false;

    // LPAREN or LBRACE could be tuple/record types
    if (this.check(TokenType.LPAREN) || this.check(TokenType.LBRACE)) return true;

    // TYPE_IDENT is always a type arg (e.g., Result Int String)
    if (this.check(TokenType.TYPE_IDENT)) return true;

    // Lowercase IDENT could be a type variable (e.g., `a` in `List a`)
    // BUT we need to avoid consuming function definition names.
    // If this IDENT is followed by `:` or `=` or another IDENT then `=`,
    // it's likely a declaration, not a type arg.
    if (this.check(TokenType.IDENT)) {
      const nextIdx = this.pos + 1;
      if (nextIdx < this.tokens.length) {
        const nextTok = this.tokens[nextIdx].type;
        // If followed by `:` or `=`, it's a declaration start
        if (nextTok === TokenType.COLON || nextTok === TokenType.ASSIGN) return false;
        // If followed by another IDENT (i.e., function params), it's a declaration
        if (nextTok === TokenType.IDENT) return false;
      }
      return true;
    }

    return false;
  }

  private parseRecordTypeExpr(): RecordType {
    this.expect(TokenType.LBRACE);
    const fields: { name: string; type: TypeExpr }[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      const fieldName = this.expect(TokenType.IDENT).value;
      this.expect(TokenType.COLON);
      const fieldType = this.parseTypeExpr();
      fields.push({ name: fieldName, type: fieldType });
      if (this.check(TokenType.COMMA)) this.advance();
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE);
    return { kind: "RecordType", fields };
  }

  private parseTupleTypeExpr(): TupleType {
    this.expect(TokenType.LPAREN);
    const elements: TypeExpr[] = [];
    elements.push(this.parseTypeExpr());
    while (this.check(TokenType.COMMA)) {
      this.advance();
      elements.push(this.parseTypeExpr());
    }
    this.expect(TokenType.RPAREN);
    return { kind: "TupleType", elements };
  }

  private parseRefinedTypeExpr(baseName: string): RefinedType {
    this.expect(TokenType.LBRACE);
    const constraints: { name: string; value: Expr }[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      const cName = this.expect(TokenType.IDENT).value;
      this.expect(TokenType.COLON);
      const cValue = this.parseExpr();
      constraints.push({ name: cName, value: cValue });
      if (this.check(TokenType.COMMA)) this.advance();
    }

    this.expect(TokenType.RBRACE);
    return {
      kind: "RefinedType",
      baseType: { kind: "NamedType", name: baseName },
      constraints,
    };
  }

  // ---- Expression Parsing (Pratt) ----

  parseExpr(): Expr {
    return this.parsePipeExpr();
  }

  private parsePipeExpr(): Expr {
    let left = this.parseBinaryExpr(Prec.NONE);

    while (this.check(TokenType.PIPE)) {
      this.advance();
      this.skipNewlines();
      const right = this.parseBinaryExpr(Prec.NONE);
      left = { kind: "PipeExpr", left, right };
    }

    return left;
  }

  private parseBinaryExpr(minPrec: Prec): Expr {
    let left = this.parseUnaryExpr();

    while (!this.isAtEnd()) {
      const op = this.current().type;
      const prec = tokenPrec(op);
      if (prec <= minPrec) break;

      // Handle member access
      if (op === TokenType.DOT) {
        this.advance();
        const prop = this.current().value;
        this.advance();
        left = { kind: "MemberExpr", object: left, property: prop };
        continue;
      }

      this.advance();
      this.skipNewlines();

      // Right-associative for power
      const nextMinPrec = op === TokenType.POWER ? prec - 1 : prec;
      const right = this.parseBinaryExpr(nextMinPrec);

      left = { kind: "BinaryExpr", op: opString(op), left, right };
    }

    return left;
  }

  private parseUnaryExpr(): Expr {
    if (this.check(TokenType.NOT)) {
      this.advance();
      const operand = this.parseUnaryExpr();
      return { kind: "UnaryExpr", op: "!", operand };
    }

    if (this.check(TokenType.MINUS)) {
      // Check if this is unary minus (not binary)
      // Unary minus: at start, after operator, or after open paren/bracket
      const prev = this.pos > 0 ? this.tokens[this.pos - 1] : null;
      if (
        !prev ||
        prev.type === TokenType.LPAREN ||
        prev.type === TokenType.LBRACKET ||
        prev.type === TokenType.COMMA ||
        prev.type === TokenType.ASSIGN ||
        prev.type === TokenType.FAT_ARROW ||
        isBinaryOp(prev.type)
      ) {
        this.advance();
        const operand = this.parseUnaryExpr();
        return { kind: "UnaryExpr", op: "-", operand };
      }
    }

    return this.parseCallExpr();
  }

  private parseCallExpr(): Expr {
    let expr = this.parseAtom();

    while (true) {
      if (this.check(TokenType.LPAREN)) {
        this.advance();
        const args: Expr[] = [];
        while (!this.check(TokenType.RPAREN) && !this.isAtEnd()) {
          args.push(this.parseExpr());
          if (this.check(TokenType.COMMA)) this.advance();
        }
        this.expect(TokenType.RPAREN);
        expr = { kind: "CallExpr", callee: expr, args };
      } else if (this.check(TokenType.DOT)) {
        this.advance();
        const prop = this.current().value;
        this.advance();
        expr = { kind: "MemberExpr", object: expr, property: prop };
      } else {
        break;
      }
    }

    // Handle juxtaposition-style function calls: `add 3 4`
    // Only if callee is an identifier and next tokens are atoms
    if (expr.kind === "Ident" && this.isAtomStart() && !this.isExprTerminator()) {
      const args: Expr[] = [];
      while (this.isAtomStart() && !this.isExprTerminator()) {
        args.push(this.parseAtom());
      }
      if (args.length > 0) {
        expr = { kind: "CallExpr", callee: expr, args };
      }
    }

    return expr;
  }

  private isAtomStart(): boolean {
    const t = this.current().type;
    return (
      t === TokenType.INT ||
      t === TokenType.FLOAT ||
      t === TokenType.STRING ||
      t === TokenType.CHAR ||
      t === TokenType.TRUE ||
      t === TokenType.FALSE ||
      t === TokenType.LPAREN ||
      t === TokenType.LBRACKET ||
      (t === TokenType.IDENT && !this.isKeywordAtCurrent()) ||
      t === TokenType.TYPE_IDENT
    );
  }

  private isKeywordAtCurrent(): boolean {
    const v = this.current().value;
    return (
      v === "match" ||
      v === "if" ||
      v === "let" ||
      v === "do" ||
      v === "where" ||
      v === "in" ||
      v === "then" ||
      v === "else"
    );
  }

  private isExprTerminator(): boolean {
    const t = this.current().type;
    return (
      t === TokenType.RPAREN ||
      t === TokenType.RBRACKET ||
      t === TokenType.RBRACE ||
      t === TokenType.COMMA ||
      t === TokenType.DEDENT ||
      t === TokenType.EOF ||
      t === TokenType.FAT_ARROW ||
      t === TokenType.PIPE ||
      t === TokenType.THEN ||
      t === TokenType.ELSE ||
      t === TokenType.IN ||
      t === TokenType.NEWLINE
    );
  }

  private parseAtom(): Expr {
    const tok = this.current();

    switch (tok.type) {
      case TokenType.INT:
        this.advance();
        return { kind: "IntLit", value: parseInt(tok.value, 10) };

      case TokenType.FLOAT:
        this.advance();
        return { kind: "FloatLit", value: parseFloat(tok.value) };

      case TokenType.STRING:
        this.advance();
        return this.parseStringLit(tok.value);

      case TokenType.CHAR:
        this.advance();
        return { kind: "CharLit", value: tok.value };

      case TokenType.TRUE:
        this.advance();
        return { kind: "BoolLit", value: true };

      case TokenType.FALSE:
        this.advance();
        return { kind: "BoolLit", value: false };

      case TokenType.IDENT:
        return this.parseIdentOrLambda();

      case TokenType.TYPE_IDENT:
        return this.parseConstructorOrIdent();

      case TokenType.UNDERSCORE:
        this.advance();
        return { kind: "Ident", name: "_" };

      case TokenType.LPAREN:
        return this.parseParenExpr();

      case TokenType.LBRACKET:
        return this.parseListLit();

      case TokenType.LBRACE:
        return this.parseRecordLit();

      case TokenType.IF:
        return this.parseIfExpr();

      case TokenType.MATCH:
        return this.parseMatchExpr();

      case TokenType.LET:
        return this.parseLetExpr();

      case TokenType.DO:
        return this.parseDoExpr();

      case TokenType.FOR:
        return this.parseForExpr();

      case TokenType.OK:
        return this.parseOkErrExpr("ok");

      case TokenType.ERR:
        return this.parseOkErrExpr("err");

      case TokenType.SPREAD:
        this.advance();
        return { kind: "SpreadExpr", expr: this.parseAtom() };

      default:
        throw this.error(`Unexpected token: ${tok.type} (${tok.value})`);
    }
  }

  private parseStringLit(raw: string): Expr {
    // Check for string interpolation: ${...}
    if (raw.includes("${")) {
      return { kind: "StringLit", value: raw };
    }
    return { kind: "StringLit", value: raw };
  }

  private parseIdentOrLambda(): Expr {
    const name = this.current().value;

    // Check for lambda: `x => expr`
    if (this.pos + 1 < this.tokens.length && this.tokens[this.pos + 1].type === TokenType.FAT_ARROW) {
      this.advance(); // consume ident
      this.advance(); // consume =>
      this.skipNewlines();
      const body = this.parseExpr();
      return { kind: "LambdaExpr", params: [name], body };
    }

    this.advance();
    return { kind: "Ident", name };
  }

  private parseConstructorOrIdent(): Expr {
    const name = this.current().value;
    this.advance();

    // Constructor with fields: Type { field: value, ... }
    if (this.check(TokenType.LBRACE)) {
      this.advance();
      const fields: { name: string; value: Expr }[] = [];
      while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
        if (this.check(TokenType.SPREAD)) {
          this.advance();
          const expr = this.parseExpr();
          fields.push({ name: "...", value: expr });
        } else {
          const fieldName = this.expect(TokenType.IDENT).value;
          this.expect(TokenType.COLON);
          const fieldValue = this.parseExpr();
          fields.push({ name: fieldName, value: fieldValue });
        }
        if (this.check(TokenType.COMMA)) this.advance();
      }
      this.expect(TokenType.RBRACE);
      return { kind: "ConstructorExpr", name, fields };
    }

    return { kind: "Ident", name };
  }

  private parseParenExpr(): Expr {
    this.expect(TokenType.LPAREN);

    // Empty parens
    if (this.check(TokenType.RPAREN)) {
      this.advance();
      return { kind: "TupleLit", elements: [] };
    }

    const first = this.parseExpr();

    // Lambda: (params) => expr
    if (this.check(TokenType.COMMA)) {
      const elements: Expr[] = [first];
      while (this.check(TokenType.COMMA)) {
        this.advance();
        if (this.check(TokenType.RPAREN)) break;
        elements.push(this.parseExpr());
      }
      this.expect(TokenType.RPAREN);

      // Check if this is a lambda: (a, b) => expr
      if (this.check(TokenType.FAT_ARROW)) {
        this.advance();
        this.skipNewlines();
        const params = elements.map((e) => {
          if (e.kind === "Ident") return e.name;
          throw this.error("Lambda parameters must be identifiers");
        });
        const body = this.parseExpr();
        return { kind: "LambdaExpr", params, body };
      }

      // Tuple literal
      return { kind: "TupleLit", elements };
    }

    this.expect(TokenType.RPAREN);

    // Check for lambda: (x) => expr
    if (this.check(TokenType.FAT_ARROW)) {
      this.advance();
      this.skipNewlines();
      if (first.kind !== "Ident") {
        throw this.error("Lambda parameter must be an identifier");
      }
      const body = this.parseExpr();
      return { kind: "LambdaExpr", params: [first.name], body };
    }

    return { kind: "ParenExpr", expr: first };
  }

  private parseListLit(): Expr {
    this.expect(TokenType.LBRACKET);
    const elements: Expr[] = [];
    while (!this.check(TokenType.RBRACKET) && !this.isAtEnd()) {
      elements.push(this.parseExpr());
      if (this.check(TokenType.COMMA)) this.advance();
    }
    this.expect(TokenType.RBRACKET);
    return { kind: "ListLit", elements };
  }

  private parseRecordLit(): Expr {
    this.expect(TokenType.LBRACE);
    const fields: { name: string; value: Expr; spread?: boolean }[] = [];

    while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.SPREAD)) {
        this.advance();
        const expr = this.parseExpr();
        fields.push({ name: "...", value: expr, spread: true });
      } else {
        const fieldName = this.expect(TokenType.IDENT).value;
        this.expect(TokenType.COLON);
        const fieldValue = this.parseExpr();
        fields.push({ name: fieldName, value: fieldValue });
      }
      if (this.check(TokenType.COMMA)) this.advance();
      this.skipNewlines();
    }

    this.expect(TokenType.RBRACE);
    return { kind: "RecordLit", fields };
  }

  private parseIfExpr(): Expr {
    this.expect(TokenType.IF);
    const condition = this.parseExpr();
    this.expect(TokenType.THEN);
    this.skipNewlines();
    const thenBranch = this.parseExpr();
    this.expect(TokenType.ELSE);
    this.skipNewlines();
    const elseBranch = this.parseExpr();
    return { kind: "IfExpr", condition, thenBranch, elseBranch };
  }

  private parseMatchExpr(): Expr {
    this.expect(TokenType.MATCH);
    const subject = this.parseExpr();
    this.skipNewlines();

    if (this.check(TokenType.INDENT)) this.advance();

    const arms: MatchArm[] = [];
    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;
      const arm = this.parseMatchArm();
      arms.push(arm);
      this.skipNewlines();
    }

    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "MatchExpr", subject, arms };
  }

  private parseMatchArm(): MatchArm {
    const pattern = this.parsePattern();
    let guard: Expr | undefined;

    if (this.check(TokenType.IF)) {
      this.advance();
      guard = this.parseExpr();
    }

    this.expect(TokenType.FAT_ARROW);
    this.skipNewlines();
    const body = this.parseExpr();

    return { pattern, guard, body };
  }

  private parsePattern(): Pattern {
    // Tuple pattern: (p1, p2, ...)
    if (this.check(TokenType.LPAREN)) {
      this.advance();
      const elements: Pattern[] = [];
      elements.push(this.parsePattern());
      while (this.check(TokenType.COMMA)) {
        this.advance();
        elements.push(this.parsePattern());
      }
      this.expect(TokenType.RPAREN);
      return { kind: "TuplePattern", elements };
    }

    // Wildcard
    if (this.check(TokenType.UNDERSCORE)) {
      this.advance();
      return { kind: "WildcardPattern" };
    }

    // Constructor pattern: TypeName or TypeName { fields }
    if (this.check(TokenType.TYPE_IDENT)) {
      const name = this.current().value;
      this.advance();

      if (this.check(TokenType.LBRACE)) {
        this.advance();
        const fields: { name: string; pattern: Pattern }[] = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
          const fieldName = this.expect(TokenType.IDENT).value;
          // Check if there's a nested pattern
          let fieldPattern: Pattern = { kind: "IdentPattern", name: fieldName };
          if (this.check(TokenType.COLON)) {
            this.advance();
            fieldPattern = this.parsePattern();
          }
          fields.push({ name: fieldName, pattern: fieldPattern });
          if (this.check(TokenType.COMMA)) this.advance();
        }
        this.expect(TokenType.RBRACE);
        return { kind: "ConstructorPattern", name, fields };
      }

      // Constructor with positional arg(s), e.g. Some x
      if (this.check(TokenType.IDENT) && !this.checkAhead(TokenType.FAT_ARROW, 1)) {
        const argName = this.current().value;
        this.advance();
        return {
          kind: "ConstructorPattern",
          name,
          fields: [],
          positionalFields: [{ kind: "IdentPattern", name: argName }],
        };
      }

      // Just a constructor name (no fields)
      return { kind: "ConstructorPattern", name, fields: [] };
    }

    // Ok/Err patterns
    if (this.check(TokenType.OK) || this.check(TokenType.ERR)) {
      const name = this.current().value === "ok" ? "Ok" : "Err";
      this.advance();
      if (this.check(TokenType.IDENT)) {
        const argName = this.current().value;
        this.advance();
        return {
          kind: "ConstructorPattern",
          name,
          fields: [],
          positionalFields: [{ kind: "IdentPattern", name: argName }],
        };
      }
      return { kind: "ConstructorPattern", name, fields: [] };
    }

    // Literal patterns
    if (this.check(TokenType.INT)) {
      const val = this.current().value;
      this.advance();
      return { kind: "LiteralPattern", value: { kind: "IntLit", value: parseInt(val, 10) } };
    }

    if (this.check(TokenType.FLOAT)) {
      const val = this.current().value;
      this.advance();
      return { kind: "LiteralPattern", value: { kind: "FloatLit", value: parseFloat(val) } };
    }

    if (this.check(TokenType.STRING)) {
      const val = this.current().value;
      this.advance();
      return { kind: "LiteralPattern", value: { kind: "StringLit", value: val } };
    }

    if (this.check(TokenType.TRUE)) {
      this.advance();
      return { kind: "LiteralPattern", value: { kind: "BoolLit", value: true } };
    }

    if (this.check(TokenType.FALSE)) {
      this.advance();
      return { kind: "LiteralPattern", value: { kind: "BoolLit", value: false } };
    }

    // Identifier pattern (variable binding)
    if (this.check(TokenType.IDENT)) {
      const name = this.current().value;
      this.advance();
      return { kind: "IdentPattern", name };
    }

    throw this.error(`Expected pattern, got ${this.current().type}`);
  }

  private parseLetExpr(): Expr {
    this.expect(TokenType.LET);
    const name = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.ASSIGN);
    this.skipNewlines();

    let hasIndent = false;
    if (this.check(TokenType.INDENT)) {
      hasIndent = true;
      this.advance();
    }

    const value = this.parseExpr();

    if (hasIndent && this.check(TokenType.DEDENT)) {
      this.advance();
    }

    this.expect(TokenType.IN);
    this.skipNewlines();

    const body = this.parseExpr();
    return { kind: "LetExpr", name, value, body };
  }

  private parseDoExpr(): Expr {
    this.expect(TokenType.DO);
    this.skipNewlines();

    if (this.check(TokenType.INDENT)) this.advance();

    const statements: DoStatement[] = [];

    while (!this.check(TokenType.DEDENT) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenType.DEDENT) || this.isAtEnd()) break;

      // Check for bind: name <- expr ? ErrorTag
      if (this.check(TokenType.IDENT) || this.check(TokenType.UNDERSCORE)) {
        const savedPos = this.pos;
        const name = this.current().value;
        this.advance();

        if (this.check(TokenType.BIND)) {
          this.advance();
          const expr = this.parseExpr();
          let errorTag: string | undefined;
          if (this.check(TokenType.QUESTION)) {
            this.advance();
            errorTag = this.current().value;
            this.advance();
          }
          statements.push({ kind: "DoBindStmt", name, expr, errorTag });
          this.skipNewlines();
          continue;
        }

        // Check for let in do block: let name = expr (or just name = expr)
        if (this.check(TokenType.ASSIGN)) {
          this.advance();
          this.skipNewlines();
          const expr = this.parseExpr();
          statements.push({ kind: "DoLetStmt", name, expr });
          this.skipNewlines();
          continue;
        }

        // Not a bind or let - restore and parse as expression
        this.pos = savedPos;
      }

      // let bindings in do block
      if (this.check(TokenType.LET)) {
        this.advance();
        const name = this.expect(TokenType.IDENT).value;
        this.expect(TokenType.ASSIGN);
        this.skipNewlines();
        const expr = this.parseExpr();
        // Check if there's an `in` clause
        if (this.check(TokenType.IN)) {
          this.advance();
          this.skipNewlines();
          const body = this.parseExpr();
          statements.push({ kind: "DoExprStmt", expr: { kind: "LetExpr", name, value: expr, body } });
        } else {
          statements.push({ kind: "DoLetStmt", name, expr });
        }
        this.skipNewlines();
        continue;
      }

      const expr = this.parseExpr();
      statements.push({ kind: "DoExprStmt", expr });
      this.skipNewlines();
    }

    if (this.check(TokenType.DEDENT)) this.advance();

    return { kind: "DoExpr", statements };
  }

  private parseForExpr(): Expr {
    this.expect(TokenType.FOR);
    const variable = this.expect(TokenType.IDENT).value;
    this.expect(TokenType.IN);
    const iterable = this.parseExpr();
    this.expect(TokenType.DO);
    this.skipNewlines();

    let hasIndent = false;
    if (this.check(TokenType.INDENT)) {
      hasIndent = true;
      this.advance();
    }

    const body = this.parseExpr();

    if (hasIndent && this.check(TokenType.DEDENT)) {
      this.advance();
    }

    return { kind: "ForExpr", variable, iterable, body };
  }

  private parseOkErrExpr(which: "ok" | "err"): Expr {
    this.advance(); // consume ok/err keyword
    const arg = this.parseAtom();
    return { kind: "CallExpr", callee: { kind: "Ident", name: which }, args: [arg] };
  }

  // ---- Utility Methods ----

  private current(): Token {
    return this.tokens[this.pos] ?? { type: TokenType.EOF, value: "", line: 0, column: 0 };
  }

  private check(type: TokenType): boolean {
    return this.current().type === type;
  }

  private checkAhead(type: TokenType, offset: number): boolean {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return false;
    return this.tokens[idx].type === type;
  }

  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length) this.pos++;
    return tok;
  }

  private expect(type: TokenType): Token {
    if (this.current().type !== type) {
      throw this.error(`Expected ${type}, got ${this.current().type} (${this.current().value})`);
    }
    return this.advance();
  }

  private isAtEnd(): boolean {
    return this.current().type === TokenType.EOF;
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE)) {
      this.advance();
    }
  }

  private error(message: string): Error {
    const tok = this.current();
    return new Error(`Parse error at line ${tok.line}, column ${tok.column}: ${message}`);
  }
}
