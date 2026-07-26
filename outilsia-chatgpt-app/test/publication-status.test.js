import test from "node:test";
import assert from "node:assert/strict";
import {
  publicationStatusCopy,
  validatePublicationStatus,
  validatePublicationTransition,
} from "../lib/publication-status.js";

function status(overrides = {}) {
  return {
    schema_version: "outilsia.chatgpt.publication-status.v1",
    app_name: "OutilsIA Local Cockpit",
    submission_version: "1.0.0",
    mcp_version: "0.3.0",
    state: "review",
    submitted_on: "2026-07-26",
    last_checked_on: "2026-07-26",
    evidence: {
      kind: "openai_platform_dashboard",
      label: "OpenAI Platform > Plugins",
      status_label: "Review",
    },
    approved_on: null,
    published_on: null,
    directory_url: null,
    ...overrides,
  };
}

test("review remains explicitly unpublished", () => {
  const copy = publicationStatusCopy(status());
  assert.equal(copy.state, "review");
  assert.match(copy.honest, /reste en cours d'examen/);
  assert.match(copy.llmsStatus, /not yet published or approved/);
});

test("approved is distinct from published", () => {
  const copy = publicationStatusCopy(status({
    state: "approved_unpublished",
    approved_on: "2026-07-28",
    last_checked_on: "2026-07-28",
    evidence: { kind: "openai_platform_dashboard", label: "OpenAI Platform > Plugins", status_label: "Approved" },
  }));
  assert.match(copy.honest, /approuvé/);
  assert.match(copy.honest, /pas encore publiée/);
  assert.doesNotMatch(copy.heroActions.join(" "), /chatgpt\.com/);
});

test("published requires an official directory URL", () => {
  assert.throws(
    () => validatePublicationStatus(status({
      state: "published",
      approved_on: "2026-07-28",
      published_on: "2026-07-29",
      last_checked_on: "2026-07-29",
      directory_url: "https://example.com/outilsia",
    })),
    /chatgpt\.com/,
  );
});

test("published copy links to the reviewed directory entry", () => {
  const copy = publicationStatusCopy(status({
    state: "published",
    approved_on: "2026-07-28",
    published_on: "2026-07-29",
    last_checked_on: "2026-07-29",
    directory_url: "https://chatgpt.com/plugins/outilsia-local-cockpit",
    evidence: { kind: "openai_platform_dashboard", label: "OpenAI Platform > Plugins", status_label: "Published" },
  }));
  assert.match(copy.heroActions.join(" "), /https:\/\/chatgpt\.com\/plugins\/outilsia-local-cockpit/);
  assert.match(copy.llmsStatus, /has been published/);
});

test("review cannot retain approval or publication fields", () => {
  assert.throws(
    () => validatePublicationStatus(status({ approved_on: "2026-07-28" })),
    /review cannot have approved_on/,
  );
});

test("dashboard evidence is mandatory", () => {
  assert.throws(
    () => validatePublicationStatus(status({
      evidence: { kind: "guess", label: "Search", status_label: "Review" },
    })),
    /OpenAI Platform dashboard/,
  );
});

test("approval cannot postdate the dashboard check", () => {
  assert.throws(
    () => validatePublicationStatus(status({
      state: "approved_unpublished",
      approved_on: "2026-07-28",
      last_checked_on: "2026-07-27",
      evidence: { kind: "openai_platform_dashboard", label: "OpenAI Platform > Plugins", status_label: "Approved" },
    })),
    /last_checked_on cannot predate approved_on/,
  );
});

test("review must pass through approval before publication", () => {
  assert.throws(
    () => validatePublicationTransition("review", "published"),
    /review->published/,
  );
  assert.equal(
    validatePublicationTransition("review", "approved_unpublished"),
    "approved_unpublished",
  );
  assert.equal(
    validatePublicationTransition("approved_unpublished", "published"),
    "published",
  );
});

test("a published listing cannot silently regress to review", () => {
  assert.throws(
    () => validatePublicationTransition("published", "review"),
    /published->review/,
  );
});
