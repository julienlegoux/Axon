import { readFileSync } from "fs";
import { resolve, dirname } from "path";

/** Known runtime function names from the Axon stdlib */
export const RUNTIME_FUNCTIONS = new Set([
  "ok", "err", "map", "filter", "fold", "find", "any", "all",
  "head", "tail", "length", "concat", "flat_map", "zip", "sort_by",
  "unique", "group_by", "chunk", "take", "trim", "split", "join",
  "contains", "replace", "to_upper", "to_lower", "starts_with", "ends_with",
  "abs", "max", "min", "clamp", "print", "debug", "pipe",
  "unwrap", "unwrap_or", "map_option", "is_some", "is_none",
  "map_result", "map_err", "unwrap_result", "some", "none",
]);

/** Returns the full runtime source as a string */
export function getRuntimeSource(): string {
  const runtimePath = resolve(dirname(import.meta.dir), "runtime.ts");
  return readFileSync(runtimePath, "utf-8");
}
