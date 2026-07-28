use serde_json::Value;
use std::path::PathBuf;
use std::process::Command;

pub(crate) fn run_sdk_probe(
    mode: &str,
    mcp_url: &str,
    token: &str,
    exercise: bool,
) -> Result<Value, String> {
    let script = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("scripts")
        .join("probe-mcp-sdk.mjs");
    if !script.is_file() {
        return Err("MCP SDK conformance script is missing".to_string());
    }
    let output = Command::new("node")
        .arg(&script)
        .env("OUTILSIA_MCP_CONFORMANCE_MODE", mode)
        .env(
            "OUTILSIA_MCP_CONFORMANCE_EXERCISE",
            if exercise { "1" } else { "0" },
        )
        .env("OUTILSIA_LOCAL_MCP_URL", mcp_url)
        .env("OUTILSIA_LOCAL_MCP_TOKEN", token)
        .output()
        .map_err(|error| format!("Unable to start official MCP SDK probe: {error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stdout.contains(token) || stderr.contains(token) {
        return Err("Official MCP SDK probe leaked the bearer token".to_string());
    }
    if !output.status.success() {
        return Err(format!(
            "Official MCP SDK probe failed: {}",
            stderr.trim().chars().take(800).collect::<String>()
        ));
    }
    let report = serde_json::from_str::<Value>(stdout.trim())
        .map_err(|error| format!("Official MCP SDK probe returned invalid JSON: {error}"))?;
    if report.get("status").and_then(Value::as_str) != Some("passed") {
        return Err("Official MCP SDK probe did not pass".to_string());
    }
    Ok(report)
}
