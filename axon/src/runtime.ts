/** Axon Runtime Library */

// Result type
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T, E>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<T, E>(error: E): Result<T, E> {
  return { ok: false, error };
}

// Option helpers
export type Option<T> = T | null;

export function some<T>(value: T): T {
  return value;
}

export const none = null;

// Pipe helper
export function pipe<T>(value: T, ...fns: ((arg: any) => any)[]): any {
  return fns.reduce((acc, fn) => fn(acc), value);
}

// Refinement validation error
export class RefinementError extends Error {
  constructor(
    public typeName: string,
    public constraint: string,
    public value: unknown
  ) {
    super(
      `${typeName} validation failed: ${constraint} (got ${JSON.stringify(value)})`
    );
  }
}

// Standard library functions

// List operations
export function map<A, B>(f: (a: A) => B, list: A[]): B[] {
  return list.map(f);
}

export function filter<A>(f: (a: A) => boolean, list: A[]): A[] {
  return list.filter(f);
}

export function fold<A, B>(f: (acc: B, a: A) => B, init: B, list: A[]): B {
  return list.reduce(f, init);
}

export function find<A>(f: (a: A) => boolean, list: A[]): Option<A> {
  return list.find(f) ?? null;
}

export function any<A>(f: (a: A) => boolean, list: A[]): boolean {
  return list.some(f);
}

export function all<A>(f: (a: A) => boolean, list: A[]): boolean {
  return list.every(f);
}

export function head<A>(list: A[]): Option<A> {
  return list.length > 0 ? list[0] : null;
}

export function tail<A>(list: A[]): A[] {
  return list.slice(1);
}

export function length<A>(list: A[]): number {
  return list.length;
}

export function concat<A>(a: A[], b: A[]): A[] {
  return [...a, ...b];
}

export function flat_map<A, B>(f: (a: A) => B[], list: A[]): B[] {
  return list.flatMap(f);
}

export function zip<A, B>(a: A[], b: B[]): [A, B][] {
  const len = Math.min(a.length, b.length);
  const result: [A, B][] = [];
  for (let i = 0; i < len; i++) {
    result.push([a[i], b[i]]);
  }
  return result;
}

export function sort_by<A>(f: (a: A) => any, list: A[]): A[] {
  return [...list].sort((a, b) => {
    const fa = f(a);
    const fb = f(b);
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
}

export function unique<A>(list: A[]): A[] {
  return [...new Set(list)];
}

export function group_by<A, K extends string | number>(
  f: (a: A) => K,
  list: A[]
): Map<K, A[]> {
  const groups = new Map<K, A[]>();
  for (const item of list) {
    const key = f(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

export function chunk<A>(size: number, list: A[]): A[][] {
  const chunks: A[][] = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

export function take<A>(n: number, list: A[]): A[] {
  return list.slice(0, n);
}

// String operations
export function trim(s: string): string {
  return s.trim();
}

export function split(sep: string, s: string): string[] {
  return s.split(sep);
}

export function join(sep: string, list: string[]): string {
  return list.join(sep);
}

export function contains(sub: string, s: string): boolean {
  return s.includes(sub);
}

export function replace(from: string, to: string, s: string): string {
  return s.replaceAll(from, to);
}

export function to_upper(s: string): string {
  return s.toUpperCase();
}

export function to_lower(s: string): string {
  return s.toLowerCase();
}

export function starts_with(prefix: string, s: string): boolean {
  return s.startsWith(prefix);
}

export function ends_with(suffix: string, s: string): boolean {
  return s.endsWith(suffix);
}

// Math
export function abs(n: number): number {
  return Math.abs(n);
}

export function max(a: number, b: number): number {
  return Math.max(a, b);
}

export function min(a: number, b: number): number {
  return Math.min(a, b);
}

export function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// IO
export function print(s: string): void {
  console.log(s);
}

export function debug(value: any): void {
  console.log(JSON.stringify(value, null, 2));
}

// Option helpers
export function unwrap<T>(opt: Option<T>): T {
  if (opt === null) throw new Error("unwrap called on None");
  return opt;
}

export function unwrap_or<T>(defaultVal: T, opt: Option<T>): T {
  return opt !== null ? opt : defaultVal;
}

export function map_option<A, B>(f: (a: A) => B, opt: Option<A>): Option<B> {
  return opt !== null ? f(opt) : null;
}

export function is_some<T>(opt: Option<T>): boolean {
  return opt !== null;
}

export function is_none<T>(opt: Option<T>): boolean {
  return opt === null;
}

// Result helpers
export function map_result<A, B, E>(
  f: (a: A) => B,
  result: Result<A, E>
): Result<B, E> {
  return result.ok ? ok(f(result.value)) : result;
}

export function map_err<A, E, F>(
  f: (e: E) => F,
  result: Result<A, E>
): Result<A, F> {
  return result.ok ? result : err(f(result.error));
}

export function unwrap_result<A, E>(result: Result<A, E>): A {
  if (!result.ok) throw new Error(`unwrap_result called on Err: ${JSON.stringify(result.error)}`);
  return result.value;
}
