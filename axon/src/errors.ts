/** Error formatting for Axon compiler */

export interface SourceError {
  code: string;
  severity: "error" | "warning";
  message: string;
  line: number;
  column: number;
  length?: number;
  source: string;
  file?: string;
  hint?: string;
  fix?: string;
}

export function formatError(err: SourceError): string {
  const lines: string[] = [];
  const tag = err.severity === "error" ? "error" : "warning";
  const file = err.file || "<input>";

  lines.push(`${tag}[${err.code}]: ${err.message}`);
  lines.push(`  --> ${file}:${err.line}:${err.column}`);

  // Extract the source line
  const sourceLines = err.source.split("\n");
  if (err.line > 0 && err.line <= sourceLines.length) {
    const sourceLine = sourceLines[err.line - 1];
    const lineNum = String(err.line);
    const pad = " ".repeat(lineNum.length);

    lines.push(`${pad} |`);
    lines.push(`${lineNum} | ${sourceLine}`);

    // Underline
    const underlineLen = err.length || 1;
    const offset = Math.max(0, err.column - 1);
    lines.push(`${pad} | ${" ".repeat(offset)}${"^".repeat(underlineLen)}`);
  }

  if (err.hint) {
    const pad = " ".repeat(String(err.line).length);
    lines.push(`${pad} |`);
    lines.push(`${pad} = help: ${err.hint}`);
  }

  if (err.fix) {
    const pad = " ".repeat(String(err.line).length);
    lines.push(`${pad} = fix: ${err.fix}`);
  }

  return lines.join("\n");
}

export function formatErrors(errors: SourceError[]): string {
  return errors.map(formatError).join("\n\n");
}
