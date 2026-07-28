use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Cursor, Read};
use tiny_http::{Header, Request as TinyRequest, Response as TinyResponse, StatusCode};

#[derive(Debug)]
pub(crate) struct HttpRequest {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) headers: HashMap<String, String>,
    pub(crate) body: Vec<u8>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct JsonResponsePolicy<'a> {
    pub(crate) allowed_methods: &'static str,
    pub(crate) allowed_headers: &'static str,
    pub(crate) origin: Option<&'a str>,
    pub(crate) deny_browser_origin: bool,
    pub(crate) allow_private_network: bool,
    pub(crate) protocol_version: Option<&'a str>,
    pub(crate) bearer_realm: Option<&'a str>,
}

pub(crate) fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn canonical_json(value: &Value, output: &mut String) {
    match value {
        Value::Null => output.push_str("null"),
        Value::Bool(value) => output.push_str(if *value { "true" } else { "false" }),
        Value::Number(value) => output.push_str(&value.to_string()),
        Value::String(value) => {
            output.push_str(&serde_json::to_string(value).unwrap_or_else(|_| "\"\"".to_string()))
        }
        Value::Array(values) => {
            output.push('[');
            for (index, item) in values.iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                canonical_json(item, output);
            }
            output.push(']');
        }
        Value::Object(values) => {
            output.push('{');
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            for (index, key) in keys.into_iter().enumerate() {
                if index > 0 {
                    output.push(',');
                }
                output.push_str(&serde_json::to_string(key).unwrap_or_else(|_| "\"\"".to_string()));
                output.push(':');
                canonical_json(&values[key], output);
            }
            output.push('}');
        }
    }
}

pub(crate) fn canonical_sha256(value: &Value) -> String {
    let mut canonical = String::new();
    canonical_json(value, &mut canonical);
    sha256_bytes(canonical.as_bytes())
}

pub(crate) fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

pub(crate) fn allowed_loopback_host(host: &str) -> bool {
    let normalized = host.trim().to_ascii_lowercase();
    ["127.0.0.1", "localhost"].iter().any(|name| {
        normalized == *name
            || normalized
                .strip_prefix(&format!("{name}:"))
                .and_then(|port| port.parse::<u16>().ok())
                .is_some()
    })
}

pub(crate) fn allowed_loopback_origin(origin: &str) -> bool {
    ["http://127.0.0.1", "http://localhost"]
        .iter()
        .any(|prefix| {
            origin == *prefix
                || origin
                    .strip_prefix(&format!("{prefix}:"))
                    .and_then(|port| port.parse::<u16>().ok())
                    .is_some()
        })
}

