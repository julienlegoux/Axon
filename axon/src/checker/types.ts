/** Internal type representations for the Axon type checker */

export type Type =
  | { kind: "Primitive"; name: "Int" | "Float" | "String" | "Bool" | "Unit" }
  | { kind: "Func"; params: Type[]; returnType: Type }
  | { kind: "List"; element: Type }
  | { kind: "Map"; key: Type; value: Type }
  | { kind: "Tuple"; elements: Type[] }
  | { kind: "Record"; fields: Map<string, Type> }
  | { kind: "Enum"; name: string; variants: Map<string, Map<string, Type>> }
  | { kind: "Result"; okType: Type; errType: Type }
  | { kind: "Option"; innerType: Type }
  | { kind: "TypeVar"; name: string }
  | { kind: "Unknown" };

// Convenience constructors
export const INT: Type = { kind: "Primitive", name: "Int" };
export const FLOAT: Type = { kind: "Primitive", name: "Float" };
export const STRING: Type = { kind: "Primitive", name: "String" };
export const BOOL: Type = { kind: "Primitive", name: "Bool" };
export const UNIT: Type = { kind: "Primitive", name: "Unit" };
export const UNKNOWN: Type = { kind: "Unknown" };

export function funcType(params: Type[], returnType: Type): Type {
  return { kind: "Func", params, returnType };
}

export function listType(element: Type): Type {
  return { kind: "List", element };
}

export function tupleType(elements: Type[]): Type {
  return { kind: "Tuple", elements };
}

export function recordType(fields: Map<string, Type>): Type {
  return { kind: "Record", fields };
}

export function resultType(okType: Type, errType: Type): Type {
  return { kind: "Result", okType, errType };
}

export function optionType(innerType: Type): Type {
  return { kind: "Option", innerType };
}

/** Check if two types are equal */
export function typesEqual(a: Type, b: Type): boolean {
  if (a.kind === "Unknown" || b.kind === "Unknown") return true;
  if (a.kind === "TypeVar" || b.kind === "TypeVar") return true;

  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "Primitive":
      return a.name === (b as typeof a).name;
    case "Func": {
      const bf = b as typeof a;
      if (a.params.length !== bf.params.length) return false;
      return a.params.every((p, i) => typesEqual(p, bf.params[i])) &&
        typesEqual(a.returnType, bf.returnType);
    }
    case "List":
      return typesEqual(a.element, (b as typeof a).element);
    case "Map":
      return typesEqual(a.key, (b as typeof a).key) &&
        typesEqual(a.value, (b as typeof a).value);
    case "Tuple": {
      const bt = b as typeof a;
      if (a.elements.length !== bt.elements.length) return false;
      return a.elements.every((e, i) => typesEqual(e, bt.elements[i]));
    }
    case "Record": {
      const br = b as typeof a;
      if (a.fields.size !== br.fields.size) return false;
      for (const [k, v] of a.fields) {
        const bv = br.fields.get(k);
        if (!bv || !typesEqual(v, bv)) return false;
      }
      return true;
    }
    case "Enum":
      return a.name === (b as typeof a).name;
    case "Result":
      return typesEqual(a.okType, (b as typeof a).okType) &&
        typesEqual(a.errType, (b as typeof a).errType);
    case "Option":
      return typesEqual(a.innerType, (b as typeof a).innerType);
    default:
      return false;
  }
}

/** Pretty-print a type */
export function typeToString(t: Type): string {
  switch (t.kind) {
    case "Primitive":
      return t.name;
    case "Func":
      if (t.params.length === 0) return typeToString(t.returnType);
      return t.params.map(typeToString).join(" -> ") + " -> " + typeToString(t.returnType);
    case "List":
      return `List ${typeToString(t.element)}`;
    case "Map":
      return `Map ${typeToString(t.key)} ${typeToString(t.value)}`;
    case "Tuple":
      return `(${t.elements.map(typeToString).join(", ")})`;
    case "Record": {
      const fields = [...t.fields.entries()].map(([k, v]) => `${k}: ${typeToString(v)}`).join(", ");
      return `{ ${fields} }`;
    }
    case "Enum":
      return t.name;
    case "Result":
      return `Result ${typeToString(t.okType)} ${typeToString(t.errType)}`;
    case "Option":
      return `Option ${typeToString(t.innerType)}`;
    case "TypeVar":
      return t.name;
    case "Unknown":
      return "Unknown";
  }
}
