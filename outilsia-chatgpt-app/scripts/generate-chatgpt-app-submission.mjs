import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const listing = JSON.parse(readFileSync(join(root, "submission", "listing.json"), "utf8"));
const annotations = JSON.parse(
  readFileSync(join(root, "submission", "tool-annotations.json"), "utf8"),
);
const tests = JSON.parse(readFileSync(join(root, "submission", "test-cases.json"), "utf8"));

function toolEntry(annotation) {
  return {
    annotations: {
      readOnlyHint: annotation.readOnlyHint,
      openWorldHint: annotation.openWorldHint,
      destructiveHint: annotation.destructiveHint,
    },
    justifications: {
      read_only_justification: annotation.readOnlyJustification,
      open_world_justification: annotation.openWorldJustification,
      destructive_justification: annotation.destructiveJustification,
    },
  };
}

function positiveTest(test) {
  return {
    description: `${test.expectedBehavior} Fixture : ${test.fixture}`,
    user_prompt: test.prompt,
    file_attachment_urls: null,
    tools_triggered: test.expectedToolSequence[0],
    expected_output: test.expectedResultShape,
    expected_output_url: null,
  };
}

function negativeTest(test) {
  return {
    description: `${test.expectedBehavior} Motif : ${test.reason}`,
    user_prompt: test.prompt,
    file_attachment_urls: null,
    tools_triggered: null,
    expected_output: test.expectedBehavior,
    expected_output_url: null,
  };
}

const output = {
  $schema: "https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json",
  schema_version: 1,
  app_info: {
    display_name: listing.interface.displayName,
    subtitle: listing.interface.shortDescription,
    description: listing.interface.longDescription,
    category: "PRODUCTIVITY",
  },
  tools: Object.fromEntries(
    Object.entries(annotations).map(([name, annotation]) => [name, toolEntry(annotation)]),
  ),
  test_cases: tests.positive.map(positiveTest),
  negative_test_cases: tests.negative.map(negativeTest),
};

const outputPath = join(root, "chatgpt-app-submission.json");
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`chatgpt_app_submission_generated ${outputPath}`);