pub(crate) fn bearer_authorized(request: &HttpRequest, expected_token: &str) -> bool {
    request
        .headers
        .get("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(|token| constant_time_eq(expected_token, token))
        .unwrap_or(false)
}

pub(crate) fn read_request(
    request: &mut TinyRequest,
    max_request_bytes: usize,
) -> Result<HttpRequest, String> {
    let header_bytes = request.headers().iter().fold(
        request.method().as_str().len() + request.url().len(),
        |total, header| {
            total
                .saturating_add(header.field.as_str().len())
                .saturating_add(header.value.as_str().len())
                .saturating_add(4)
        },
    );
    let headers = request
        .headers()
        .iter()
        .map(|header| {
            (
                header.field.as_str().to_ascii_lowercase().to_string(),
                header.value.as_str().to_string(),
            )
        })
        .collect::<HashMap<_, _>>();
    if headers.contains_key("transfer-encoding") {
        return Err("transfer_encoding_not_supported".to_string());
    }
    let content_length = request.body_length().unwrap_or(0);
    if header_bytes.saturating_add(content_length) > max_request_bytes {
        return Err("request_too_large".to_string());
    }
    let mut body = Vec::with_capacity(content_length);
    request
        .as_reader()
        .take((max_request_bytes + 1) as u64)
        .read_to_end(&mut body)
        .map_err(|_| "request_body_unreadable".to_string())?;
    if body.len() > max_request_bytes {
        return Err("request_too_large".to_string());
    }
    Ok(HttpRequest {
        method: request.method().as_str().to_string(),
        path: request.url().to_string(),
        headers,
        body,
    })
}

pub(crate) fn tiny_response(raw: Vec<u8>) -> TinyResponse<Cursor<Vec<u8>>> {
    let split = raw
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .unwrap_or(raw.len());
    let head = String::from_utf8_lossy(&raw[..split.saturating_sub(4)]);
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(500);
    let headers = lines
        .filter_map(|line| line.split_once(':'))
        .filter(|(name, _)| {
            !name.eq_ignore_ascii_case("content-length") && !name.eq_ignore_ascii_case("connection")
        })
        .filter_map(|(name, value)| Header::from_bytes(name.trim(), value.trim()).ok())
        .collect::<Vec<_>>();
    let body = raw[split..].to_vec();
    let length = body.len();
    TinyResponse::new(
        StatusCode(status),
        headers,
        Cursor::new(body),
        Some(length),
        None,
    )
}

pub(crate) fn build_json_response(
    status: u16,
    label: &str,
    body: &Value,
    policy: JsonResponsePolicy<'_>,
) -> Vec<u8> {
    let bytes = if status == 204 {
        Vec::new()
    } else {
        serde_json::to_vec(body).unwrap_or_else(|_| b"{\"error\":\"serialization\"}".to_vec())
    };
    build_raw_json_response(status, label, &bytes, policy)
}

pub(crate) fn build_raw_json_response(
    status: u16,
    label: &str,
    bytes: &[u8],
    policy: JsonResponsePolicy<'_>,
) -> Vec<u8> {
    let mut headers = vec![
        format!("HTTP/1.1 {status} {label}"),
        "Content-Type: application/json; charset=utf-8".to_string(),
        format!("Content-Length: {}", bytes.len()),
        "Connection: close".to_string(),
        "Cache-Control: no-store, max-age=0".to_string(),
        "Pragma: no-cache".to_string(),
        "X-Content-Type-Options: nosniff".to_string(),
        "Content-Security-Policy: default-src 'none'; frame-ancestors 'none'".to_string(),
        "Referrer-Policy: no-referrer".to_string(),
        format!("Access-Control-Allow-Methods: {}", policy.allowed_methods),
        format!("Access-Control-Allow-Headers: {}", policy.allowed_headers),
        "Access-Control-Max-Age: 60".to_string(),
        "Vary: Origin".to_string(),
    ];
    if policy.deny_browser_origin {
        headers.push("Access-Control-Allow-Origin: null".to_string());
    } else if let Some(origin) = policy.origin.filter(|value| allowed_loopback_origin(value)) {
        headers.push(format!("Access-Control-Allow-Origin: {origin}"));
        if policy.allow_private_network {
            headers.push("Access-Control-Allow-Private-Network: true".to_string());
        }
    }
    if let Some(protocol_version) = policy.protocol_version {
        headers.push(format!("MCP-Protocol-Version: {protocol_version}"));
        headers.push("Access-Control-Expose-Headers: MCP-Protocol-Version".to_string());
    }
    if let Some(realm) = policy.bearer_realm {
        headers.push(format!("WWW-Authenticate: Bearer realm=\"{realm}\""));
    }
    headers.push(String::new());
    headers.push(String::new());
    let mut response = headers.join("\r\n").into_bytes();
    response.extend_from_slice(bytes);
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn loopback_origin_and_host_rules_reject_remote_websites() {
        assert!(allowed_loopback_host("127.0.0.1:55169"));
        assert!(allowed_loopback_host("localhost"));
        assert!(allowed_loopback_origin("http://127.0.0.1:5173"));
        assert!(allowed_loopback_origin("http://localhost:3000"));
        assert!(!allowed_loopback_host("outilsia.fr"));
        assert!(!allowed_loopback_origin("https://strategyarena.io"));
        assert!(!allowed_loopback_origin("https://outilsia.fr"));
    }

    #[test]
    fn shared_response_applies_security_headers_and_loopback_cors() {
        let response = build_json_response(
            200,
            "OK",
            &json!({"ok": true}),
            JsonResponsePolicy {
                allowed_methods: "POST, OPTIONS",
                allowed_headers: "Authorization, Content-Type",
                origin: Some("http://127.0.0.1:5173"),
                deny_browser_origin: false,
                allow_private_network: true,
                protocol_version: Some("2025-11-25"),
                bearer_realm: None,
            },
        );
        let text = String::from_utf8(response).expect("HTTP UTF-8");
        assert!(text.contains("Access-Control-Allow-Origin: http://127.0.0.1:5173"));
        assert!(text.contains("Access-Control-Allow-Private-Network: true"));
        assert!(text.contains("Content-Security-Policy: default-src 'none'"));
        assert!(!text.contains("strategyarena.io"));
    }

    #[test]
    fn shared_digest_is_canonical_and_comparison_is_constant_time_style() {
        assert_eq!(
            canonical_sha256(&json!({"b": 2, "a": 1})),
            canonical_sha256(&json!({"a": 1, "b": 2}))
        );
        assert!(constant_time_eq("same-value", "same-value"));
        assert!(!constant_time_eq("same-value", "other-value"));
        assert!(!constant_time_eq("short", "longer"));
    }
}
