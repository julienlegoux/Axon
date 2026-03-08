import type {
  Program,
  Declaration,
  FuncDecl,
  TypeDecl,
  EnumDecl,
  TypeExpr,
  Expr,
  Pattern,
  MatchArm,
  TestDecl,
} from "../parser/ast.ts";
import {
  Type,
  INT, FLOAT, STRING, BOOL, UNIT, UNKNOWN,
  funcType, listType, tupleType, recordType, resultType, optionType,
  typesEqual, typeToString,
} from "./types.ts";
import { TypeEnv, type EnumDef } from "./env.ts";
import { RUNTIME_FUNCTIONS } from "../codegen/runtime-bundle.ts";
import { checkEffects } from "./effects.ts";

export interface CheckError {
  message: string;
  line: number;
  column: number;
  hint?: string;
}

export interface CheckWarning {
  message: string;
  line: number;
  column: number;
  hint?: string;
}

export interface CheckResult {
  errors: CheckError[];
  warnings: CheckWarning[];
}

/** Convert an AST TypeExpr to an internal Type */
function resolveTypeExpr(texpr: TypeExpr, env: TypeEnv): Type {
  switch (texpr.kind) {
    case "NamedType": {
      switch (texpr.name) {
        case "Int": return INT;
        case "Float": return FLOAT;
        case "String": return STRING;
        case "Bool": return BOOL;
        case "Unit": return UNIT;
        default: {
          // Check type aliases
          const alias = env.lookupType(texpr.name);
          if (alias) return alias;
          // Check enum types
          const enumDef = env.lookupEnum(texpr.name);
          if (enumDef) {
            return {
              kind: "Enum",
              name: enumDef.name,
              variants: enumDef.variants,
            };
          }
          // Type variable
          return { kind: "TypeVar", name: texpr.name };
        }
      }
    }
    case "FuncType": {
      const from = resolveTypeExpr(texpr.from, env);
      const to = resolveTypeExpr(texpr.to, env);
      // If `to` is a Func, merge params
      if (to.kind === "Func") {
        return funcType([from, ...to.params], to.returnType);
      }
      return funcType([from], to);
    }
    case "ListType":
      return listType(resolveTypeExpr(texpr.elementType, env));
    case "MapType":
      return { kind: "Map", key: resolveTypeExpr(texpr.keyType, env), value: resolveTypeExpr(texpr.valueType, env) };
    case "TupleType":
      return tupleType(texpr.elements.map(e => resolveTypeExpr(e, env)));
    case "RecordType": {
      const fields = new Map<string, Type>();
      for (const f of texpr.fields) {
        fields.set(f.name, resolveTypeExpr(f.type, env));
      }
      return recordType(fields);
    }
    case "GenericType": {
      if (texpr.name === "Result" && texpr.args.length === 2) {
        return resultType(
          resolveTypeExpr(texpr.args[0], env),
          resolveTypeExpr(texpr.args[1], env)
        );
      }
      if (texpr.name === "Option" && texpr.args.length === 1) {
        return optionType(resolveTypeExpr(texpr.args[0], env));
      }
      // Generic type - return as unknown for now
      return UNKNOWN;
    }
    case "RefinedType":
      return resolveTypeExpr(texpr.baseType, env);
    default:
      return UNKNOWN;
  }
}

