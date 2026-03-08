/** Token types for the Axon language */
export enum TokenType {
  // Literals
  INT = "INT",
  FLOAT = "FLOAT",
  STRING = "STRING",
  CHAR = "CHAR",
  TRUE = "TRUE",
  FALSE = "FALSE",

  // Identifiers & Types
  IDENT = "IDENT",
  TYPE_IDENT = "TYPE_IDENT",

  // Keywords
  MODULE = "MODULE",
  NEEDS = "NEEDS",
  TYPE = "TYPE",
  ALIAS = "ALIAS",
  ENUM = "ENUM",
  MATCH = "MATCH",
  IF = "IF",
  THEN = "THEN",
  ELSE = "ELSE",
  LET = "LET",
  IN = "IN",
  DO = "DO",
  WHERE = "WHERE",
  PUB = "PUB",
  MUT = "MUT",
  OK = "OK",
  ERR = "ERR",
  IMPORT = "IMPORT",
  FROM = "FROM",
  AS = "AS",
  FOR = "FOR",
  YIELD = "YIELD",
  RETURN = "RETURN",
  WITH = "WITH",
  TRAIT = "TRAIT",
  IMPL = "IMPL",

  // Operators
  PLUS = "PLUS",
  MINUS = "MINUS",
  STAR = "STAR",
  SLASH = "SLASH",
  PERCENT = "PERCENT",
  POWER = "POWER",
  EQ = "EQ",
  NEQ = "NEQ",
  LT = "LT",
  GT = "GT",
  LTE = "LTE",
  GTE = "GTE",
  AND = "AND",
  OR = "OR",
  NOT = "NOT",
  ASSIGN = "ASSIGN",
  ARROW = "ARROW",
  BIND = "BIND",
  PIPE = "PIPE",
  BAR = "BAR",
  COLON = "COLON",
  QUESTION = "QUESTION",
  DOUBLE_COLON = "DOUBLE_COLON",
  AT = "AT",
  SPREAD = "SPREAD",
  UNDERSCORE = "UNDERSCORE",
  FAT_ARROW = "FAT_ARROW",
  CONCAT = "CONCAT",
  AMPERSAND = "AMPERSAND",
  DOT = "DOT",

  // Delimiters
  LPAREN = "LPAREN",
  RPAREN = "RPAREN",
  LBRACKET = "LBRACKET",
  RBRACKET = "RBRACKET",
  LBRACE = "LBRACE",
  RBRACE = "RBRACE",
  COMMA = "COMMA",

  // Whitespace
  INDENT = "INDENT",
  DEDENT = "DEDENT",
  NEWLINE = "NEWLINE",

  // Special
  EOF = "EOF",
  COMMENT = "COMMENT",
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

/** Keywords lookup table */
export const KEYWORDS: Record<string, TokenType> = {
  module: TokenType.MODULE,
  needs: TokenType.NEEDS,
  type: TokenType.TYPE,
  alias: TokenType.ALIAS,
  enum: TokenType.ENUM,
  match: TokenType.MATCH,
  if: TokenType.IF,
  then: TokenType.THEN,
  else: TokenType.ELSE,
  let: TokenType.LET,
  in: TokenType.IN,
  do: TokenType.DO,
  where: TokenType.WHERE,
  pub: TokenType.PUB,
  mut: TokenType.MUT,
  true: TokenType.TRUE,
  false: TokenType.FALSE,
  ok: TokenType.OK,
  err: TokenType.ERR,
  import: TokenType.IMPORT,
  from: TokenType.FROM,
  as: TokenType.AS,
  for: TokenType.FOR,
  yield: TokenType.YIELD,
  return: TokenType.RETURN,
  with: TokenType.WITH,
  trait: TokenType.TRAIT,
  impl: TokenType.IMPL,
};
