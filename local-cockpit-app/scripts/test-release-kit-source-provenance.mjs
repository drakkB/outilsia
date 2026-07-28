#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeCommittedText } from "./release-kit-source-provenance.mjs";

const root = mkdtempSync(join(tmpdir(), "outilsia-source-provenance-"));
try {
  const source = join(root, "source.txt");
  const target = join(root, "target.txt");
  const committed = Buffer.from("first line\nsecond line\n", "utf8");

  writeFileSync(source, "first line\r\nsecond line\r\n", "utf8");
  writeCommittedText(source, target, committed, "unexpected mismatch");
  if (!readFileSync(target).equals(committed)) {
    throw new Error("RC kit must contain the exact committed bytes");
  }

  writeFileSync(source, "first line\r\nchanged line\r\n", "utf8");
  let rejected = false;
  try {
    writeCommittedText(source, target, committed, "expected content mismatch");
  } catch (error) {
    rejected = String(error?.message || error).includes("expected content mismatch");
  }
  if (!rejected) {
    throw new Error("RC kit must reject a real source change");
  }

  console.log("release_kit_source_provenance_ok crlf=accepted mutation=rejected output=committed_bytes");
} finally {
  rmSync(root, { recursive: true, force: true });
}
