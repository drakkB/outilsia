import { readFileSync, writeFileSync } from "node:fs";

export function normalizedSourceText(value) {
  return Buffer.from(value).toString("utf8").replaceAll("\r\n", "\n");
}

export function writeCommittedText(source, target, committed, mismatchMessage) {
  if (normalizedSourceText(readFileSync(source)) !== normalizedSourceText(committed)) {
    throw new Error(mismatchMessage);
  }
  writeFileSync(target, committed);
}