/** Register stdlib functions in the environment */
function registerStdlib(env: TypeEnv): void {
  // Result constructors
  env.define("ok", funcType([{ kind: "TypeVar", name: "a" }], resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "e" })));
  env.define("err", funcType([{ kind: "TypeVar", name: "e" }], resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "e" })));

  // Option constructors
  env.define("some", funcType([{ kind: "TypeVar", name: "a" }], { kind: "TypeVar", name: "a" }));
  env.define("none", UNKNOWN);

  // IO
  env.define("print", funcType([STRING], UNIT));
  env.define("debug", funcType([UNKNOWN], UNIT));

  // List operations
  env.define("map", funcType([funcType([{ kind: "TypeVar", name: "a" }], { kind: "TypeVar", name: "b" }), listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "b" })));
  env.define("filter", funcType([funcType([{ kind: "TypeVar", name: "a" }], BOOL), listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));
  env.define("fold", funcType([funcType([{ kind: "TypeVar", name: "b" }, { kind: "TypeVar", name: "a" }], { kind: "TypeVar", name: "b" }), { kind: "TypeVar", name: "b" }, listType({ kind: "TypeVar", name: "a" })], { kind: "TypeVar", name: "b" }));
  env.define("find", funcType([funcType([{ kind: "TypeVar", name: "a" }], BOOL), listType({ kind: "TypeVar", name: "a" })], optionType({ kind: "TypeVar", name: "a" })));
  env.define("any", funcType([funcType([{ kind: "TypeVar", name: "a" }], BOOL), listType({ kind: "TypeVar", name: "a" })], BOOL));
  env.define("all", funcType([funcType([{ kind: "TypeVar", name: "a" }], BOOL), listType({ kind: "TypeVar", name: "a" })], BOOL));
  env.define("head", funcType([listType({ kind: "TypeVar", name: "a" })], optionType({ kind: "TypeVar", name: "a" })));
  env.define("tail", funcType([listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));
  env.define("length", funcType([listType({ kind: "TypeVar", name: "a" })], INT));
  env.define("concat", funcType([listType({ kind: "TypeVar", name: "a" }), listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));
  env.define("flat_map", funcType([funcType([{ kind: "TypeVar", name: "a" }], listType({ kind: "TypeVar", name: "b" })), listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "b" })));
  env.define("zip", funcType([listType({ kind: "TypeVar", name: "a" }), listType({ kind: "TypeVar", name: "b" })], listType(tupleType([{ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "b" }]))));
  env.define("sort_by", funcType([funcType([{ kind: "TypeVar", name: "a" }], UNKNOWN), listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));
  env.define("unique", funcType([listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));
  env.define("group_by", funcType([funcType([{ kind: "TypeVar", name: "a" }], UNKNOWN), listType({ kind: "TypeVar", name: "a" })], UNKNOWN));
  env.define("chunk", funcType([INT, listType({ kind: "TypeVar", name: "a" })], listType(listType({ kind: "TypeVar", name: "a" }))));
  env.define("take", funcType([INT, listType({ kind: "TypeVar", name: "a" })], listType({ kind: "TypeVar", name: "a" })));

  // String operations
  env.define("trim", funcType([STRING], STRING));
  env.define("split", funcType([STRING, STRING], listType(STRING)));
  env.define("join", funcType([STRING, listType(STRING)], STRING));
  env.define("contains", funcType([STRING, STRING], BOOL));
  env.define("replace", funcType([STRING, STRING, STRING], STRING));
  env.define("to_upper", funcType([STRING], STRING));
  env.define("to_lower", funcType([STRING], STRING));
  env.define("starts_with", funcType([STRING, STRING], BOOL));
  env.define("ends_with", funcType([STRING, STRING], BOOL));

  // Math
  env.define("abs", funcType([INT], INT));
  env.define("max", funcType([INT, INT], INT));
  env.define("min", funcType([INT, INT], INT));
  env.define("clamp", funcType([INT, INT, INT], INT));

  // Option helpers
  env.define("unwrap", funcType([optionType({ kind: "TypeVar", name: "a" })], { kind: "TypeVar", name: "a" }));
  env.define("unwrap_or", funcType([{ kind: "TypeVar", name: "a" }, optionType({ kind: "TypeVar", name: "a" })], { kind: "TypeVar", name: "a" }));
  env.define("map_option", funcType([funcType([{ kind: "TypeVar", name: "a" }], { kind: "TypeVar", name: "b" }), optionType({ kind: "TypeVar", name: "a" })], optionType({ kind: "TypeVar", name: "b" })));
  env.define("is_some", funcType([optionType({ kind: "TypeVar", name: "a" })], BOOL));
  env.define("is_none", funcType([optionType({ kind: "TypeVar", name: "a" })], BOOL));

  // Result helpers
  env.define("map_result", funcType([funcType([{ kind: "TypeVar", name: "a" }], { kind: "TypeVar", name: "b" }), resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "e" })], resultType({ kind: "TypeVar", name: "b" }, { kind: "TypeVar", name: "e" })));
  env.define("map_err", funcType([funcType([{ kind: "TypeVar", name: "e" }], { kind: "TypeVar", name: "f" }), resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "e" })], resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "f" })));
  env.define("unwrap_result", funcType([resultType({ kind: "TypeVar", name: "a" }, { kind: "TypeVar", name: "e" })], { kind: "TypeVar", name: "a" }));
  env.define("pipe", funcType([UNKNOWN], UNKNOWN));
}

