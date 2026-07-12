use reqwest::{redirect::Policy, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::net::IpAddr;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const OBSERVER_REQUEST_SCHEMA: &str = "outilsia.board_observer_request.v1";
const OBSERVER_RESULT_SCHEMA: &str = "outilsia.board_observer_result.v1";
const BOARD_SNAPSHOT_SCHEMA: &str = "outilsia.board_snapshot.v1";
const OBSERVER_CONTRACT_VERSION: &str = "2026-07-12";
const PLANKA_API_PROFILE: &str = "planka-openapi-2.0.1";
const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS: u64 = 12;
const MIN_TIMEOUT_SECONDS: u64 = 3;
const MAX_TIMEOUT_SECONDS: u64 = 30;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct ObservePlankaBoardRequest {
    schema: String,
    adapter: String,
    instance_url: String,
    board_id: String,
    api_key: String,
    timeout_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct BoardObserverSummary {
    schema: String,
    contract_version: String,
    adapter: String,
    adapter_profile: String,
    read_only: bool,
    credential_persisted: bool,
    raw_payload_returned: bool,
    snapshot: Value,
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn validate_api_key(value: &str) -> Result<&str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 1024 {
        return Err("Cle API Planka invalide.".to_string());
    }
    if trimmed.contains(['\r', '\n']) {
        return Err("Cle API Planka invalide.".to_string());
    }
    Ok(trimmed)
}

fn validate_board_id(value: &str) -> Result<&str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err("Identifiant de board Planka invalide.".to_string());
    }
    Ok(trimmed)
}

fn is_loopback_host(host: &str) -> bool {
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(false)
}

fn build_board_url(instance_url: &str, board_id: &str) -> Result<(Url, String), String> {
    let board_id = validate_board_id(board_id)?;
    let mut url = Url::parse(instance_url.trim())
        .map_err(|_| "Adresse de l'instance Planka invalide.".to_string())?;
    let host = url
        .host_str()
        .ok_or_else(|| "Hote Planka manquant.".to_string())?;
    if url.scheme() != "https" && !(url.scheme() == "http" && is_loopback_host(host)) {
        return Err(
            "Planka exige HTTPS; HTTP est accepte uniquement sur la machine locale.".to_string(),
        );
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("Les credentials sont interdits dans l'URL Planka.".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("Query et fragment sont interdits dans l'URL Planka.".to_string());
    }

    let instance_path = url.path().trim_end_matches('/').to_string();
    let api_path = if instance_path.ends_with("/api") || instance_path == "api" {
        instance_path.clone()
    } else if instance_path.is_empty() {
        "/api".to_string()
    } else {
        format!("{instance_path}/api")
    };
    url.set_path(&format!("{api_path}/boards/{board_id}"));

    let mut public_instance = url.clone();
    public_instance.set_path(instance_path.strip_suffix("/api").unwrap_or(&instance_path));
    public_instance.set_query(None);
    public_instance.set_fragment(None);
    let public_instance = public_instance.as_str().trim_end_matches('/').to_string();
    Ok((url, public_instance))
}

fn fold_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut previous_space = true;
    for character in value.to_lowercase().chars() {
        let folded = match character {
            'a' | 'à' | 'â' | 'ä' => 'a',
            'c' | 'ç' => 'c',
            'e' | 'é' | 'è' | 'ê' | 'ë' => 'e',
            'i' | 'î' | 'ï' => 'i',
            'o' | 'ô' | 'ö' => 'o',
            'u' | 'ù' | 'û' | 'ü' => 'u',
            character if character.is_alphanumeric() => character,
            _ => ' ',
        };
        if folded == ' ' {
            if !previous_space {
                output.push(' ');
            }
            previous_space = true;
        } else {
            output.push(folded);
            previous_space = false;
        }
    }
    output.trim().to_string()
}

