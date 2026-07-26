#!/usr/bin/env node
import "../src/release-update-policy.js";

const policy = globalThis.__OUTILSIA_RELEASE_UPDATE_POLICY__;

function fail(message) {
  throw new Error(message);
}

function equal(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function fixtureRelease() {
  const files = [
    { name: "OutilsIA-windows.msi", platform: "windows-x64", url: "/windows.msi" },
    { name: "OutilsIA-linux.deb", platform: "linux", url: "/linux.deb" },
    { name: "OutilsIA-windows.exe", platform: "windows-x64", url: "/windows.exe" },
    { name: "OutilsIA-linux.AppImage", platform: "linux", url: "/linux.AppImage" },
    { name: "OutilsIA-linux.rpm", platform: "linux", url: "/linux.rpm" }
  ];
  return {
    ok: true,
    version: "0.1.1",
    build_id: "291439601671",
    primary_download: files[2],
    files,
    downloads_by_platform: {
      "windows-x64": files.filter((file) => file.platform === "windows-x64"),
      linux: files.filter((file) => file.platform === "linux")
    }
  };
}

if (!policy) fail("Release update policy was not installed");

equal(policy.normalizeDesktopPlatform("windows", "x86_64"), "windows-x64", "Windows x64 platform");
equal(policy.normalizeDesktopPlatform("Windows", "aarch64"), "windows-arm64", "Windows ARM platform");
equal(policy.normalizeDesktopPlatform("Ubuntu 24.04"), "linux", "Linux platform");
equal(policy.normalizeDesktopPlatform("darwin"), "macos", "macOS platform");

const release = fixtureRelease();
equal(policy.artifactForPlatform(release, "windows-x64")?.name, "OutilsIA-windows.exe", "Windows prefers EXE");
equal(policy.artifactForPlatform(release, "linux")?.name, "OutilsIA-linux.AppImage", "Linux prefers AppImage");
equal(policy.artifactForPlatform(release, "macos"), null, "Missing platform never falls back to Windows");

equal(policy.updateStatus({
  app_version: "0.1.1",
  channel: "beta",
  build_id: "291439601671"
}, release).key, "current", "Exact public build");

equal(policy.updateStatus({
  app_version: "0.1.0",
  channel: "beta",
  build_id: "291439601671"
}, release).key, "update", "Contradictory version cannot be current");

const oldVersion = policy.updateStatus({
  app_version: "0.1.0",
  channel: "beta",
  build_id: "280000000000"
}, release);
equal(oldVersion.key, "update", "Older version");
equal(oldVersion.update_available, true, "Older version update flag");

equal(policy.updateStatus({
  app_version: "0.1.1",
  channel: "beta",
  build_id: "290000000000"
}, release).key, "update", "Older build of same version");

equal(policy.updateStatus({
  app_version: "0.1.2",
  channel: "rc",
  build_id: "302038485811"
}, release).key, "candidate", "Private RC does not downgrade");

equal(policy.updateStatus({
  app_version: "0.1.2",
  channel: "beta",
  build_id: "local-dev"
}, release).key, "candidate_ahead", "Source candidate ahead of public");

equal(policy.updateStatus({
  app_version: "0.1.1",
  channel: "beta",
  build_id: "local-dev"
}, release).key, "local", "Local build of public version");

equal(policy.updateStatus({
  app_version: "0.1.1",
  channel: "beta",
  build_id: "opaque-build"
}, release).key, "different", "Opaque different build");

equal(policy.updateStatus({
  app_version: "0.1.1",
  channel: "beta",
  build_id: "291439601671"
}, {}).key, "unavailable", "Unavailable manifest");

console.log("release_update_policy_ok platforms=4 artifacts=3 statuses=7 no_cross_platform_fallback");