export function check(ast: Program): CheckResult {
  const errors: CheckError[] = [];
  const warnings: CheckWarning[] = [];
  const env = new TypeEnv();

  registerStdlib(env);

  // First pass: register all type declarations, enum declarations, and function signatures
  for (const decl of ast.declarations) {
    switch (decl.kind) {
      case "TypeDecl": {
        const type = resolveTypeExpr(decl.typeExpr, env);
        env.defineType(decl.name, type);
        break;
      }
      case "EnumDecl": {
        const variants = new Map<string, Map<string, Type>>();
        for (const v of decl.variants) {
          const fields = new Map<string, Type>();
          for (const f of v.fields) {
            fields.set(f.name, resolveTypeExpr(f.type, env));
          }
          variants.set(v.name, fields);
        }
        const enumDef: EnumDef = { name: decl.name, variants };
        env.defineEnum(decl.name, enumDef);
        // Register the enum type
        env.defineType(decl.name, { kind: "Enum", name: decl.name, variants });
        // Register constructors
        for (const v of decl.variants) {
          const enumType: Type = { kind: "Enum", name: decl.name, variants };
          if (v.fields.length === 0) {
            env.define(v.name, enumType);
          } else {
            const fieldTypes: Type[] = [];
            for (const f of v.fields) {
              fieldTypes.push(resolveTypeExpr(f.type, env));
            }
            env.define(v.name, funcType(fieldTypes, enumType));
          }
        }
        break;
      }
      case "FuncDecl": {
        if (decl.typeSig) {
          const paramTypes = decl.typeSig.params.map(p => resolveTypeExpr(p, env));
          const retType = resolveTypeExpr(decl.typeSig.returnType, env);
          if (paramTypes.length === 0) {
            env.define(decl.name, retType);
          } else {
            env.define(decl.name, funcType(paramTypes, retType));
          }
        }
        break;
      }
    }
  }

  // Second pass: check each function body
  for (const decl of ast.declarations) {
    if (decl.kind === "FuncDecl" && decl.typeSig) {
      checkFuncDecl(decl, env, errors, warnings);
    }
    if (decl.kind === "TestDecl") {
      checkTestDecl(decl, env, errors, warnings);
    }
  }

  // Effect checking
  const effectErrors = checkEffects(ast);
  errors.push(...effectErrors);

  return { errors, warnings };
}

function checkFuncDecl(
  decl: FuncDecl,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): void {
  if (!decl.typeSig) return;

  env.pushScope();

  // Bind parameter types
  const paramTypes = decl.typeSig.params.map(p => resolveTypeExpr(p, env));
  for (let i = 0; i < decl.params.length; i++) {
    const paramType = i < paramTypes.length ? paramTypes[i] : UNKNOWN;
    env.define(decl.params[i], paramType);
  }

  const expectedReturnType = resolveTypeExpr(decl.typeSig.returnType, env);
  const actualType = inferExpr(decl.body, env, errors, warnings);

  if (!typesEqual(actualType, expectedReturnType)) {
    errors.push({
      message: `Type mismatch in function \`${decl.name}\`: expected ${typeToString(expectedReturnType)}, got ${typeToString(actualType)}`,
      line: 0,
      column: 0,
      hint: `The function signature declares return type ${typeToString(expectedReturnType)}`,
    });
  }

  env.popScope();
}

