/** AST node types for the Axon language */

// ---- Top-level ----
export type Declaration =
  | FuncDecl
  | TypeDecl
  | EnumDecl
  | ModuleDecl
  | ImportDecl
  | TraitDecl
  | ImplDecl
  | TestDecl;

export interface Program {
  kind: "Program";
  declarations: Declaration[];
}

// ---- Annotations ----
export interface Annotation {
  kind: "Annotation";
  name: string;
  value: string;
}

// ---- Type Expressions ----
export type TypeExpr =
  | NamedType
  | FuncType
  | ListType
  | MapType
  | TupleType
  | RecordType
  | RefinedType
  | GenericType;

export interface NamedType {
  kind: "NamedType";
  name: string;
}

export interface FuncType {
  kind: "FuncType";
  from: TypeExpr;
  to: TypeExpr;
}

export interface ListType {
  kind: "ListType";
  elementType: TypeExpr;
}

export interface MapType {
  kind: "MapType";
  keyType: TypeExpr;
  valueType: TypeExpr;
}

export interface TupleType {
  kind: "TupleType";
  elements: TypeExpr[];
}

export interface RecordType {
  kind: "RecordType";
  fields: { name: string; type: TypeExpr }[];
}

export interface RefinedType {
  kind: "RefinedType";
  baseType: TypeExpr;
  constraints: { name: string; value: Expr }[];
}

export interface GenericType {
  kind: "GenericType";
  name: string;
  args: TypeExpr[];
}

// ---- Expressions ----
export type Expr =
  | IntLit
  | FloatLit
  | StringLit
  | BoolLit
  | CharLit
  | Ident
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | IfExpr
  | MatchExpr
  | LetExpr
  | DoExpr
  | BindExpr
  | PipeExpr
  | LambdaExpr
  | ListLit
  | RecordLit
  | TupleLit
  | MemberExpr
  | SpreadExpr
  | ForExpr
  | ParenExpr
  | ConstructorExpr;

export interface IntLit {
  kind: "IntLit";
  value: number;
}

export interface FloatLit {
  kind: "FloatLit";
  value: number;
}

export interface StringLit {
  kind: "StringLit";
  value: string;
  interpolations?: { expr: Expr; start: number; end: number }[];
}

export interface BoolLit {
  kind: "BoolLit";
  value: boolean;
}

export interface CharLit {
  kind: "CharLit";
  value: string;
}

export interface Ident {
  kind: "Ident";
  name: string;
}

export interface BinaryExpr {
  kind: "BinaryExpr";
  op: string;
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  op: string;
  operand: Expr;
}

export interface CallExpr {
  kind: "CallExpr";
  callee: Expr;
  args: Expr[];
}

export interface IfExpr {
  kind: "IfExpr";
  condition: Expr;
  thenBranch: Expr;
  elseBranch: Expr;
}

export interface MatchExpr {
  kind: "MatchExpr";
  subject: Expr;
  arms: MatchArm[];
}

export interface MatchArm {
  pattern: Pattern;
  guard?: Expr;
  body: Expr;
}

export interface LetExpr {
  kind: "LetExpr";
  name: string;
  value: Expr;
  body: Expr;
}

export interface DoExpr {
  kind: "DoExpr";
  statements: DoStatement[];
}

export type DoStatement =
  | { kind: "DoBindStmt"; name: string; expr: Expr; errorTag?: string }
  | { kind: "DoLetStmt"; name: string; expr: Expr }
  | { kind: "DoExprStmt"; expr: Expr };

export interface BindExpr {
  kind: "BindExpr";
  name: string;
  expr: Expr;
  errorTag?: string;
}

export interface PipeExpr {
  kind: "PipeExpr";
  left: Expr;
  right: Expr;
}

export interface LambdaExpr {
  kind: "LambdaExpr";
  params: string[];
  body: Expr;
}

export interface ListLit {
  kind: "ListLit";
  elements: Expr[];
}

export interface RecordLit {
  kind: "RecordLit";
  fields: { name: string; value: Expr; spread?: boolean }[];
}

export interface TupleLit {
  kind: "TupleLit";
  elements: Expr[];
}

export interface MemberExpr {
  kind: "MemberExpr";
  object: Expr;
  property: string;
}

export interface SpreadExpr {
  kind: "SpreadExpr";
  expr: Expr;
}

export interface ForExpr {
  kind: "ForExpr";
  variable: string;
  iterable: Expr;
  body: Expr;
}

export interface ParenExpr {
  kind: "ParenExpr";
  expr: Expr;
}

export interface ConstructorExpr {
  kind: "ConstructorExpr";
  name: string;
  fields: { name: string; value: Expr }[];
}

// ---- Patterns ----
export type Pattern =
  | LiteralPattern
  | IdentPattern
  | WildcardPattern
  | ConstructorPattern
  | TuplePattern;

export interface LiteralPattern {
  kind: "LiteralPattern";
  value: Expr;
}

export interface IdentPattern {
  kind: "IdentPattern";
  name: string;
}

export interface WildcardPattern {
  kind: "WildcardPattern";
}

export interface ConstructorPattern {
  kind: "ConstructorPattern";
  name: string;
  fields: { name: string; pattern: Pattern }[];
  positionalFields?: Pattern[];
}

export interface TuplePattern {
  kind: "TuplePattern";
  elements: Pattern[];
}

// ---- Declarations ----
export interface TypeSig {
  kind: "TypeSig";
  name: string;
  params: TypeExpr[];
  returnType: TypeExpr;
  isPublic: boolean;
}

export interface FuncDecl {
  kind: "FuncDecl";
  name: string;
  params: string[];
  body: Expr;
  typeSig?: TypeSig;
  annotations: Annotation[];
}

export interface TypeDecl {
  kind: "TypeDecl";
  name: string;
  typeParams: string[];
  typeExpr: TypeExpr;
  isPublic: boolean;
  annotations: Annotation[];
}

export interface EnumDecl {
  kind: "EnumDecl";
  name: string;
  typeParams: string[];
  variants: EnumVariant[];
  isPublic: boolean;
  annotations: Annotation[];
}

export interface EnumVariant {
  name: string;
  fields: { name: string; type: TypeExpr }[];
}

export interface ModuleDecl {
  kind: "ModuleDecl";
  name: string;
  needs: { name: string; type: string }[];
}

export interface ImportDecl {
  kind: "ImportDecl";
  names: string[];
  module: string;
  alias?: string;
  isDefault: boolean;
}

export interface TraitDecl {
  kind: "TraitDecl";
  name: string;
  typeParam: string;
  methods: TypeSig[];
  annotations: Annotation[];
}

export interface ImplDecl {
  kind: "ImplDecl";
  traitName: string;
  typeName: string;
  methods: FuncDecl[];
  annotations: Annotation[];
}

export interface TestDecl {
  kind: "TestDecl";
  description: string;
  body: Expr;
  annotations: Annotation[];
}
