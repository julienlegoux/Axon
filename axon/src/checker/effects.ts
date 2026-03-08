import type {
  Program,
  FuncDecl,
  Expr,
  Annotation,
} from "../parser/ast.ts";

export type Effect =
  | "none"
  | "db.read"
  | "db.write"
  | "http.request"
  | "http.response"
  | "fs.read"
  | "fs.write"
  | "console"
  | "random"
  | "time";

export interface EffectSet {
  effects: Set<Effect>;
}

function newEffectSet(): EffectSet {
  return { effects: new Set() };
}

function mergeEffects(a: EffectSet, b: EffectSet): EffectSet {
  const result = newEffectSet();
  for (const e of a.effects) result.effects.add(e);
  for (const e of b.effects) result.effects.add(e);
  return result;
}

/** Known effects for stdlib functions */
const KNOWN_EFFECTS: Record<string, Effect[]> = {
  print: ["console"],
  debug: ["console"],
};

export interface EffectError {
  message: string;
  line: number;
  column: number;
  hint?: string;
}

/** Parse @effect annotation value into effects */
function parseEffects(value: string): Set<Effect> {
  const effects = new Set<Effect>();
  const parts = value.split(/[\s,]+/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed && trimmed !== "none") {
      effects.add(trimmed as Effect);
    }
  }
  return effects;
}

/** Get declared effects from annotations */
function getDeclaredEffects(annotations: Annotation[]): Set<Effect> | null {
  const effectAnn = annotations.find(a => a.name === "effect");
  if (!effectAnn) return null; // No @effect annotation = implicitly pure
  return parseEffects(effectAnn.value);
}