function checkTestDecl(
  decl: TestDecl,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): void {
  env.pushScope();
  inferExpr(decl.body, env, errors, warnings);
  env.popScope();
}

/** Infer the type of an expression */
function inferExpr(
  expr: Expr,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): Type {
  switch (expr.kind) {
    case "IntLit":
      return INT;
    case "FloatLit":
      return FLOAT;
    case "StringLit":
      return STRING;
    case "BoolLit":
      return BOOL;
    case "CharLit":
      return STRING;

    case "Ident": {
      const type = env.lookup(expr.name);
      if (type) return type;
      // Check if it's a constructor
      const variant = env.lookupVariant(expr.name);
      if (variant) {
        if (variant.fields.size === 0) {
          return { kind: "Enum", name: variant.enumDef.name, variants: variant.enumDef.variants };
        }
      }
      if (expr.name === "_") return UNKNOWN;
      // Don't error on unknown idents in general - could be local bindings we don't track
      return UNKNOWN;
    }

    case "BinaryExpr":
      return inferBinaryExpr(expr, env, errors, warnings);

    case "UnaryExpr": {
      const operandType = inferExpr(expr.operand, env, errors, warnings);
      if (expr.op === "!") {
        if (operandType.kind !== "Unknown" && !typesEqual(operandType, BOOL)) {
          errors.push({
            message: `Type mismatch: ! operator requires Bool, got ${typeToString(operandType)}`,
            line: 0,
            column: 0,
          });
        }
        return BOOL;
      }
      if (expr.op === "-") {
        if (operandType.kind !== "Unknown" &&
            !(typesEqual(operandType, INT) || typesEqual(operandType, FLOAT))) {
          errors.push({
            message: `Type mismatch: unary - requires Int or Float, got ${typeToString(operandType)}`,
            line: 0,
            column: 0,
          });
        }
        return operandType;
      }
      return operandType;
    }

    case "CallExpr":
      return inferCallExpr(expr, env, errors, warnings);

    case "IfExpr": {
      const condType = inferExpr(expr.condition, env, errors, warnings);
      if (condType.kind !== "Unknown" && !typesEqual(condType, BOOL)) {
        errors.push({
          message: `Type mismatch: if condition must be Bool, got ${typeToString(condType)}`,
          line: 0,
          column: 0,
        });
      }
      const thenType = inferExpr(expr.thenBranch, env, errors, warnings);
      const elseType = inferExpr(expr.elseBranch, env, errors, warnings);
      if (!typesEqual(thenType, elseType)) {
        errors.push({
          message: `Type mismatch: if branches have different types: ${typeToString(thenType)} vs ${typeToString(elseType)}`,
          line: 0,
          column: 0,
        });
      }
      return thenType;
    }

    case "MatchExpr":
      return inferMatchExpr(expr, env, errors, warnings);

    case "LetExpr": {
      env.pushScope();
      const valueType = inferExpr(expr.value, env, errors, warnings);
      env.define(expr.name, valueType);
      const bodyType = inferExpr(expr.body, env, errors, warnings);
      env.popScope();
      return bodyType;
    }

    case "DoExpr": {
      env.pushScope();
      let lastType: Type = UNIT;
      for (const stmt of expr.statements) {
        switch (stmt.kind) {
          case "DoLetStmt": {
            const t = inferExpr(stmt.expr, env, errors, warnings);
            env.define(stmt.name, t);
            break;
          }
          case "DoBindStmt": {
            const t = inferExpr(stmt.expr, env, errors, warnings);
            // Bind unwraps the Result
            if (t.kind === "Result") {
              env.define(stmt.name, t.okType);
            } else {
              env.define(stmt.name, UNKNOWN);
            }
            break;
          }
          case "DoExprStmt":
            lastType = inferExpr(stmt.expr, env, errors, warnings);
            break;
        }
      }
      env.popScope();
      return lastType;
    }

    case "PipeExpr": {
      const leftType = inferExpr(expr.left, env, errors, warnings);
      // Pipe passes left as argument to right
      const rightType = inferExpr(expr.right, env, errors, warnings);
      if (rightType.kind === "Func" && rightType.params.length > 0) {
        return rightType.returnType;
      }
      return UNKNOWN;
    }

    case "LambdaExpr": {
      env.pushScope();
      for (const p of expr.params) {
        env.define(p, UNKNOWN);
      }
      const bodyType = inferExpr(expr.body, env, errors, warnings);
      env.popScope();
      const paramTypes = expr.params.map(() => UNKNOWN as Type);
      return funcType(paramTypes, bodyType);
    }

    case "ListLit": {
      if (expr.elements.length === 0) return listType(UNKNOWN);
      const elemType = inferExpr(expr.elements[0], env, errors, warnings);
      for (let i = 1; i < expr.elements.length; i++) {
        inferExpr(expr.elements[i], env, errors, warnings);
      }
      return listType(elemType);
    }

    case "RecordLit": {
      const fields = new Map<string, Type>();
      for (const f of expr.fields) {
        if (!f.spread) {
          fields.set(f.name, inferExpr(f.value, env, errors, warnings));
        } else {
          inferExpr(f.value, env, errors, warnings);
        }
      }
      return recordType(fields);
    }

    case "TupleLit": {
      const elemTypes = expr.elements.map(e => inferExpr(e, env, errors, warnings));
      return tupleType(elemTypes);
    }

    case "MemberExpr": {
      const objType = inferExpr(expr.object, env, errors, warnings);
      if (objType.kind === "Record") {
        const fieldType = objType.fields.get(expr.property);
        if (fieldType) return fieldType;
      }
      return UNKNOWN;
    }

    case "ParenExpr":
      return inferExpr(expr.expr, env, errors, warnings);

    case "ConstructorExpr": {
      const variant = env.lookupVariant(expr.name);
      if (variant) {
        // Check field types
        for (const f of expr.fields) {
          const expectedFieldType = variant.fields.get(f.name);
          const actualFieldType = inferExpr(f.value, env, errors, warnings);
          if (expectedFieldType && !typesEqual(actualFieldType, expectedFieldType)) {
            errors.push({
              message: `Type mismatch in constructor \`${expr.name}\`: field \`${f.name}\` expected ${typeToString(expectedFieldType)}, got ${typeToString(actualFieldType)}`,
              line: 0,
              column: 0,
            });
          }
        }
        return { kind: "Enum", name: variant.enumDef.name, variants: variant.enumDef.variants };
      }
      // Unknown constructor
      errors.push({
        message: `Unknown constructor: ${expr.name}`,
        line: 0,
        column: 0,
      });
      return UNKNOWN;
    }

    case "AssertExpr": {
      inferExpr(expr.expr, env, errors, warnings);
      return UNIT;
    }

    case "ForExpr": {
      const iterType = inferExpr(expr.iterable, env, errors, warnings);
      env.pushScope();
      if (iterType.kind === "List") {
        env.define(expr.variable, iterType.element);
      } else {
        env.define(expr.variable, UNKNOWN);
      }
      const bodyType = inferExpr(expr.body, env, errors, warnings);
      env.popScope();
      return listType(bodyType);
    }

    case "SpreadExpr":
      return inferExpr(expr.expr, env, errors, warnings);

    default:
      return UNKNOWN;
  }
}

