// エラー出力のユーティリティ関数群
import { ZodError } from "zod";

export type AuditSeverity = "error" | "manual";

export type AuditIssue = {
  severity: AuditSeverity;
  file: string;
  packageId?: string;
  jsonPath: string;
  rule: string;
  message: string;
};

export class AuditReport {
  private readonly issues: AuditIssue[] = [];

  add(issue: AuditIssue): void {
    this.issues.push(issue);
  }

  addMany(issues: Iterable<AuditIssue>): void {
    for (const issue of issues) {
      this.add(issue);
    }
  }

  addZodError(file: string, error: ZodError): void {
    for (const issue of error.issues) {
      this.add({
        severity: "error",
        file,
        jsonPath: formatJsonPath(issue.path),
        rule: "schema",
        message: issue.message,
      });
    }
  }

  getIssues(): readonly AuditIssue[] {
    return this.issues;
  }

  hasIssues(): boolean {
    return this.issues.length > 0;
  }

  printSummary(): void {
    const orderedIssues = [...this.issues].sort(compareIssues);

    for (const issue of orderedIssues) {
      const packageLabel = issue.packageId ? ` [${issue.packageId}]` : "";
      console.error(
        `${issue.severity.toUpperCase()} ${issue.file}${packageLabel} ${issue.jsonPath} ${issue.rule}: ${issue.message}`,
      );
    }

    const errorCount = this.issues.filter((issue) => issue.severity === "error").length;
    const manualCount = this.issues.filter((issue) => issue.severity === "manual").length;

    console.error("");
    console.error(
      `Summary: ${this.issues.length} issue(s) (${errorCount} error, ${manualCount} manual review).`,
    );
  }
}

export function formatJsonPath(path: readonly PropertyKey[]): string {
  if (path.length === 0) {
    return "<root>";
  }

  return path
    .map((segment) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }

      return `.${String(segment)}`;
    })
    .join("")
    .replace(/^\./, "");
}

function compareIssues(left: AuditIssue, right: AuditIssue): number {
  return (
    compareStrings(left.severity, right.severity) ||
    compareStrings(left.file, right.file) ||
    compareStrings(left.packageId ?? "", right.packageId ?? "") ||
    compareStrings(left.jsonPath, right.jsonPath) ||
    compareStrings(left.rule, right.rule) ||
    compareStrings(left.message, right.message)
  );
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "ja");
}