/** Infer effects from an expression */
function inferEffects(
  expr: Expr,
  funcEffects: Map<string, Set<Effect>>
): EffectSet {
  const result = newEffectSet();

  switch (expr.kind) {
    case "Ident": {
      // Direct reference to an effectful function (e.g., `say_hi` without parens)
      const funcEff = funcEffects.get(expr.name);
      if (funcEff) {
        for (const e of funcEff) result.effects.add(e);
      }
      const known = KNOWN_EFFECTS[expr.name];
      if (known) {
        for (const e of known) result.effects.add(e);
      }
      break;
    }
    case "CallExpr": {
      // Check callee for known effects
      if (expr.callee.kind === "Ident") {
        const name = expr.callee.name;
        // Check known stdlib effects
        const known = KNOWN_EFFECTS[name];
        if (known) {
          for (const e of known) result.effects.add(e);
        }
        // Check effects from other functions
        const funcEff = funcEffects.get(name);
        if (funcEff) {
          for (const e of funcEff) result.effects.add(e);
        }
      }
      // Recurse into callee and args
      const calleeEffs = inferEffects(expr.callee, funcEffects);
      for (const e of calleeEffs.effects) result.effects.add(e);
      for (const arg of expr.args) {
        const argEffs = inferEffects(arg, funcEffects);
        for (const e of argEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "BinaryExpr": {
      const leftEffs = inferEffects(expr.left, funcEffects);
      const rightEffs = inferEffects(expr.right, funcEffects);
      for (const e of leftEffs.effects) result.effects.add(e);
      for (const e of rightEffs.effects) result.effects.add(e);
      break;
    }
    case "UnaryExpr": {
      const opEffs = inferEffects(expr.operand, funcEffects);
      for (const e of opEffs.effects) result.effects.add(e);
      break;
    }
    case "IfExpr": {
      for (const sub of [expr.condition, expr.thenBranch, expr.elseBranch]) {
        const subEffs = inferEffects(sub, funcEffects);
        for (const e of subEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "MatchExpr": {
      const subjEffs = inferEffects(expr.subject, funcEffects);
      for (const e of subjEffs.effects) result.effects.add(e);
      for (const arm of expr.arms) {
        const bodyEffs = inferEffects(arm.body, funcEffects);
        for (const e of bodyEffs.effects) result.effects.add(e);
        if (arm.guard) {
          const guardEffs = inferEffects(arm.guard, funcEffects);
          for (const e of guardEffs.effects) result.effects.add(e);
        }
      }
      break;
    }
    case "LetExpr": {
      const valEffs = inferEffects(expr.value, funcEffects);
      const bodyEffs = inferEffects(expr.body, funcEffects);
      for (const e of valEffs.effects) result.effects.add(e);
      for (const e of bodyEffs.effects) result.effects.add(e);
      break;
    }
    case "DoExpr": {
      for (const stmt of expr.statements) {
        if (stmt.kind === "DoExprStmt") {
          const stmtEffs = inferEffects(stmt.expr, funcEffects);
          for (const e of stmtEffs.effects) result.effects.add(e);
        } else if (stmt.kind === "DoLetStmt" || stmt.kind === "DoBindStmt") {
          const stmtEffs = inferEffects(stmt.expr, funcEffects);
          for (const e of stmtEffs.effects) result.effects.add(e);
        }
      }
      break;
    }
    case "PipeExpr": {
      const leftEffs = inferEffects(expr.left, funcEffects);
      const rightEffs = inferEffects(expr.right, funcEffects);
      for (const e of leftEffs.effects) result.effects.add(e);
      for (const e of rightEffs.effects) result.effects.add(e);
      break;
    }
    case "LambdaExpr": {
      const bodyEffs = inferEffects(expr.body, funcEffects);
      for (const e of bodyEffs.effects) result.effects.add(e);
      break;
    }
    case "ListLit": {
      for (const el of expr.elements) {
        const elEffs = inferEffects(el, funcEffects);
        for (const e of elEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "RecordLit": {
      for (const f of expr.fields) {
        const fEffs = inferEffects(f.value, funcEffects);
        for (const e of fEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "TupleLit": {
      for (const el of expr.elements) {
        const elEffs = inferEffects(el, funcEffects);
        for (const e of elEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "ParenExpr": {
      const innerEffs = inferEffects(expr.expr, funcEffects);
      for (const e of innerEffs.effects) result.effects.add(e);
      break;
    }
    case "MemberExpr": {
      const objEffs = inferEffects(expr.object, funcEffects);
      for (const e of objEffs.effects) result.effects.add(e);
      break;
    }
    case "ConstructorExpr": {
      for (const f of expr.fields) {
        const fEffs = inferEffects(f.value, funcEffects);
        for (const e of fEffs.effects) result.effects.add(e);
      }
      break;
    }
    case "AssertExpr": {
      const exprEffs = inferEffects(expr.expr, funcEffects);
      for (const e of exprEffs.effects) result.effects.add(e);
      break;
    }
    case "ForExpr": {
      const iterEffs = inferEffects(expr.iterable, funcEffects);
      const bodyEffs = inferEffects(expr.body, funcEffects);
      for (const e of iterEffs.effects) result.effects.add(e);
      for (const e of bodyEffs.effects) result.effects.add(e);
      break;
    }
    // Literals and identifiers have no effects
  }

  return result;
}

/** Check effects for a program */
export function checkEffects(ast: Program): EffectError[] {
  const errors: EffectError[] = [];

  // First pass: collect declared effects for all functions
  const funcEffects = new Map<string, Set<Effect>>();
  for (const decl of ast.declarations) {
    if (decl.kind === "FuncDecl") {
      const declared = getDeclaredEffects(decl.annotations);
      if (declared) {
        funcEffects.set(decl.name, declared);
      }
    }
  }

  // Second pass: infer effects and check against declarations
  for (const decl of ast.declarations) {
    if (decl.kind !== "FuncDecl") continue;

    const inferredEffects = inferEffects(decl.body, funcEffects);
    const declaredEffects = getDeclaredEffects(decl.annotations);

    // Skip main — it's allowed to have effects without declaring them
    if (decl.name === "main") continue;

    if (inferredEffects.effects.size > 0) {
      if (!declaredEffects) {
        // Function has effects but no @effect annotation (pure by default)
        const effectList = [...inferredEffects.effects].join(", ");
        errors.push({
          message: `Function \`${decl.name}\` performs effects [${effectList}] but has no @effect annotation`,
          line: 0,
          column: 0,
          hint: `Add @effect ${effectList} before the function signature, or remove the effectful calls`,
        });
      } else {
        // Check that all inferred effects are declared
        for (const eff of inferredEffects.effects) {
          if (!declaredEffects.has(eff)) {
            errors.push({
              message: `Function \`${decl.name}\` performs effect \`${eff}\` which is not declared in @effect annotation`,
              line: 0,
              column: 0,
              hint: `Add \`${eff}\` to the @effect annotation`,
            });
          }
        }
      }
    }
  }

  return errors;
}