function inferBinaryExpr(
  expr: import("../parser/ast.ts").BinaryExpr,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): Type {
  const leftType = inferExpr(expr.left, env, errors, warnings);
  const rightType = inferExpr(expr.right, env, errors, warnings);

  switch (expr.op) {
    case "+":
    case "-":
    case "*":
    case "/":
    case "%":
    case "**": {
      // Numeric operations
      if (leftType.kind !== "Unknown" && rightType.kind !== "Unknown") {
        const isLeftNum = typesEqual(leftType, INT) || typesEqual(leftType, FLOAT);
        const isRightNum = typesEqual(rightType, INT) || typesEqual(rightType, FLOAT);
        if (!isLeftNum || !isRightNum) {
          errors.push({
            message: `Type mismatch: operator \`${expr.op}\` requires numeric operands, got ${typeToString(leftType)} and ${typeToString(rightType)}`,
            line: 0,
            column: 0,
            hint: `The \`${expr.op}\` operator requires both operands to be the same numeric type`,
          });
        } else if (!typesEqual(leftType, rightType)) {
          errors.push({
            message: `Type mismatch: operator \`${expr.op}\` requires both operands to be the same type, got ${typeToString(leftType)} and ${typeToString(rightType)}`,
            line: 0,
            column: 0,
          });
        }
      }
      // Return the left operand type (or Int if unknown)
      if (leftType.kind !== "Unknown") return leftType;
      if (rightType.kind !== "Unknown") return rightType;
      return INT;
    }

    case "==":
    case "!=":
    case "<":
    case ">":
    case "<=":
    case ">=":
      return BOOL;

    case "&&":
    case "||": {
      if (leftType.kind !== "Unknown" && !typesEqual(leftType, BOOL)) {
        errors.push({
          message: `Type mismatch: operator \`${expr.op}\` requires Bool operands, got ${typeToString(leftType)}`,
          line: 0,
          column: 0,
        });
      }
      if (rightType.kind !== "Unknown" && !typesEqual(rightType, BOOL)) {
        errors.push({
          message: `Type mismatch: operator \`${expr.op}\` requires Bool operands, got ${typeToString(rightType)}`,
          line: 0,
          column: 0,
        });
      }
      return BOOL;
    }

    case "++": {
      // Concat: strings or lists
      if (leftType.kind !== "Unknown" && rightType.kind !== "Unknown") {
        if (!(typesEqual(leftType, STRING) || leftType.kind === "List") ||
            !(typesEqual(rightType, STRING) || rightType.kind === "List")) {
          errors.push({
            message: `Type mismatch: operator \`++\` requires String or List operands`,
            line: 0,
            column: 0,
          });
        }
      }
      return leftType.kind !== "Unknown" ? leftType : rightType;
    }

    default:
      return UNKNOWN;
  }
}

