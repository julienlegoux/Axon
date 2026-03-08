import { TokenType, Token, KEYWORDS } from "./tokens.ts";

export class Lexer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];
  private indentStack: number[] = [0];
  private atLineStart: boolean = true;

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      if (this.atLineStart) {
        this.handleIndentation();
        this.atLineStart = false;
      }

      if (this.pos >= this.source.length) break;

      const ch = this.source[this.pos];

      // Newline
      if (ch === "\n") {
        this.emit(TokenType.NEWLINE, "\n");
        this.advance();
        this.line++;
        this.column = 1;
        this.atLineStart = true;
        continue;
      }

      // Carriage return
      if (ch === "\r") {
        this.advance();
        continue;
      }

      // Skip spaces/tabs (not at line start)
      if (ch === " " || ch === "\t") {
        this.advance();
        continue;
      }

      // Comments
      if (ch === "-" && this.peek(1) === "-") {
        if (this.peek(2) === "-") {
          this.readBlockComment();
        } else {
          this.readLineComment();
        }
        continue;
      }

      // String literals
      if (ch === '"') {
        this.readString();
        continue;
      }

      // Char literals
      if (ch === "'") {
        this.readChar();
        continue;
      }

      // Numbers
      if (this.isDigit(ch)) {
        this.readNumber();
        continue;
      }

      // Identifiers and keywords
      if (this.isIdentStart(ch)) {
        this.readIdentifier();
        continue;
      }

      // Operators and symbols
      if (this.readOperator()) {
        continue;
      }

      // Unknown character - skip with error
      this.advance();
    }

    // Emit remaining DEDENTs
    while (this.indentStack.length > 1) {
      this.emit(TokenType.DEDENT, "");
      this.indentStack.pop();
    }

    this.emit(TokenType.EOF, "");
    return this.tokens;
  }

  private handleIndentation(): void {
    let indent = 0;
    while (this.pos < this.source.length && this.source[this.pos] === " ") {
      indent++;
      this.pos++;
      this.column++;
    }

    // Skip blank lines and comment-only lines
    if (
      this.pos >= this.source.length ||
      this.source[this.pos] === "\n" ||
      this.source[this.pos] === "\r"
    ) {
      return;
    }
    if (
      this.source[this.pos] === "-" &&
      this.pos + 1 < this.source.length &&
      this.source[this.pos + 1] === "-"
    ) {
      // Comment line - still process indentation for it, then it'll be skipped
    }

    const currentIndent = this.indentStack[this.indentStack.length - 1];

    if (indent > currentIndent) {
      this.indentStack.push(indent);
      this.emit(TokenType.INDENT, "");
    } else if (indent < currentIndent) {
      while (
        this.indentStack.length > 1 &&
        this.indentStack[this.indentStack.length - 1] > indent
      ) {
        this.indentStack.pop();
        this.emit(TokenType.DEDENT, "");
      }
    }
  }

  private readLineComment(): void {
    const start = this.pos;
    while (this.pos < this.source.length && this.source[this.pos] !== "\n") {
      this.advance();
    }
    // Don't emit comment tokens - just skip them
  }

  private readBlockComment(): void {
    this.advance(); // -
    this.advance(); // -
    this.advance(); // -
    while (this.pos < this.source.length) {
      if (
        this.source[this.pos] === "-" &&
        this.peek(1) === "-" &&
        this.peek(2) === "-"
      ) {
        this.advance();
        this.advance();
        this.advance();
        return;
      }
      if (this.source[this.pos] === "\n") {
        this.line++;
        this.column = 0;
      }
      this.advance();
    }
  }

  private readString(): void {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening quote
    let value = "";
    while (this.pos < this.source.length && this.source[this.pos] !== '"') {
      if (this.source[this.pos] === "\\") {
        this.advance();
        if (this.pos < this.source.length) {
          const esc = this.source[this.pos];
          switch (esc) {
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            case "\\": value += "\\"; break;
            case '"': value += '"'; break;
            case "$": value += "$"; break;
            default: value += esc;
          }
          this.advance();
        }
      } else {
        value += this.source[this.pos];
        this.advance();
      }
    }
    if (this.pos < this.source.length) {
      this.advance(); // skip closing quote
    }
    this.tokens.push({
      type: TokenType.STRING,
      value,
      line: startLine,
      column: startCol,
    });
  }

  private readChar(): void {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // skip opening quote
    let value = "";
    if (this.pos < this.source.length && this.source[this.pos] !== "'") {
      if (this.source[this.pos] === "\\") {
        this.advance();
        if (this.pos < this.source.length) {
          const esc = this.source[this.pos];
          switch (esc) {
            case "n": value = "\n"; break;
            case "t": value = "\t"; break;
            case "\\": value = "\\"; break;
            case "'": value = "'"; break;
            default: value = esc;
          }
        }
      } else {
        value = this.source[this.pos];
      }
      this.advance();
    }
    if (this.pos < this.source.length && this.source[this.pos] === "'") {
      this.advance(); // skip closing quote
    }
    this.tokens.push({
      type: TokenType.CHAR,
      value,
      line: startLine,
      column: startCol,
    });
  }

  private readNumber(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = "";
    let isFloat = false;

    while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
      value += this.source[this.pos];
      this.advance();
    }

    if (
      this.pos < this.source.length &&
      this.source[this.pos] === "." &&
      this.pos + 1 < this.source.length &&
      this.isDigit(this.source[this.pos + 1])
    ) {
      isFloat = true;
      value += ".";
      this.advance();
      while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
        value += this.source[this.pos];
        this.advance();
      }
    }

    this.tokens.push({
      type: isFloat ? TokenType.FLOAT : TokenType.INT,
      value,
      line: startLine,
      column: startCol,
    });
  }

  private readIdentifier(): void {
    const startLine = this.line;
    const startCol = this.column;
    let value = "";
    const firstChar = this.source[this.pos];

    while (
      this.pos < this.source.length &&
      this.isIdentChar(this.source[this.pos])
    ) {
      value += this.source[this.pos];
      this.advance();
    }

    // Check for keywords
    const keyword = KEYWORDS[value];
    if (keyword !== undefined) {
      this.tokens.push({ type: keyword, value, line: startLine, column: startCol });
      return;
    }

    // Underscore alone is a wildcard
    if (value === "_") {
      this.tokens.push({ type: TokenType.UNDERSCORE, value, line: startLine, column: startCol });
      return;
    }

    // Distinguish type identifiers (start with uppercase) from regular identifiers
    const type = this.isUpperCase(firstChar) ? TokenType.TYPE_IDENT : TokenType.IDENT;
    this.tokens.push({ type, value, line: startLine, column: startCol });
  }

  private readOperator(): boolean {
    const ch = this.source[this.pos];
    const next = this.peek(1);
    const startLine = this.line;
    const startCol = this.column;

    const emit2 = (type: TokenType, val: string) => {
      this.tokens.push({ type, value: val, line: startLine, column: startCol });
      this.advance();
      this.advance();
    };

    const emit1 = (type: TokenType, val: string) => {
      this.tokens.push({ type, value: val, line: startLine, column: startCol });
      this.advance();
    };

    switch (ch) {
      case "+":
        if (next === "+") { emit2(TokenType.CONCAT, "++"); }
        else { emit1(TokenType.PLUS, "+"); }
        return true;
      case "-":
        if (next === ">") { emit2(TokenType.ARROW, "->"); }
        else { emit1(TokenType.MINUS, "-"); }
        return true;
      case "*":
        if (next === "*") { emit2(TokenType.POWER, "**"); }
        else { emit1(TokenType.STAR, "*"); }
        return true;
      case "/":
        emit1(TokenType.SLASH, "/");
        return true;
      case "%":
        emit1(TokenType.PERCENT, "%");
        return true;
      case "=":
        if (next === "=") { emit2(TokenType.EQ, "=="); }
        else if (next === ">") { emit2(TokenType.FAT_ARROW, "=>"); }
        else { emit1(TokenType.ASSIGN, "="); }
        return true;
      case "!":
        if (next === "=") { emit2(TokenType.NEQ, "!="); }
        else { emit1(TokenType.NOT, "!"); }
        return true;
      case "<":
        if (next === "=") { emit2(TokenType.LTE, "<="); }
        else if (next === "-") { emit2(TokenType.BIND, "<-"); }
        else { emit1(TokenType.LT, "<"); }
        return true;
      case ">":
        if (next === "=") { emit2(TokenType.GTE, ">="); }
        else { emit1(TokenType.GT, ">"); }
        return true;
      case "&":
        if (next === "&") { emit2(TokenType.AND, "&&"); }
        else { emit1(TokenType.AMPERSAND, "&"); }
        return true;
      case "|":
        if (next === "|") { emit2(TokenType.OR, "||"); }
        else if (next === ">") { emit2(TokenType.PIPE, "|>"); }
        else { emit1(TokenType.BAR, "|"); }
        return true;
      case ":":
        if (next === ":") { emit2(TokenType.DOUBLE_COLON, "::"); }
        else { emit1(TokenType.COLON, ":"); }
        return true;
      case ".":
        if (next === ".") { emit2(TokenType.SPREAD, ".."); }
        else { emit1(TokenType.DOT, "."); }
        return true;
      case "@":
        emit1(TokenType.AT, "@");
        return true;
      case "?":
        emit1(TokenType.QUESTION, "?");
        return true;
      case "_":
        emit1(TokenType.UNDERSCORE, "_");
        return true;
      case "(":
        emit1(TokenType.LPAREN, "(");
        return true;
      case ")":
        emit1(TokenType.RPAREN, ")");
        return true;
      case "[":
        emit1(TokenType.LBRACKET, "[");
        return true;
      case "]":
        emit1(TokenType.RBRACKET, "]");
        return true;
      case "{":
        emit1(TokenType.LBRACE, "{");
        return true;
      case "}":
        emit1(TokenType.RBRACE, "}");
        return true;
      case ",":
        emit1(TokenType.COMMA, ",");
        return true;
      default:
        return false;
    }
  }

  private emit(type: TokenType, value: string): void {
    this.tokens.push({ type, value, line: this.line, column: this.column });
  }

  private advance(): void {
    this.pos++;
    this.column++;
  }

  private peek(offset: number): string | undefined {
    return this.source[this.pos + offset];
  }

  private isDigit(ch: string): boolean {
    return ch >= "0" && ch <= "9";
  }

  private isIdentStart(ch: string): boolean {
    return (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_"
    );
  }

  private isIdentChar(ch: string): boolean {
    return this.isIdentStart(ch) || this.isDigit(ch);
  }

  private isUpperCase(ch: string): boolean {
    return ch >= "A" && ch <= "Z";
  }
}
