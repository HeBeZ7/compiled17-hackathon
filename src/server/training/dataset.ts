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
  if (messages.length === 0) return "messages is empty";
  for (const message of messages) {
    if (typeof message !== "object" || message === null) return "Message format is invalid";
    if (!CHAT_ROLES.has(String((message as { role?: unknown }).role))) return "Contains an unsupported role";
  }
  if ((messages.at(-1) as { role?: unknown }).role !== "assistant") return "the last message must be from assistant";
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
    return { format: null, exampleCount: 0, issues: ["Not UTF-8 text"] };
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
      addIssue(`Line ${lineNumber}: not JSON`);
      return;
    }
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      addIssue(`Line ${lineNumber}: must be a JSON object`);
      return;
    }

    const record = row as Record<string, unknown>;
    const rowFormat = formatOf(record);
    if (!rowFormat) {
      addIssue(`Line ${lineNumber}: must use one of the messages, prompt/completion or text formats`);
      return;
    }
    format ??= rowFormat;
    if (rowFormat !== format) {
      addIssue(`Line ${lineNumber}: a file cannot mix formats`);
      return;
    }
    if (rowFormat === "conversational") {
      const issue = conversationIssue(record.messages as unknown[]);
      if (issue) {
        addIssue(`Line ${lineNumber}: ${issue}`);
        return;
      }
    }
    exampleCount += 1;
  });

  if (exampleCount === 0 && issues.length === 0) issues.push("No training examples");
  return { format, exampleCount, issues };
}