function inferCallExpr(
  expr: import("../parser/ast.ts").CallExpr,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): Type {
  const calleeType = inferExpr(expr.callee, env, errors, warnings);
  const argTypes = expr.args.map(a => inferExpr(a, env, errors, warnings));

  if (calleeType.kind === "Func") {
    // Check argument count
    if (argTypes.length !== calleeType.params.length && calleeType.params.length > 0) {
      // Allow partial application or extra args for polymorphic functions
      if (argTypes.length < calleeType.params.length) {
        // Could be partial application - still valid in functional languages
      } else if (!calleeType.params.some(p => p.kind === "TypeVar" || p.kind === "Unknown")) {
        errors.push({
          message: `Wrong number of arguments: expected ${calleeType.params.length}, got ${argTypes.length}`,
          line: 0,
          column: 0,
        });
      }
    }

    // Check argument types
    for (let i = 0; i < Math.min(argTypes.length, calleeType.params.length); i++) {
      const expected = calleeType.params[i];
      const actual = argTypes[i];
      if (expected.kind !== "TypeVar" && expected.kind !== "Unknown" &&
          actual.kind !== "TypeVar" && actual.kind !== "Unknown") {
        if (!typesEqual(actual, expected)) {
          errors.push({
            message: `Type mismatch in argument ${i + 1}: expected ${typeToString(expected)}, got ${typeToString(actual)}`,
            line: 0,
            column: 0,
          });
        }
      }
    }

    return calleeType.returnType;
  }

  return UNKNOWN;
}

