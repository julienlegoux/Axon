import type {
  Program,
  Declaration,
  FuncDecl,
  TypeDecl,
  EnumDecl,
  TypeSig,
  TypeExpr,
  Expr,
  MatchArm,
  Pattern,
  Annotation,
  ModuleDecl,
  ImportDecl,
  TraitDecl,
  ImplDecl,
  DoStatement,
} from "../parser/ast.ts";

/** Map Axon type names to TypeScript type names */
function mapType(typeExpr: TypeExpr): string {
  switch (typeExpr.kind) {
    case "NamedType":
      switch (typeExpr.name) {
        case "Int":
        case "Float": return "number";
        case "String": return "string";
        case "Bool": return "boolean";
        case "Unit": return "void";
        default: return typeExpr.name;
      }

    case "FuncType":
      return `(${mapType(typeExpr.from)}) => ${mapType(typeExpr.to)}`;

    case "ListType":
      return `${mapType(typeExpr.elementType)}[]`;

    case "MapType":
      return `Map<${mapType(typeExpr.keyType)}, ${mapType(typeExpr.valueType)}>`;

    case "TupleType":
      return `[${typeExpr.elements.map(mapType).join(", ")}]`;

    case "RecordType":
      return `{ ${typeExpr.fields.map((f) => `${f.name}: ${mapType(f.type)}`).join("; ")} }`;

    case "GenericType": {
      const args = typeExpr.args.map(mapType).join(", ");
      const name = typeExpr.name === "Result" ? "Result" :
                   typeExpr.name === "Option" ? "Option" : typeExpr.name;
      return `${name}<${args}>`;
    }

    case "RefinedType":
      return mapType(typeExpr.baseType);

    default:
      return "unknown";
  }
}

/** Build the full function type string from a TypeSig */
function buildReturnType(sig: TypeSig): string {
  return mapType(sig.returnType);
}

function buildParamTypes(sig: TypeSig): string[] {
  return sig.params.map(mapType);
}

export function generate(ast: Program): string {
  const lines: string[] = [];
  let hasMain = false;
  let moduleDecl: ModuleDecl | null = null;

  // First pass: find module declaration
  for (const decl of ast.declarations) {
    if (decl.kind === "ModuleDecl") {
      moduleDecl = decl;
    }
    if (decl.kind === "FuncDecl" && decl.name === "main") {
      hasMain = true;
    }
  }

  // If module has needs, generate as a class
  if (moduleDecl && moduleDecl.needs.length > 0) {
    return generateModuleClass(ast, moduleDecl);
  }

  // Generate each declaration
  for (const decl of ast.declarations) {
    const code = generateDeclaration(decl, moduleDecl);
    if (code) lines.push(code);
  }

  // Entry point
  if (hasMain && !moduleDecl) {
    lines.push("");
    lines.push("// Entry point");
    lines.push("console.log(main());");
  }

  return lines.join("\n") + "\n";
}

function generateModuleClass(ast: Program, moduleDecl: ModuleDecl): string {
  const lines: string[] = [];

  // Generate non-function declarations (types, enums, imports) first
  for (const decl of ast.declarations) {
    if (decl.kind !== "FuncDecl" && decl.kind !== "ModuleDecl") {
      const code = generateDeclaration(decl, moduleDecl);
      if (code) lines.push(code);
    }
  }

  lines.push("");

  // Constructor params
  const ctorParams = moduleDecl.needs
    .map((dep) => `private ${dep.name}: ${dep.type}`)
    .join(", ");

  lines.push(`export class ${moduleDecl.name} {`);
  lines.push(`  constructor(${ctorParams}) {}`);

  // Methods
  for (const decl of ast.declarations) {
    if (decl.kind === "FuncDecl") {
      lines.push("");
      lines.push(generateMethodDecl(decl));
    }
  }

  lines.push("}");
  return lines.join("\n") + "\n";
}

