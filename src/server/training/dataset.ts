const MAX_ISSUES = 20;
const CHAT_ROLES = new Set(["system", "user", "assistant", "tool"]);

export type DatasetFormat = "conversational" | "instruction" | "text";

export interface DatasetInspection {
  format: DatasetFormat | null;
  exampleCount: number;
  issues: string[];
}

function formatOf(row: Record<string, unknown>): DatasetFormat | null {
  if (Array.isArray(row.messages)) return "conversational";
  if (typeof row.prompt === "string" && typeof row.completion === "string") return "instruction";
  if (typeof row.text === "string") return "text";
  return null;
}

function conversationIssue(messages: unknown[]): string | null {
  if (messages.length === 0) return "messages가 비어 있습니다.";
  for (const message of messages) {
    if (typeof message !== "object" || message === null) return "메시지 형식이 올바르지 않습니다.";
    if (!CHAT_ROLES.has(String((message as { role?: unknown }).role))) return "지원하지 않는 role이 있습니다.";
  }
  if ((messages.at(-1) as { role?: unknown }).role !== "assistant") return "마지막 메시지는 assistant여야 합니다.";
  return null;
}

/**
 * Checks the JSONL shapes in the Nebius dataset guide. Issues carry line numbers
 * only, never file content. Pretokenized datasets are not accepted on this path.
 */
export function inspectDataset(bytes: Uint8Array): DatasetInspection {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { format: null, exampleCount: 0, issues: ["UTF-8 텍스트가 아닙니다."] };
  }

  const issues: string[] = [];
  const addIssue = (issue: string) => {
    if (issues.length < MAX_ISSUES) issues.push(issue);
  };

  let format: DatasetFormat | null = null;
  let exampleCount = 0;

  text.split(/\r?\n/).forEach((line, index) => {
    if (line.trim() === "") return;
    const lineNumber = index + 1;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      addIssue(`${lineNumber}행: JSON이 아닙니다.`);
      return;
    }
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      addIssue(`${lineNumber}행: JSON 객체여야 합니다.`);
      return;
    }

    const record = row as Record<string, unknown>;
    const rowFormat = formatOf(record);
    if (!rowFormat) {
      addIssue(`${lineNumber}행: messages, prompt/completion, text 중 하나의 형식이어야 합니다.`);
      return;
    }
    format ??= rowFormat;
    if (rowFormat !== format) {
      addIssue(`${lineNumber}행: 한 파일에 여러 형식을 섞을 수 없습니다.`);
      return;
    }
    if (rowFormat === "conversational") {
      const issue = conversationIssue(record.messages as unknown[]);
      if (issue) {
        addIssue(`${lineNumber}행: ${issue}`);
        return;
      }
    }
    exampleCount += 1;
  });

  if (exampleCount === 0 && issues.length === 0) issues.push("학습 예시가 없습니다.");
  return { format, exampleCount, issues };
}