function inferMatchExpr(
  expr: import("../parser/ast.ts").MatchExpr,
  env: TypeEnv,
  errors: CheckError[],
  warnings: CheckWarning[]
): Type {
  const subjectType = inferExpr(expr.subject, env, errors, warnings);
  let resultType: Type = UNKNOWN;

  for (const arm of expr.arms) {
    env.pushScope();
    bindPatternVars(arm.pattern, subjectType, env);
    if (arm.guard) {
      inferExpr(arm.guard, env, errors, warnings);
    }
    const bodyType = inferExpr(arm.body, env, errors, warnings);
    if (resultType.kind === "Unknown") {
      resultType = bodyType;
    } else if (!typesEqual(resultType, bodyType) && bodyType.kind !== "Unknown") {
      errors.push({
        message: `Type mismatch: match arms have different types: ${typeToString(resultType)} vs ${typeToString(bodyType)}`,
        line: 0,
        column: 0,
      });
    }
    env.popScope();
  }

  // Check exhaustiveness for enum types
  if (subjectType.kind === "Enum") {
    checkEnumExhaustiveness(subjectType, expr.arms, warnings);
  }

  return resultType;
}

/** Bind pattern variables into scope */
function bindPatternVars(pattern: Pattern, subjectType: Type, env: TypeEnv): void {
  switch (pattern.kind) {
    case "IdentPattern":
      env.define(pattern.name, subjectType);
      break;
    case "ConstructorPattern": {
      // Bind fields
      const variant = env.lookupVariant(pattern.name);
      if (variant) {
        for (const f of pattern.fields) {
          const fieldType = variant.fields.get(f.name);
          env.define(f.name, fieldType || UNKNOWN);
        }
        if (pattern.positionalFields) {
          for (const pf of pattern.positionalFields) {
            if (pf.kind === "IdentPattern") {
              // For single-field constructors like Some x
              const firstField = variant.fields.values().next().value;
              env.define(pf.name, firstField || UNKNOWN);
            }
          }
        }
      } else {
        // Ok/Err patterns
        if (pattern.name === "Ok" && subjectType.kind === "Result") {
          if (pattern.positionalFields) {
            for (const pf of pattern.positionalFields) {
              if (pf.kind === "IdentPattern") {
                env.define(pf.name, subjectType.okType);
              }
            }
          }
        } else if (pattern.name === "Err" && subjectType.kind === "Result") {
          if (pattern.positionalFields) {
            for (const pf of pattern.positionalFields) {
              if (pf.kind === "IdentPattern") {
                env.define(pf.name, subjectType.errType);
              }
            }
          }
        }
      }
      break;
    }
    case "TuplePattern": {
      if (subjectType.kind === "Tuple") {
        for (let i = 0; i < pattern.elements.length; i++) {
          const elemType = i < subjectType.elements.length ? subjectType.elements[i] : UNKNOWN;
          bindPatternVars(pattern.elements[i], elemType, env);
        }
      } else {
        for (const elem of pattern.elements) {
          bindPatternVars(elem, UNKNOWN, env);
        }
      }
      break;
    }
  }
}

/** Check enum exhaustiveness */
function checkEnumExhaustiveness(
  enumType: Extract<Type, { kind: "Enum" }>,
  arms: MatchArm[],
  warnings: CheckWarning[]
): void {
  const coveredVariants = new Set<string>();
  let hasWildcard = false;

  for (const arm of arms) {
    if (arm.pattern.kind === "WildcardPattern" || arm.pattern.kind === "IdentPattern") {
      hasWildcard = true;
    } else if (arm.pattern.kind === "ConstructorPattern") {
      if (!arm.guard) {
        coveredVariants.add(arm.pattern.name);
      }
    }
  }

  if (!hasWildcard) {
    const missingVariants: string[] = [];
    for (const [name] of enumType.variants) {
      if (!coveredVariants.has(name)) {
        missingVariants.push(name);
      }
    }
    if (missingVariants.length > 0) {
      warnings.push({
        message: `Non-exhaustive match: missing variants: ${missingVariants.join(", ")}`,
        line: 0,
        column: 0,
        hint: `Add cases for ${missingVariants.join(", ")} or add a wildcard \`_\` arm`,
      });
    }
  }
}
