(function installReleaseUpdatePolicy(global) {
  function normalizeDesktopPlatform(value = "", arch = "") {
    const text = String(value || "").toLowerCase();
    const architecture = String(arch || "").toLowerCase();
    if (text.includes("mac") || text.includes("darwin")) return "macos";
    if (text.includes("win")) {
      const arm = architecture.includes("arm") || architecture.includes("aarch64");
      return arm ? "windows-arm64" : "windows-x64";
    }
    if (text.includes("linux") || text.includes("ubuntu") || text.includes("debian")) return "linux";
    return "";
  }

  function artifactExtension(file = {}) {
    const name = String(file.name || file.original_name || "").toLowerCase();
    for (const extension of [".appimage", ".exe", ".msi", ".deb", ".rpm", ".dmg"]) {
      if (name.endsWith(extension)) return extension;
    }
    return "";
  }

  function artifactForPlatform(release = {}, platform = "") {
    if (!platform || platform === "unknown") return null;
    const grouped = Array.isArray(release?.downloads_by_platform?.[platform])
      ? release.downloads_by_platform[platform]
      : [];
    const files = grouped.length
      ? grouped
      : (Array.isArray(release?.files) ? release.files.filter((file) => file?.platform === platform) : []);
    if (!files.length) return null;
    const priorities = {
      "windows-x64": [".exe", ".msi"],
      "windows-arm64": [".exe", ".msi"],
      linux: [".appimage", ".deb", ".rpm"],
      macos: [".dmg"]
    }[platform] || [];
    return [...files].sort((left, right) => {
      const leftPriority = priorities.indexOf(artifactExtension(left));
      const rightPriority = priorities.indexOf(artifactExtension(right));
      return (leftPriority < 0 ? 99 : leftPriority) - (rightPriority < 0 ? 99 : rightPriority);
    })[0] || null;
  }

  function semanticVersionParts(value = "") {
    const match = String(value || "").trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    return match ? match.slice(1).map(Number) : null;
  }

  function compareSemanticVersions(left = "", right = "") {
    const a = semanticVersionParts(left);
    const b = semanticVersionParts(right);
    if (!a || !b) return null;
    for (let index = 0; index < 3; index += 1) {
      if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
    }
    return 0;
  }

  function compareNumericBuildIds(left = "", right = "") {
    const a = String(left || "");
    const b = String(right || "");
    if (!/^\d{6,20}$/.test(a) || !/^\d{6,20}$/.test(b)) return null;
    const leftNumber = BigInt(a);
    const rightNumber = BigInt(b);
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }

  function updateStatus(buildInfo = {}, release = {}) {
    const installedVersion = String(buildInfo.app_version || "");
    const publicVersion = String(release?.version || "");
    const installedBuild = String(buildInfo.build_id || "");
    const publicBuild = String(release?.build_id || "");
    const channel = String(buildInfo.channel || "");
    const placeholderBuild = ["", "local-dev", "browser-demo", "unknown-build"].includes(installedBuild);
    const exactPublicBuild = Boolean(installedBuild && publicBuild && installedBuild === publicBuild);
    const versionOrder = compareSemanticVersions(installedVersion, publicVersion);
    const buildOrder = compareNumericBuildIds(installedBuild, publicBuild);

    if (!release?.ok || !publicVersion) {
      return { key: "unavailable", installed_version: installedVersion, public_version: publicVersion, update_available: false };
    }
    if (channel === "rc") {
      return { key: "candidate", installed_version: installedVersion, public_version: publicVersion, update_available: false };
    }
    if (exactPublicBuild && versionOrder === 0) {
      return { key: "current", installed_version: installedVersion, public_version: publicVersion, update_available: false };
    }
    if (versionOrder === -1 || (versionOrder === 0 && buildOrder === -1)) {
      return { key: "update", installed_version: installedVersion, public_version: publicVersion, update_available: true };
    }
    if (versionOrder === 1 || (versionOrder === 0 && buildOrder === 1)) {
      return { key: "candidate_ahead", installed_version: installedVersion, public_version: publicVersion, update_available: false };
    }
    if (placeholderBuild) {
      return { key: "local", installed_version: installedVersion, public_version: publicVersion, update_available: false };
    }
    return { key: "different", installed_version: installedVersion, public_version: publicVersion, update_available: false };
  }

  global.__OUTILSIA_RELEASE_UPDATE_POLICY__ = Object.freeze({
    normalizeDesktopPlatform,
    artifactExtension,
    artifactForPlatform,
    compareSemanticVersions,
    compareNumericBuildIds,
    updateStatus
  });
})(globalThis);