fn work_state(list_name: &str, list_type: &str) -> &'static str {
    if list_type == "archive" {
        return "archived";
    }
    let name = fold_text(list_name);
    match name.as_str() {
        "inbox" | "backlog" | "boite de reception" => "inbox",
        "ready" | "ready for agent" | "to do agent" | "todo agent" | "a faire agent" => {
            "ready_for_agent"
        }
        "in progress" | "worker" | "worker in progress" | "doing" | "en cours" => "in_progress",
        "blocked" | "bloque" => "blocked",
        "review" | "review required" | "human review" | "relecture" | "validation humaine" => {
            "review_required"
        }
        "done" | "termine" | "fini" => "done",
        "archive" | "archived" | "archives" => "archived",
        _ => "unmapped",
    }
}

fn is_acceptance_list(name: &str) -> bool {
    let name = fold_text(name);
    name.contains("accept")
        || name.contains("verification")
        || name == "definition of done"
        || name == "dod"
        || name.contains("critere")
}

fn permission_label(name: &str) -> Option<&'static str> {
    match fold_text(name).as_str() {
        "safe to execute" | "execution autorisee" => Some("safe_to_execute"),
        "needs approval" | "approval required" | "validation requise" => Some("needs_approval"),
        "human review" | "review human" | "revue humaine" => Some("human_review"),
        "destructive" | "destructif" => Some("destructive"),
        "public output" | "sortie publique" => Some("public_output"),
        "credential needed" | "credentials needed" | "acces requis" => Some("credential_needed"),
        _ => None,
    }
}

fn included_array<'a>(payload: &'a Value, name: &str) -> &'a [Value] {
    payload
        .get("included")
        .and_then(|value| value.get(name))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or(&[])
}

fn string_field<'a>(value: &'a Value, name: &str) -> &'a str {
    value.get(name).and_then(Value::as_str).unwrap_or_default()
}

fn position(value: &Value) -> f64 {
    value
        .get("position")
        .and_then(Value::as_f64)
        .unwrap_or(f64::MAX)
}