function generateMethodDecl(decl: FuncDecl): string {
  const parts: string[] = [];

  const annComment = generateAnnotationComments(decl.annotations);
  if (annComment) parts.push("  " + annComment);

  let paramList = "";
  let returnTypeStr = "";
  const isPublic = decl.typeSig?.isPublic ?? false;

  if (decl.typeSig) {
    const paramTypes = buildParamTypes(decl.typeSig);
    const params = decl.params.map((name, i) => {
      const type = i < paramTypes.length ? paramTypes[i] : "any";
      return `${name}: ${type}`;
    });
    paramList = params.join(", ");
    returnTypeStr = `: ${buildReturnType(decl.typeSig)}`;
  } else {
    paramList = decl.params.join(", ");
  }

  const bodyStr = generateExpr(decl.body);

  if (decl.body.kind === "DoExpr") {
    parts.push(`  ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(generateDoBody(decl.body).replace(/^/gm, "  "));
    parts.push("  }");
  } else if (decl.body.kind === "MatchExpr") {
    parts.push(`  ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(generateMatchBody(decl.body).replace(/^/gm, "  "));
    parts.push("  }");
  } else {
    parts.push(`  ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(`    return ${bodyStr};`);
    parts.push("  }");
  }

  return parts.join("\n");
}

function generateDeclaration(decl: Declaration, moduleDecl: ModuleDecl | null): string {
  switch (decl.kind) {
    case "FuncDecl":
      return generateFuncDecl(decl);
    case "TypeDecl":
      return generateTypeDecl(decl);
    case "EnumDecl":
      return generateEnumDecl(decl);
    case "ModuleDecl":
      return ""; // handled at top level
    case "ImportDecl":
      return generateImportDecl(decl);
    case "TraitDecl":
      return generateTraitDecl(decl);
    case "ImplDecl":
      return generateImplDecl(decl);
    case "TestDecl":
      return ""; // handled separately
    default:
      return "";
  }
}

function generateAnnotationComments(annotations: Annotation[]): string {
  const comments: string[] = [];
  for (const ann of annotations) {
    if (ann.name === "intent") {
      comments.push(`/** @intent ${ann.value} */`);
    } else if (ann.name === "effect") {
      comments.push(`/** @effect ${ann.value} */`);
    } else if (ann.name === "deprecated") {
      comments.push(`/** @deprecated ${ann.value} */`);
    }
  }
  return comments.join("\n");
}

function generateFuncDecl(decl: FuncDecl): string {
  const parts: string[] = [];

  // Annotations as JSDoc
  const annComment = generateAnnotationComments(decl.annotations);
  if (annComment) parts.push(annComment);

  // Build parameter list
  let paramList = "";
  let returnTypeStr = "";

  if (decl.typeSig) {
    const paramTypes = buildParamTypes(decl.typeSig);
    const params = decl.params.map((name, i) => {
      const type = i < paramTypes.length ? paramTypes[i] : "any";
      return `${name}: ${type}`;
    });
    paramList = params.join(", ");
    returnTypeStr = `: ${buildReturnType(decl.typeSig)}`;
  } else {
    paramList = decl.params.join(", ");
  }

  const bodyStr = generateExpr(decl.body);

  // Check if body needs to be a block (do-notation, let expressions)
  if (decl.body.kind === "DoExpr") {
    parts.push(`function ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(generateDoBody(decl.body));
    parts.push("}");
  } else if (decl.body.kind === "LetExpr") {
    parts.push(`function ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(generateLetBody(decl.body));
    parts.push("}");
  } else if (decl.body.kind === "MatchExpr") {
    parts.push(`function ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(generateMatchBody(decl.body));
    parts.push("}");
  } else {
    parts.push(`function ${decl.name}(${paramList})${returnTypeStr} {`);
    parts.push(`  return ${bodyStr};`);
    parts.push("}");
  }

  return parts.join("\n");
}

function generateTypeDecl(decl: TypeDecl): string {
  const typeExpr = decl.typeExpr;

  if (typeExpr.kind === "RecordType") {
    const fields = typeExpr.fields
      .map((f) => `  ${f.name}: ${mapType(f.type)};`)
      .join("\n");
    return `interface ${decl.name} {\n${fields}\n}`;
  }

  if (typeExpr.kind === "RefinedType") {
    return generateRefinedType(decl.name, typeExpr);
  }

  return `type ${decl.name} = ${mapType(typeExpr)};`;
}

function generateRefinedType(name: string, refined: import("../parser/ast.ts").RefinedType): string {
  const baseType = mapType(refined.baseType);
  const lines: string[] = [];

  lines.push(`type ${name} = ${baseType} & { readonly __brand: "${name}" };`);

  // Generate validation function
  const conditions: string[] = [];
  for (const constraint of refined.constraints) {
    const val = generateExpr(constraint.value);
    switch (constraint.name) {
      case "min":
        conditions.push(`raw >= ${val}`);
        break;
      case "max":
        conditions.push(`raw <= ${val}`);
        break;
      case "min_length":
        conditions.push(`raw.length >= ${val}`);
        break;
      case "max_length":
        conditions.push(`raw.length <= ${val}`);
        break;
      case "matches":
        conditions.push(`${val}.test(raw)`);
        break;
      case "format":
        // Basic format validation placeholder
        conditions.push(`true /* format: ${val} */`);
        break;
    }
  }

  const check = conditions.length > 0 ? conditions.join(" && ") : "true";
  lines.push(`function parse${name}(raw: ${baseType}): { ok: true; value: ${name} } | { ok: false; error: string } {`);
  lines.push(`  if (${check}) {`);
  lines.push(`    return { ok: true, value: raw as ${name} };`);
  lines.push(`  }`);
  lines.push(`  return { ok: false, error: "Invalid ${name}" };`);
  lines.push(`}`);

  return lines.join("\n");
}

function generateEnumDecl(decl: EnumDecl): string {
  const lines: string[] = [];

  // Type definition
  const variants = decl.variants.map((v) => {
    if (v.fields.length === 0) {
      return `  | { _tag: "${v.name}" }`;
    }
    const fields = v.fields.map((f) => `${f.name}: ${mapType(f.type)}`).join("; ");
    return `  | { _tag: "${v.name}"; ${fields} }`;
  });

  lines.push(`type ${decl.name} =`);
  lines.push(variants.join("\n") + ";");
  lines.push("");

  // Constructor functions
  for (const v of decl.variants) {
    if (v.fields.length === 0) {
      lines.push(`const ${v.name}: ${decl.name} = { _tag: "${v.name}" };`);
    } else {
      const params = v.fields.map((f) => `${f.name}: ${mapType(f.type)}`).join(", ");
      lines.push(`const ${v.name} = (args: { ${params} }): ${decl.name} => ({ _tag: "${v.name}", ...args });`);
    }
  }

  return lines.join("\n");
}

function generateImportDecl(decl: ImportDecl): string {
  if (decl.isDefault) {
    const alias = decl.alias ? ` as ${decl.alias}` : "";
    return `import ${decl.names[0]}${alias} from "${decl.module}";`;
  }
  return `import { ${decl.names.join(", ")} } from "${decl.module}";`;
}

function generateTraitDecl(decl: TraitDecl): string {
  const methods = decl.methods
    .map((m) => {
      const paramTypes = buildParamTypes(m);
      const params = paramTypes.map((t, i) => `arg${i}: ${t}`).join(", ");
      return `  ${m.name}(${params}): ${buildReturnType(m)};`;
    })
    .join("\n");

  return `interface ${decl.name} {\n${methods}\n}`;
}

function generateImplDecl(decl: ImplDecl): string {
  // Generate as a plain object conforming to the trait interface
  const methods = decl.methods.map((m) => {
    const bodyStr = generateExpr(m.body);
    const params = m.params.join(", ");
    return `  ${m.name}(${params}) { return ${bodyStr}; }`;
  }).join(",\n");

  return `const ${decl.typeName}${decl.traitName}: ${decl.traitName} = {\n${methods}\n};`;
}

// ---- Expression Code Generation ----

function generateExpr(expr: Expr): string {
  switch (expr.kind) {
    case "IntLit":
      return String(expr.value);

    case "FloatLit":
      return String(expr.value);

    case "StringLit":
      if (expr.value.includes("${")) {
        return "`" + expr.value.replace(/`/g, "\\`") + "`";
      }
      return JSON.stringify(expr.value);

    case "CharLit":
      return JSON.stringify(expr.value);

    case "BoolLit":
      return String(expr.value);

    case "Ident":
      return expr.name;

    case "BinaryExpr": {
      const left = generateExpr(expr.left);
      const right = generateExpr(expr.right);
      const op = expr.op === "++" ? "+" : expr.op;
      return `(${left} ${op} ${right})`;
    }

    case "UnaryExpr":
      return `${expr.op}${generateExpr(expr.operand)}`;

    case "CallExpr": {
      const callee = generateExpr(expr.callee);
      const args = expr.args.map(generateExpr).join(", ");
      return `${callee}(${args})`;
    }

    case "IfExpr":
      return `(${generateExpr(expr.condition)} ? ${generateExpr(expr.thenBranch)} : ${generateExpr(expr.elseBranch)})`;

    case "MatchExpr":
      return generateMatchExpr(expr);

    case "LetExpr":
      return `(() => { const ${expr.name} = ${generateExpr(expr.value)}; return ${generateExpr(expr.body)}; })()`;

    case "DoExpr":
      return `(() => {\n${generateDoBody(expr)}\n})()`;

    case "PipeExpr":
      return generatePipeExpr(expr);

    case "LambdaExpr": {
      const params = expr.params.join(", ");
      const body = generateExpr(expr.body);
      return `(${params}) => ${body}`;
    }

    case "ListLit": {
      const elements = expr.elements.map(generateExpr).join(", ");
      return `[${elements}]`;
    }

    case "RecordLit": {
      const fields = expr.fields.map((f) => {
        if (f.spread) return `...${generateExpr(f.value)}`;
        return `${f.name}: ${generateExpr(f.value)}`;
      }).join(", ");
      return `{ ${fields} }`;
    }

    case "TupleLit": {
      const elements = expr.elements.map(generateExpr).join(", ");
      return `[${elements}]`;
    }

    case "MemberExpr":
      return `${generateExpr(expr.object)}.${expr.property}`;

    case "ParenExpr":
      return `(${generateExpr(expr.expr)})`;

    case "ConstructorExpr":
      if (expr.fields.length === 0) {
        return expr.name;
      }
      return `${expr.name}({ ${expr.fields.map((f) => `${f.name}: ${generateExpr(f.value)}`).join(", ")} })`;

    case "SpreadExpr":
      return `...${generateExpr(expr.expr)}`;

    case "ForExpr":
      return `${generateExpr(expr.iterable)}.map((${expr.variable}) => ${generateExpr(expr.body)})`;

    case "BindExpr":
      return ""; // handled in do-notation

    default:
      return `/* unsupported: ${(expr as Expr).kind} */`;
  }
}

function generatePipeExpr(expr: import("../parser/ast.ts").PipeExpr): string {
  const left = generateExpr(expr.left);
  const right = expr.right;

  // If right side is a function call, add left as last argument
  if (right.kind === "CallExpr") {
    const callee = generateExpr(right.callee);
    const args = [...right.args.map(generateExpr), left];
    return `${callee}(${args.join(", ")})`;
  }

  // If right side is an identifier, it's a simple function call
  if (right.kind === "Ident") {
    return `${right.name}(${left})`;
  }

  // For pipe chains, recursively handle
  if (right.kind === "PipeExpr") {
    const innerResult = generateExpr({
      kind: "PipeExpr",
      left: expr.left,
      right: right.left,
    } as Expr);
    return generateExpr({
      kind: "PipeExpr",
      left: { kind: "Ident", name: innerResult } as Expr,
      right: right.right,
    } as Expr);
  }

  return `${generateExpr(right)}(${left})`;
}

function generateMatchExpr(expr: import("../parser/ast.ts").MatchExpr): string {
  // For simple switch-like matches, use a ternary chain
  const subject = generateExpr(expr.subject);
  return generateMatchArmsAsTernary(subject, expr.subject, expr.arms);
}

function generateMatchBody(expr: import("../parser/ast.ts").MatchExpr): string {
  const subject = generateExpr(expr.subject);
  const tmpVar = `_match`;
  const lines: string[] = [];
  lines.push(`  const ${tmpVar} = ${subject};`);

  for (let i = 0; i < expr.arms.length; i++) {
    const arm = expr.arms[i];
    const { condition, bindings } = generatePatternCondition(tmpVar, arm.pattern);
    const body = generateExpr(arm.body);

    const bindingsStr = bindings.length > 0
      ? bindings.map((b) => `    const ${b.name} = ${b.value};`).join("\n")
      : "";

    if (condition === "true" && !arm.guard) {
      // Wildcard/default
      if (bindingsStr) lines.push(bindingsStr);
      lines.push(`  return ${body};`);
    } else if (arm.guard) {
      // With guard: first check pattern, then bind vars, then check guard
      lines.push(`  if (${condition}) {`);
      if (bindingsStr) lines.push(bindingsStr);
      lines.push(`    if (${generateExpr(arm.guard)}) {`);
      lines.push(`      return ${body};`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else {
      lines.push(`  if (${condition}) {`);
      if (bindingsStr) lines.push(bindingsStr);
      lines.push(`    return ${body};`);
      lines.push(`  }`);
    }
  }

  lines.push(`  throw new Error("Match not exhaustive");`);
  return lines.join("\n");
}

function generateMatchArmsAsTernary(
  subjectStr: string,
  subjectExpr: Expr,
  arms: MatchArm[]
): string {
  if (arms.length === 0) return `(() => { throw new Error("Match not exhaustive"); })()`;

  // Build as IIFE with conditions
  const lines: string[] = [];
  lines.push(`(() => {`);
  lines.push(`  const _match = ${subjectStr};`);

  for (const arm of arms) {
    const { condition, bindings } = generatePatternCondition("_match", arm.pattern);
    const body = generateExpr(arm.body);

    const bindingsStr = bindings.map((b) => `const ${b.name} = ${b.value};`).join(" ");

    if (condition === "true" && !arm.guard) {
      if (bindingsStr) lines.push(`  ${bindingsStr}`);
      lines.push(`  return ${body};`);
    } else if (arm.guard) {
      lines.push(`  if (${condition}) {`);
      if (bindingsStr) lines.push(`    ${bindingsStr}`);
      lines.push(`    if (${generateExpr(arm.guard)}) {`);
      lines.push(`      return ${body};`);
      lines.push(`    }`);
      lines.push(`  }`);
    } else {
      lines.push(`  if (${condition}) {`);
      if (bindingsStr) lines.push(`    ${bindingsStr}`);
      lines.push(`    return ${body};`);
      lines.push(`  }`);
    }
  }

  lines.push(`  throw new Error("Match not exhaustive");`);
  lines.push(`})()`);
  return lines.join("\n");
}

interface PatternBinding {
  name: string;
  value: string;
}

function generatePatternCondition(
  subject: string,
  pattern: Pattern
): { condition: string; bindings: PatternBinding[] } {
  switch (pattern.kind) {
    case "WildcardPattern":
      return { condition: "true", bindings: [] };

    case "IdentPattern":
      return { condition: "true", bindings: [{ name: pattern.name, value: subject }] };

    case "LiteralPattern": {
      const val = generateExpr(pattern.value);
      return { condition: `${subject} === ${val}`, bindings: [] };
    }

    case "ConstructorPattern": {
      const conditions: string[] = [`${subject}._tag === "${pattern.name}"`];
      const bindings: PatternBinding[] = [];

      for (const f of pattern.fields) {
        bindings.push({ name: f.name, value: `${subject}.${f.name}` });
        // If the field has a nested pattern that's not just an ident binding
        if (f.pattern.kind !== "IdentPattern" || f.pattern.name !== f.name) {
          const nested = generatePatternCondition(`${subject}.${f.name}`, f.pattern);
          if (nested.condition !== "true") conditions.push(nested.condition);
          bindings.push(...nested.bindings);
        }
      }

      // Handle positional fields (e.g., Some x)
      if (pattern.positionalFields && pattern.positionalFields.length > 0) {
        for (const pf of pattern.positionalFields) {
          if (pf.kind === "IdentPattern") {
            bindings.push({ name: pf.name, value: `${subject}.value` });
          }
        }
      }

      return { condition: conditions.join(" && "), bindings };
    }

    case "TuplePattern": {
      const conditions: string[] = [];
      const bindings: PatternBinding[] = [];

      for (let i = 0; i < pattern.elements.length; i++) {
        const elemSubject = `${subject}[${i}]`;
        const nested = generatePatternCondition(elemSubject, pattern.elements[i]);
        if (nested.condition !== "true") conditions.push(nested.condition);
        bindings.push(...nested.bindings);
      }

      return {
        condition: conditions.length > 0 ? conditions.join(" && ") : "true",
        bindings,
      };
    }

    default:
      return { condition: "true", bindings: [] };
  }
}

function generateDoBody(expr: import("../parser/ast.ts").DoExpr): string {
  const lines: string[] = [];
  let bindCounter = 0;

  for (let i = 0; i < expr.statements.length; i++) {
    const stmt = expr.statements[i];
    const isLast = i === expr.statements.length - 1;

    switch (stmt.kind) {
      case "DoBindStmt": {
        const tmpVar = `_r${bindCounter++}`;
        lines.push(`  const ${tmpVar} = ${generateExpr(stmt.expr)};`);
        lines.push(`  if (!${tmpVar}.ok) return { ok: false, error: ${stmt.errorTag ? `{ _tag: "${stmt.errorTag}" }` : `${tmpVar}.error`} };`);
        if (stmt.name !== "_") {
          lines.push(`  const ${stmt.name} = ${tmpVar}.value;`);
        }
        break;
      }
      case "DoLetStmt":
        lines.push(`  const ${stmt.name} = ${generateExpr(stmt.expr)};`);
        break;
      case "DoExprStmt":
        if (isLast) {
          lines.push(`  return ${generateExpr(stmt.expr)};`);
        } else {
          lines.push(`  ${generateExpr(stmt.expr)};`);
        }
        break;
    }
  }

  return lines.join("\n");
}

function generateLetBody(expr: import("../parser/ast.ts").LetExpr): string {
  const lines: string[] = [];
  lines.push(`  const ${expr.name} = ${generateExpr(expr.value)};`);

  if (expr.body.kind === "LetExpr") {
    lines.push(generateLetBody(expr.body));
  } else {
    lines.push(`  return ${generateExpr(expr.body)};`);
  }

  return lines.join("\n");
}
