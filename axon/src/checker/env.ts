import type { Type } from "./types.ts";

export interface EnumDef {
  name: string;
  variants: Map<string, Map<string, Type>>;
}

export class TypeEnv {
  private scopes: Map<string, Type>[] = [new Map()];
  private typeAliases: Map<string, Type> = new Map();
  private enumDefs: Map<string, EnumDef> = new Map();

  pushScope(): void {
    this.scopes.push(new Map());
  }

  popScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }

  define(name: string, type: Type): void {
    this.scopes[this.scopes.length - 1].set(name, type);
  }

  lookup(name: string): Type | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const t = this.scopes[i].get(name);
      if (t !== undefined) return t;
    }
    return undefined;
  }

  defineType(name: string, type: Type): void {
    this.typeAliases.set(name, type);
  }

  lookupType(name: string): Type | undefined {
    return this.typeAliases.get(name);
  }

  defineEnum(name: string, def: EnumDef): void {
    this.enumDefs.set(name, def);
  }

  lookupEnum(name: string): EnumDef | undefined {
    return this.enumDefs.get(name);
  }

  /** Find which enum a variant belongs to */
  lookupVariant(variantName: string): { enumDef: EnumDef; fields: Map<string, Type> } | undefined {
    for (const [, enumDef] of this.enumDefs) {
      const fields = enumDef.variants.get(variantName);
      if (fields !== undefined) {
        return { enumDef, fields };
      }
    }
    return undefined;
  }
}