fn response_digest(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn normalize_planka_board(
    payload: &Value,
    expected_board_id: &str,
    instance_url: &str,
    digest: &str,
) -> Result<Value, String> {
    let board = payload
        .get("item")
        .and_then(Value::as_object)
        .ok_or_else(|| "Reponse Planka invalide: board absent.".to_string())?;
    let returned_board_id = board.get("id").and_then(Value::as_str).unwrap_or_default();
    if returned_board_id != expected_board_id {
        return Err("Reponse Planka invalide: identifiant de board incoherent.".to_string());
    }
    let board_name = board
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if board_name.trim().is_empty() {
        return Err("Reponse Planka invalide: nom de board absent.".to_string());
    }

    let mut label_names = HashMap::<String, String>::new();
    for label in included_array(payload, "labels") {
        let id = string_field(label, "id");
        if !id.is_empty() {
            label_names.insert(id.to_string(), string_field(label, "name").to_string());
        }
    }

    let mut labels_by_card = HashMap::<String, Vec<String>>::new();
    for relation in included_array(payload, "cardLabels") {
        let card_id = string_field(relation, "cardId");
        let label_id = string_field(relation, "labelId");
        if let Some(label_name) = label_names.get(label_id) {
            labels_by_card
                .entry(card_id.to_string())
                .or_default()
                .push(label_name.clone());
        }
    }

    let mut acceptance_list_cards = HashMap::<String, String>::new();
    for task_list in included_array(payload, "taskLists") {
        if is_acceptance_list(string_field(task_list, "name")) {
            acceptance_list_cards.insert(
                string_field(task_list, "id").to_string(),
                string_field(task_list, "cardId").to_string(),
            );
        }
    }
    let mut acceptance_counts = HashMap::<String, (usize, usize)>::new();
    for task in included_array(payload, "tasks") {
        let task_list_id = string_field(task, "taskListId");
        if let Some(card_id) = acceptance_list_cards.get(task_list_id) {
            let count = acceptance_counts.entry(card_id.clone()).or_default();
            count.0 += 1;
            if task
                .get("isCompleted")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                count.1 += 1;
            }
        }
    }

    let mut lists = included_array(payload, "lists").iter().collect::<Vec<_>>();
    lists.sort_by(|left, right| {
        position(left)
            .partial_cmp(&position(right))
            .unwrap_or(Ordering::Equal)
    });
    let mut list_metadata = HashMap::<String, (String, String)>::new();
    let mut lane_rows = Vec::with_capacity(lists.len());
    for list in lists {
        let id = string_field(list, "id");
        let name = string_field(list, "name");
        let list_type = string_field(list, "type");
        let state = work_state(name, list_type);
        list_metadata.insert(id.to_string(), (name.to_string(), state.to_string()));
        lane_rows.push(json!({
            "source_id": id,
            "name": name,
            "source_type": list_type,
            "position": list.get("position").cloned().unwrap_or(Value::Null),
            "work_state": state
        }));
    }

    let mut cards = included_array(payload, "cards").iter().collect::<Vec<_>>();
    cards.sort_by(|left, right| {
        position(left)
            .partial_cmp(&position(right))
            .unwrap_or(Ordering::Equal)
    });
    let mut card_rows = Vec::with_capacity(cards.len());
    let mut state_counts = HashMap::<String, usize>::new();
    let mut incomplete_contracts = 0_usize;
    let mut permission_labels = HashSet::<String>::new();
    for card in cards {
        let id = string_field(card, "id");
        let list_id = string_field(card, "listId");
        let (lane_name, state) = list_metadata
            .get(list_id)
            .cloned()
            .unwrap_or_else(|| (String::new(), "unmapped".to_string()));
        *state_counts.entry(state.clone()).or_default() += 1;

        let mut labels = labels_by_card.remove(id).unwrap_or_default();
        labels.sort();
        labels.dedup();
        let card_permissions = labels
            .iter()
            .filter_map(|label| permission_label(label))
            .map(str::to_string)
            .collect::<Vec<_>>();
        permission_labels.extend(card_permissions.iter().cloned());
        let approval_required = state == "review_required"
            || card_permissions.iter().any(|permission| {
                matches!(
                    permission.as_str(),
                    "needs_approval"
                        | "human_review"
                        | "destructive"
                        | "public_output"
                        | "credential_needed"
                )
            });
        let description_present = card
            .get("description")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty());
        let (acceptance_total, acceptance_completed) =
            acceptance_counts.get(id).copied().unwrap_or_default();
        let mut missing = Vec::new();
        if !description_present {
            missing.push("context");
        }
        if acceptance_total == 0 {
            missing.push("acceptance_checks");
        }
        if card_permissions.is_empty() {
            missing.push("permission_boundary");
        }
        if !missing.is_empty() {
            incomplete_contracts += 1;
        }

        card_rows.push(json!({
            "source_key": format!("planka:{id}"),
            "source_id": id,
            "lane_id": list_id,
            "lane_name": lane_name,
            "work_state": state,
            "name": string_field(card, "name"),
            "position": card.get("position").cloned().unwrap_or(Value::Null),
            "due_date": card.get("dueDate").cloned().unwrap_or(Value::Null),
            "updated_at": card.get("updatedAt").cloned().unwrap_or(Value::Null),
            "is_closed": card.get("isClosed").and_then(Value::as_bool).unwrap_or(false),
            "labels": labels,
            "contract": {
                "status": if missing.is_empty() { "complete" } else { "incomplete" },
                "missing": missing,
                "context_present": description_present,
                "acceptance_checks_total": acceptance_total,
                "acceptance_checks_completed": acceptance_completed,
                "permission_boundaries": card_permissions,
                "human_approval_required": approval_required,
                "execution_allowed": false
            }
        }));
    }

    let ordered_states = [
        "inbox",
        "ready_for_agent",
        "in_progress",
        "blocked",
        "review_required",
        "done",
        "archived",
        "unmapped",
    ];
    let state_summary = ordered_states
        .iter()
        .map(|state| {
            (
                (*state).to_string(),
                json!(state_counts.get(*state).copied().unwrap_or(0)),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    let lane_states = lane_rows
        .iter()
        .filter_map(|lane| lane.get("work_state").and_then(Value::as_str))
        .collect::<HashSet<_>>();
    let mut warnings = Vec::new();
    if lane_states.contains("unmapped") {
        warnings.push("unmapped_lanes");
    }
    if !lane_states.contains("ready_for_agent") {
        warnings.push("ready_for_agent_lane_missing");
    }
    if !lane_states.contains("review_required") {
        warnings.push("review_lane_missing");
    }
    if !lane_states.contains("done") {
        warnings.push("done_lane_missing");
    }
    if incomplete_contracts > 0 {
        warnings.push("incomplete_card_contracts");
    }
    let mut detected_permission_labels = permission_labels.into_iter().collect::<Vec<_>>();
    detected_permission_labels.sort();

    Ok(json!({
        "schema": BOARD_SNAPSHOT_SCHEMA,
        "contract_version": OBSERVER_CONTRACT_VERSION,
        "adapter": "planka",
        "read_only": true,
        "observed_at_ms": unix_ms(),
        "source": {
            "adapter": "planka",
            "instance_url": instance_url,
            "board_id": expected_board_id,
            "source_key_prefix": "planka:"
        },
        "board": {
            "name": board_name,
            "project_id": board.get("projectId").cloned().unwrap_or(Value::Null),
            "updated_at": board.get("updatedAt").cloned().unwrap_or(Value::Null)
        },
        "counts": {
            "lanes": lane_rows.len(),
            "cards": card_rows.len(),
            "incomplete_contracts": incomplete_contracts
        },
        "states": state_summary,
        "lanes": lane_rows,
        "cards": card_rows,
        "warnings": warnings,
        "evidence": {
            "source_response_sha256": digest,
            "adapter_profile": PLANKA_API_PROFILE
        },
        "privacy": {
            "raw_descriptions_returned": false,
            "comments_returned": false,
            "users_returned": false,
            "attachments_returned": false,
            "custom_fields_returned": false,
            "api_key_returned": false
        },
        "permissions": {
            "read_board": true,
            "write_board": false,
            "move_cards": false,
            "create_comments": false,
            "execute_work": false
        },
        "detected_permission_labels": detected_permission_labels
    }))
}

#[tauri::command]
pub(crate) async fn observe_planka_board(
    request: ObservePlankaBoardRequest,
) -> Result<BoardObserverSummary, String> {
    if request.schema != OBSERVER_REQUEST_SCHEMA || request.adapter != "planka" {
        return Err("Contrat Board Observer invalide.".to_string());
    }
    let api_key = validate_api_key(&request.api_key)?;
    let board_id = validate_board_id(&request.board_id)?;
    let (url, public_instance) = build_board_url(&request.instance_url, board_id)?;
    let timeout_seconds = request
        .timeout_seconds
        .unwrap_or(DEFAULT_TIMEOUT_SECONDS)
        .clamp(MIN_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_seconds))
        .redirect(Policy::none())
        .user_agent(format!(
            "OutilsIA-Local-Cockpit/{} BoardObserver/1",
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .map_err(|_| "Initialisation du Board Observer impossible.".to_string())?;
    let mut response = client
        .get(url)
        .header("X-Api-Key", api_key)
        .send()
        .await
        .map_err(|_| "Connexion au board Planka impossible.".to_string())?;
    let status = response.status();
    if status.is_redirection() {
        return Err("Redirection Planka refusee pour proteger la cle API.".to_string());
    }
    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("Acces Planka refuse: verifier la cle API et les droits du board.".to_string());
    }
    if status.as_u16() == 404 {
        return Err("Board Planka introuvable.".to_string());
    }
    if !status.is_success() {
        return Err(format!("Planka a refuse la lecture du board ({status})."));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err("Board Planka trop volumineux pour l'observation locale.".to_string());
    }
    let initial_capacity = response
        .content_length()
        .unwrap_or_default()
        .min(MAX_RESPONSE_BYTES) as usize;
    let mut bytes = Vec::with_capacity(initial_capacity);
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Reponse Planka illisible.".to_string())?
    {
        if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES as usize {
            return Err("Board Planka trop volumineux pour l'observation locale.".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    let digest = response_digest(&bytes);
    let payload = serde_json::from_slice::<Value>(&bytes)
        .map_err(|_| "Reponse Planka invalide: JSON attendu.".to_string())?;
    let snapshot = normalize_planka_board(&payload, board_id, &public_instance, &digest)?;
    Ok(BoardObserverSummary {
        schema: OBSERVER_RESULT_SCHEMA.to_string(),
        contract_version: OBSERVER_CONTRACT_VERSION.to_string(),
        adapter: "planka".to_string(),
        adapter_profile: PLANKA_API_PROFILE.to_string(),
        read_only: true,
        credential_persisted: false,
        raw_payload_returned: false,
        snapshot,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    fn fixture() -> Value {
        json!({
            "item": {
                "id": "board-1",
                "projectId": "project-1",
                "name": "OutilsIA",
                "updatedAt": "2026-07-12T10:00:00.000Z"
            },
            "included": {
                "lists": [
                    {"id": "list-ready", "name": "Ready for Agent", "type": "active", "position": 1},
                    {"id": "list-review", "name": "Human Review", "type": "active", "position": 2},
                    {"id": "list-done", "name": "Done", "type": "active", "position": 3}
                ],
                "cards": [
                    {
                        "id": "card-1", "listId": "list-ready", "position": 1,
                        "name": "Implementer le bridge", "description": "Contexte prive",
                        "dueDate": null, "updatedAt": "2026-07-12T10:00:00.000Z", "isClosed": false
                    },
                    {
                        "id": "card-2", "listId": "list-review", "position": 2,
                        "name": "Auditer", "description": null,
                        "dueDate": null, "updatedAt": null, "isClosed": false
                    }
                ],
                "labels": [
                    {"id": "label-safe", "name": "Safe to Execute"},
                    {"id": "label-review", "name": "Human Review"}
                ],
                "cardLabels": [
                    {"cardId": "card-1", "labelId": "label-safe"},
                    {"cardId": "card-2", "labelId": "label-review"}
                ],
                "taskLists": [
                    {"id": "tasks-1", "cardId": "card-1", "name": "Acceptance checks"}
                ],
                "tasks": [
                    {"id": "task-1", "taskListId": "tasks-1", "name": "Tests verts", "isCompleted": true}
                ],
                "users": [{"id": "user-1", "email": "secret@example.com"}],
                "attachments": [{"id": "attachment-1", "url": "https://secret.invalid/file"}],
                "customFieldValues": [{"id": "secret-field", "value": "do-not-return"}]
            }
        })
    }

    #[test]
    fn urls_require_https_except_loopback_and_never_embed_credentials() {
        let (url, instance) =
            build_board_url("https://planka.example.com", "board-1").expect("https URL");
        assert_eq!(
            url.as_str(),
            "https://planka.example.com/api/boards/board-1"
        );
        assert_eq!(instance, "https://planka.example.com");
        assert!(build_board_url("http://127.0.0.1:3000", "board-1").is_ok());
        assert!(build_board_url("http://planka.example.com", "board-1").is_err());
        assert!(build_board_url("https://user:pass@planka.example.com", "board-1").is_err());
        assert!(build_board_url("https://planka.example.com?token=bad", "board-1").is_err());
        assert!(build_board_url("https://planka.example.com", "../board").is_err());
        assert!(validate_api_key("bad\r\nheader").is_err());
    }

    #[test]
    fn lane_names_map_to_a_stable_work_state_machine() {
        assert_eq!(work_state("Ready for Agent", "active"), "ready_for_agent");
        assert_eq!(work_state("En cours", "active"), "in_progress");
        assert_eq!(work_state("Bloque", "active"), "blocked");
        assert_eq!(work_state("Human Review", "active"), "review_required");
        assert_eq!(work_state("Anything", "archive"), "archived");
        assert_eq!(work_state("Product ideas", "active"), "unmapped");
    }

    #[test]
    fn snapshot_filters_private_payload_and_reports_contract_readiness() {
        let summary = normalize_planka_board(
            &fixture(),
            "board-1",
            "https://planka.example.com",
            &"a".repeat(64),
        )
        .expect("normalized board");
        assert_eq!(summary["counts"]["cards"], 2);
        assert_eq!(summary["counts"]["incomplete_contracts"], 1);
        assert_eq!(summary["states"]["ready_for_agent"], 1);
        assert_eq!(summary["states"]["review_required"], 1);
        assert_eq!(summary["cards"][0]["source_key"], "planka:card-1");
        assert_eq!(summary["cards"][0]["contract"]["status"], "complete");
        assert_eq!(summary["cards"][0]["contract"]["execution_allowed"], false);
        assert_eq!(
            summary["cards"][1]["contract"]["human_approval_required"],
            true
        );

        let serialized = serde_json::to_string(&summary).expect("snapshot JSON");
        assert!(!serialized.contains("secret@example.com"));
        assert!(!serialized.contains("secret.invalid"));
        assert!(!serialized.contains("do-not-return"));
        assert!(!serialized.contains("Contexte prive"));
        assert!(serialized.contains("api_key_returned\":false"));
    }

    #[test]
    fn snapshot_rejects_a_board_identity_mismatch() {
        assert!(normalize_planka_board(
            &fixture(),
            "another-board",
            "https://planka.example.com",
            &"a".repeat(64)
        )
        .is_err());
    }

    #[test]
    fn observer_reads_one_board_without_returning_the_api_key() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).expect("mock listener");
        let address = listener.local_addr().expect("mock address");
        let body = serde_json::to_vec(&fixture()).expect("fixture body");
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("mock request");
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .expect("mock timeout");
            let mut request = Vec::new();
            let mut chunk = [0_u8; 2048];
            loop {
                let read = stream.read(&mut chunk).expect("request bytes");
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..read]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            let request = String::from_utf8_lossy(&request);
            assert!(request.starts_with("GET /api/boards/board-1 HTTP/1.1"));
            assert!(request.contains("x-api-key: board-secret-123"));
            let headers = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            stream.write_all(headers.as_bytes()).expect("mock headers");
            stream.write_all(&body).expect("mock body");
        });

        let result =
            tauri::async_runtime::block_on(observe_planka_board(ObservePlankaBoardRequest {
                schema: OBSERVER_REQUEST_SCHEMA.to_string(),
                adapter: "planka".to_string(),
                instance_url: format!("http://{address}"),
                board_id: "board-1".to_string(),
                api_key: "board-secret-123".to_string(),
                timeout_seconds: Some(3),
            }))
            .expect("observed board");
        server.join().expect("mock server");

        assert_eq!(result.schema, OBSERVER_RESULT_SCHEMA);
        assert_eq!(result.snapshot["schema"], BOARD_SNAPSHOT_SCHEMA);
        assert_eq!(result.snapshot["counts"]["cards"], 2);
        assert!(!result.credential_persisted);
        assert!(!result.raw_payload_returned);
        let serialized = serde_json::to_string(&result).expect("observer result");
        assert!(!serialized.contains("board-secret-123"));
        assert!(!serialized.contains("secret@example.com"));
    }
}
