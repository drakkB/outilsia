use crate::forgebench_garden_vault::{
    garden_hidden_suite_material, validate_garden_hidden_suite_receipt,
};
use crate::workstack_composer::canonical_sha256;
use serde::Deserialize;
use serde_json::{json, Value};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, VecDeque};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

pub(crate) const GARDEN_BENCHMARK_ID: &str = "garden-bamboo-generalization-v1";
pub(crate) const GARDEN_RESULT_SCHEMA: &str = "outilsia.forgebench_garden_evaluate_result.v1";
const REQUEST_SCHEMA: &str = "outilsia.forgebench_garden_evaluate_request.v1";
const CONTRACT_SCHEMA: &str = "outilsia.forgebench_garden_contract.v1";
const CONTRACT_VERSION: &str = "2026-07-24";
const CONTRACT_SOURCE: &str = include_str!("../../forgebench/garden-bamboo-v1/contract.json");
const EXAMPLE_SOURCE: &str =
    include_str!("../../forgebench/garden-bamboo-v1/examples/fable-joint-sentinel-v0.5.garden");
const BASELINE_SOURCE: &str = include_str!(
    "../../forgebench/garden-bamboo-v1/examples/controle-conservateur-outilsia-v1.garden"
);
const MAX_SOURCE_BYTES: usize = 16 * 1024;
const MAX_CANDIDATES: usize = 8;
const MAX_WHEN_PER_CHANNEL: usize = 10;
const MAX_PREDICATES_PER_BRANCH: usize = 8;
const MAX_STATIC_BUDGET: usize = 512;
const MAX_SEGMENTS: usize = 12_000;
const MAX_ACTIVE_TIPS: usize = 32;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct GardenCandidateInput {
    candidate_id: String,
    source: String,
    provenance: GardenCandidateProvenance,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct GardenCandidateProvenance {
    authoring_mode: String,
    blind_one_shot: bool,
    simulator_used_during_authoring: bool,
    thresholds_tuned_after_visible_runs: bool,
    api_cost_eur_micros: Option<u64>,
    generation_duration_ms: Option<u64>,
    energy_wh_milli: Option<u64>,
    cost_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct EvaluateGardenRequest {
    schema: String,
    benchmark_id: String,
    candidates: Vec<GardenCandidateInput>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Unit {
    Percent,
    Day,
    Millimeter,
    Centimeter,
    Count,
    Minute,
}

impl Unit {
    fn suffix(self) -> &'static str {
        match self {
            Self::Percent => "%",
            Self::Day => "day",
            Self::Millimeter => "mm",
            Self::Centimeter => "cm",
            Self::Count => "count",
            Self::Minute => "min",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum Sensor {
    ClockDay,
    SeasonProgressPct,
    Rain7dMm,
    SoilWaterPct,
    VitalityPct,
    ActiveTipsCount,
    SegmentCount,
    MaxSpreadCm,
    MaxDepthCm,
    NearestBarrierCm,
    BarrierContacts30dCount,
    OutsideActiveTipsCount,
    DetectedOutsideTipsCount,
    BarrierMinDepthCm,
    BarrierExposedLipCm,
    JointIntegrityPct,
    ShootsCount,
    LivingCanesCount,
    MatureCanesCount,
    DaysSinceMonitoring,
    DaysSinceCut,
    WaterLeftMm,
    LaborLeftMin,
    PatchLeftCount,
}

impl Sensor {
    fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "clock.day" => Self::ClockDay,
            "calendar.season_progress_pct" => Self::SeasonProgressPct,
            "weather.rain_7d_mm" => Self::Rain7dMm,
            "soil.water_pct" => Self::SoilWaterPct,
            "colony.vitality_pct" => Self::VitalityPct,
            "rhizome.active_tips_count" => Self::ActiveTipsCount,
            "rhizome.segment_count" => Self::SegmentCount,
            "rhizome.max_spread_cm" => Self::MaxSpreadCm,
            "rhizome.max_depth_cm" => Self::MaxDepthCm,
            "rhizome.nearest_barrier_cm" => Self::NearestBarrierCm,
            "rhizome.barrier_contacts_30d_count" => Self::BarrierContacts30dCount,
            "rhizome.outside_active_tips_count" => Self::OutsideActiveTipsCount,
            "rhizome.detected_outside_tips_count" => Self::DetectedOutsideTipsCount,
            "barrier.min_depth_cm" => Self::BarrierMinDepthCm,
            "barrier.exposed_lip_cm" => Self::BarrierExposedLipCm,
            "barrier.joint_integrity_pct" => Self::JointIntegrityPct,
            "cane.shoots_count" => Self::ShootsCount,
            "cane.living_count" => Self::LivingCanesCount,
            "cane.mature_count" => Self::MatureCanesCount,
            "history.days_since_monitoring_day" => Self::DaysSinceMonitoring,
            "history.days_since_cut_day" => Self::DaysSinceCut,
            "resource.water_left_mm" => Self::WaterLeftMm,
            "resource.labor_left_min" => Self::LaborLeftMin,
            "resource.patch_left_count" => Self::PatchLeftCount,
            _ => return None,
        })
    }

    fn contract(self) -> (Unit, i64, i64) {
        match self {
            Self::ClockDay => (Unit::Day, 0, 366),
            Self::SeasonProgressPct => (Unit::Percent, 0, 100),
            Self::Rain7dMm => (Unit::Millimeter, 0, 2_000),
            Self::SoilWaterPct | Self::VitalityPct | Self::JointIntegrityPct => {
                (Unit::Percent, 0, 100)
            }
            Self::ActiveTipsCount
            | Self::OutsideActiveTipsCount
            | Self::DetectedOutsideTipsCount
            | Self::BarrierContacts30dCount
            | Self::ShootsCount
            | Self::LivingCanesCount
            | Self::MatureCanesCount
            | Self::PatchLeftCount => (Unit::Count, 0, 1_000),
            Self::SegmentCount => (Unit::Count, 0, 100_000),
            Self::MaxSpreadCm | Self::NearestBarrierCm => (Unit::Centimeter, 0, 10_000),
            Self::MaxDepthCm | Self::BarrierMinDepthCm => (Unit::Centimeter, 0, 500),
            Self::BarrierExposedLipCm => (Unit::Centimeter, 0, 100),
            Self::DaysSinceMonitoring | Self::DaysSinceCut => (Unit::Day, 0, 366),
            Self::WaterLeftMm => (Unit::Millimeter, 0, 2_000),
            Self::LaborLeftMin => (Unit::Minute, 0, 100_000),
        }
    }
}

#[derive(Debug, Clone, Copy)]
enum Comparator {
    Less,
    LessOrEqual,
    Greater,
    GreaterOrEqual,
    Equal,
}

impl Comparator {
    fn evaluate(self, left: i64, right: i64) -> bool {
        match self {
            Self::Less => left < right,
            Self::LessOrEqual => left <= right,
            Self::Greater => left > right,
            Self::GreaterOrEqual => left >= right,
            Self::Equal => left == right,
        }
    }
}

#[derive(Debug, Clone)]
struct Predicate {
    sensor: Sensor,
    comparator: Comparator,
    threshold_milli: i64,
}

#[derive(Debug, Clone)]
struct Branch<T> {
    predicates: Vec<Predicate>,
    action: T,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MonitoringAction {
    SurfaceScan,
    BarrierProbe,
    FullPerimeter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ContainmentAction {
    Observe,
    CutDetectedTip,
    ExcavateDetectedSector,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BarrierAction {
    None,
    InspectJoints,
    RepairWorstJoint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CanopyAction {
    Keep,
    ThinOldCanes,
    HarvestMatureCanes,
}

#[derive(Debug, Clone)]
struct Channel<T> {
    branches: Vec<Branch<T>>,
    fallback: T,
}

#[derive(Debug, Clone)]
struct Program {
    display_name: String,
    source_sha256: String,
    program_sha256: String,
    static_budget_units: usize,
    monitoring: Channel<MonitoringAction>,
    containment: Channel<ContainmentAction>,
    barrier: Channel<BarrierAction>,
    canopy: Channel<CanopyAction>,
    irrigation: Channel<i64>,
}

#[derive(Debug, Clone, Copy)]
struct Decisions {
    monitoring: MonitoringAction,
    containment: ContainmentAction,
    barrier: BarrierAction,
    canopy: CanopyAction,
    irrigation_milli_mm: i64,
}

#[derive(Debug, Clone)]
struct Tip {
    id: u32,
    x_mm: i64,
    depth_mm: i64,
    heading: i64,
    active: bool,
    outside: bool,
    detected: bool,
    active_days: u32,
}

#[derive(Debug, Clone)]
struct Cane {
    id: u32,
    age_days: u32,
    height_mm: i64,
    final_height_mm: i64,
    alive: bool,
    harvested: bool,
}

#[derive(Debug, Clone)]
struct State {
    tips: Vec<Tip>,
    canes: Vec<Cane>,
    next_tip_id: u32,
    next_cane_id: u32,
    segments_total: u32,
    outside_segments: u32,
    max_spread_mm: i64,
    max_depth_mm: i64,
    joint_integrity: [i64; 2],
    barrier_contact_days: VecDeque<u16>,
    soil_water_permille: i64,
    waterlogging_permille: i64,
    vitality_permille: i64,
    minimum_vitality_permille: i64,
    water_left_mm: i64,
    labor_left_min: i64,
    patches_left: i64,
    last_monitoring_day: Option<u16>,
    last_cut_day: Option<u16>,
    days_uncontained: u32,
    rankable: bool,
    violations: BTreeSet<String>,
    resource_fallbacks: u32,
    joint_breaches: u32,
    under_breaches: u32,
    over_lip_breaches: u32,
}

impl State {
    fn new() -> Self {
        Self {
            tips: vec![
                Tip {
                    id: 1,
                    x_mm: 0,
                    depth_mm: 220,
                    heading: -1,
                    active: true,
                    outside: false,
                    detected: false,
                    active_days: 0,
                },
                Tip {
                    id: 2,
                    x_mm: 0,
                    depth_mm: 220,
                    heading: 1,
                    active: true,
                    outside: false,
                    detected: false,
                    active_days: 0,
                },
            ],
            canes: vec![
                Cane {
                    id: 1,
                    age_days: 1_460,
                    height_mm: 18_000,
                    final_height_mm: 18_000,
                    alive: true,
                    harvested: false,
                },
                Cane {
                    id: 2,
                    age_days: 900,
                    height_mm: 17_000,
                    final_height_mm: 17_000,
                    alive: true,
                    harvested: false,
                },
                Cane {
                    id: 3,
                    age_days: 420,
                    height_mm: 16_500,
                    final_height_mm: 16_500,
                    alive: true,
                    harvested: false,
                },
                Cane {
                    id: 4,
                    age_days: 180,
                    height_mm: 15_000,
                    final_height_mm: 15_000,
                    alive: true,
                    harvested: false,
                },
            ],
            next_tip_id: 3,
            next_cane_id: 5,
            segments_total: 0,
            outside_segments: 0,
            max_spread_mm: 0,
            max_depth_mm: 220,
            joint_integrity: [650, 650],
            barrier_contact_days: VecDeque::new(),
            soil_water_permille: 520,
            waterlogging_permille: 0,
            vitality_permille: 900,
            minimum_vitality_permille: 900,
            water_left_mm: 600,
            labor_left_min: 2_500,
            patches_left: 6,
            last_monitoring_day: None,
            last_cut_day: None,
            days_uncontained: 0,
            rankable: true,
            violations: BTreeSet::new(),
            resource_fallbacks: 0,
            joint_breaches: 0,
            under_breaches: 0,
            over_lip_breaches: 0,
        }
    }
}

#[derive(Debug, Clone)]
struct Phase {
    start_day: u16,
    end_day: u16,
    growth_permille: i64,
    rain_7d_mm: i64,
    evaporation_mm_day: i64,
    shoots: bool,
}

#[derive(Debug, Clone)]
struct Scenario {
    id: String,
    hidden: bool,
    rain_multiplier_permille: i64,
    evaporation_delta_mm_day: i64,
    drought_start: u16,
    drought_end: u16,
    flood_start: u16,
    flood_end: u16,
    wind_start: u16,
    wind_end: u16,
    joint_shift_day: u16,
}

impl Scenario {
    fn public() -> Self {
        Self {
            id: "public-bamboo-underground-365d-v1".to_string(),
            hidden: false,
            rain_multiplier_permille: 1_000,
            evaporation_delta_mm_day: 0,
            drought_start: 130,
            drought_end: 165,
            flood_start: 220,
            flood_end: 224,
            wind_start: 252,
            wind_end: 253,
            joint_shift_day: 254,
        }
    }

    fn hidden(seed: u64, index: usize) -> Self {
        let mut random = SplitMix64::new(seed ^ 0x8f31_14d9_7ac2_b605);
        let drought_start = random.range_u16(124, 136);
        let drought_duration = random.range_u16(28, 42);
        let flood_start = random.range_u16(214, 226);
        let flood_duration = random.range_u16(3, 7);
        let wind_start = random.range_u16(246, 258);
        Self {
            id: format!("hidden-{index}"),
            hidden: true,
            rain_multiplier_permille: random.range_i64(850, 1_150),
            evaporation_delta_mm_day: random.range_i64(-1, 1),
            drought_start,
            drought_end: (drought_start + drought_duration - 1).min(240),
            flood_start,
            flood_end: (flood_start + flood_duration - 1).min(240),
            wind_start,
            wind_end: (wind_start + 1).min(300),
            joint_shift_day: random.range_u16(248, 260),
        }
    }

    fn commitment(&self) -> Value {
        json!({
            "id": self.id,
            "hidden": self.hidden,
            "rain_multiplier_permille": self.rain_multiplier_permille,
            "evaporation_delta_mm_day": self.evaporation_delta_mm_day,
            "drought": [self.drought_start, self.drought_end],
            "flood": [self.flood_start, self.flood_end],
            "wind": [self.wind_start, self.wind_end],
            "joint_shift_day": self.joint_shift_day
        })
    }
}

#[derive(Debug, Clone)]
struct ScenarioMetrics {
    rankable: bool,
    escaped_active_tips: u32,
    days_uncontained: u32,
    containment_permille: u32,
    minimum_vitality_permille: i64,
    living_canes: u32,
    final_vitality_permille: i64,
    labor_used_min: i64,
    water_used_mm: i64,
    patches_used: i64,
    resource_fallbacks: u32,
    joint_breaches: u32,
    under_breaches: u32,
    over_lip_breaches: u32,
    violations: Vec<String>,
}

#[derive(Debug, Clone)]
struct AggregateMetrics {
    all_scenarios_rankable: bool,
    scenario_count: u32,
    escaped_active_tips_sum: u64,
    days_uncontained_sum: u64,
    containment_permille_mean: u32,
    minimum_vitality_permille_worst: i64,
    living_canes_mean_milli: u64,
    final_vitality_permille_mean: i64,
    labor_used_min_sum: i64,
    water_used_mm_sum: i64,
    patches_used_sum: i64,
    resource_fallbacks_sum: u64,
}

#[derive(Debug, Clone)]
struct CompiledCandidate {
    candidate_id: String,
    program: Program,
    provenance: GardenCandidateProvenance,
}

#[derive(Debug, Clone)]
struct CandidateEvaluation {
    candidate: CompiledCandidate,
    public_metrics: ScenarioMetrics,
    hidden_metrics: Vec<ScenarioMetrics>,
    aggregate: AggregateMetrics,
    evaluation_duration_ms: u128,
}

#[derive(Debug)]
struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> Self {
        Self { state: seed }
    }

    fn next(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut value = self.state;
        value = (value ^ (value >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        value = (value ^ (value >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        value ^ (value >> 31)
    }

    fn range_u16(&mut self, minimum: u16, maximum: u16) -> u16 {
        let width = u64::from(maximum - minimum + 1);
        minimum + (self.next() % width) as u16
    }

    fn range_i64(&mut self, minimum: i64, maximum: i64) -> i64 {
        let width = (maximum - minimum + 1) as u64;
        minimum + (self.next() % width) as i64
    }
}

fn unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn strict_identifier(value: &str) -> bool {
    (1..=64).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn sign_document(document: &mut Value) -> Result<(), String> {
    document
        .as_object_mut()
        .ok_or_else(|| "Document ForgeBench Garden invalide.".to_string())?
        .remove("integrity");
    let digest = canonical_sha256(document);
    document["integrity"] = json!({
        "algorithm": "SHA-256",
        "canonicalization": "recursive-key-sort-json-v1",
        "scope": "canonical_document_without_integrity",
        "digest": digest
    });
    Ok(())
}

fn verify_integrity(document: &Value, label: &str) -> Result<String, String> {
    let expected = document
        .pointer("/integrity/digest")
        .and_then(Value::as_str)
        .filter(|value| is_sha256(value))
        .ok_or_else(|| format!("Empreinte {label} absente ou invalide."))?;
    let mut unsigned = document.clone();
    unsigned
        .as_object_mut()
        .ok_or_else(|| format!("Document {label} invalide."))?
        .remove("integrity");
    if canonical_sha256(&unsigned) != expected {
        return Err(format!("Empreinte {label} incoherente."));
    }
    Ok(expected.to_string())
}

fn parse_contract() -> Result<Value, String> {
    let contract = serde_json::from_str::<Value>(CONTRACT_SOURCE)
        .map_err(|error| format!("Contrat ForgeBench Garden illisible: {error}"))?;
    validate_contract(&contract)?;
    Ok(contract)
}

fn expect_contract_i64(contract: &Value, pointer: &str, expected: i64) -> Result<(), String> {
    if contract.pointer(pointer).and_then(Value::as_i64) != Some(expected) {
        return Err(format!("Contrat Garden desynchronise: {pointer}."));
    }
    Ok(())
}

fn validate_contract(contract: &Value) -> Result<(), String> {
    if contract.get("schema").and_then(Value::as_str) != Some(CONTRACT_SCHEMA)
        || contract.get("id").and_then(Value::as_str) != Some(GARDEN_BENCHMARK_ID)
        || contract.get("contract_version").and_then(Value::as_str) != Some(CONTRACT_VERSION)
        || contract.get("status").and_then(Value::as_str) != Some("exploratory_candidate")
        || contract
            .pointer("/hidden_generalization/official_gardenarena_ranking")
            .and_then(Value::as_bool)
            != Some(false)
        || contract
            .pointer("/hidden_generalization/candidate_sources_frozen_before_suite_read")
            .and_then(Value::as_bool)
            != Some(true)
        || contract
            .pointer("/ranking/composite_score")
            .and_then(Value::as_bool)
            != Some(false)
        || contract
            .pointer("/ranking/winner_before_comparable_runs_and_human_review")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Contrat ForgeBench Garden non conforme.".to_string());
    }
    let sensors = contract
        .get("sensors")
        .and_then(Value::as_array)
        .ok_or_else(|| "Capteurs Garden absents.".to_string())?;
    if sensors.len() != 24 {
        return Err("Le contrat Garden doit exposer exactement 24 capteurs.".to_string());
    }
    let sensor_ids = sensors
        .iter()
        .filter_map(|sensor| sensor.get("id").and_then(Value::as_str))
        .collect::<BTreeSet<_>>();
    if sensor_ids.len() != 24
        || sensor_ids
            .iter()
            .any(|identifier| Sensor::parse(identifier).is_none())
    {
        return Err("Liste des capteurs Garden incoherente.".to_string());
    }
    for (pointer, expected) in [
        ("/public_scenario/horizon_days", 365),
        ("/public_scenario/budgets/water_total_mm", 600),
        ("/public_scenario/budgets/labor_total_min", 2_500),
        ("/public_scenario/budgets/patch_total_count", 6),
        ("/public_scenario/barrier/depth_mm", 760),
        ("/public_scenario/barrier/exposed_lip_mm", 150),
        ("/public_scenario/barrier/contact_damage_permille", 30),
        ("/public_scenario/barrier/joint_breach_below_permille", 600),
        ("/public_scenario/model/growth_mm_active_day", 45),
        ("/public_scenario/model/max_active_tips", 32),
        ("/public_scenario/model/max_segments", 12_000),
        ("/public_scenario/model/vitality_floor_permille", 350),
        ("/public_scenario/actions/full_perimeter/labor_min", 20),
        (
            "/public_scenario/actions/excavate_detected_sector/labor_min",
            90,
        ),
        (
            "/public_scenario/actions/repair_worst_joint/integrity_gain_permille",
            300,
        ),
    ] {
        expect_contract_i64(contract, pointer, expected)?;
    }
    let order = contract
        .pointer("/ranking/strategy_order")
        .and_then(Value::as_array)
        .ok_or_else(|| "Ordre de classement Garden absent.".to_string())?;
    let expected_order = [
        "all_scenarios_rankable_desc",
        "escaped_active_tips_sum_asc",
        "days_uncontained_sum_asc",
        "containment_permille_mean_desc",
        "minimum_vitality_permille_worst_desc",
        "living_canes_mean_desc",
        "final_vitality_permille_mean_desc",
        "labor_used_min_sum_asc",
        "water_used_mm_sum_asc",
    ];
    if order.len() != expected_order.len()
        || order
            .iter()
            .zip(expected_order)
            .any(|(actual, expected)| actual.as_str() != Some(expected))
    {
        return Err("Ordre lexicographique Garden modifie.".to_string());
    }
    Ok(())
}

fn parse_decimal_milli(number: &str) -> Result<i64, String> {
    if number.is_empty() || number.starts_with(['+', '-']) {
        return Err("Valeur GardenScript non signee attendue.".to_string());
    }
    let parts = number.split('.').collect::<Vec<_>>();
    if parts.len() > 2 || parts[0].is_empty() || !parts[0].bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err("Valeur GardenScript invalide.".to_string());
    }
    let whole = parts[0]
        .parse::<i64>()
        .map_err(|_| "Valeur GardenScript hors borne.".to_string())?;
    let fraction = parts.get(1).copied().unwrap_or_default();
    if fraction.len() > 3 || !fraction.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Precision GardenScript limitee a trois decimales.".to_string());
    }
    let fraction_milli = if fraction.is_empty() {
        0
    } else {
        let parsed = fraction
            .parse::<i64>()
            .map_err(|_| "Fraction GardenScript invalide.".to_string())?;
        parsed * 10_i64.pow((3 - fraction.len()) as u32)
    };
    whole
        .checked_mul(1_000)
        .and_then(|value| value.checked_add(fraction_milli))
        .ok_or_else(|| "Valeur GardenScript hors borne.".to_string())
}

fn parse_value(
    value: &str,
    expected_unit: Unit,
    minimum: i64,
    maximum: i64,
) -> Result<i64, String> {
    let suffix = expected_unit.suffix();
    let number = value
        .strip_suffix(suffix)
        .ok_or_else(|| format!("Unite {suffix} requise pour ce capteur."))?;
    let milli = parse_decimal_milli(number)?;
    if !(minimum * 1_000..=maximum * 1_000).contains(&milli) {
        return Err("Seuil GardenScript hors borne.".to_string());
    }
    Ok(milli)
}

fn parse_predicate(value: &str) -> Result<Predicate, String> {
    let parts = value.split(' ').collect::<Vec<_>>();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
        return Err("Predicat GardenScript invalide.".to_string());
    }
    let sensor = Sensor::parse(parts[0])
        .ok_or_else(|| format!("Capteur GardenScript interdit: {}.", parts[0]))?;
    let comparator = match parts[1] {
        "<" => Comparator::Less,
        "<=" => Comparator::LessOrEqual,
        ">" => Comparator::Greater,
        ">=" => Comparator::GreaterOrEqual,
        "==" => Comparator::Equal,
        _ => return Err("Operateur GardenScript interdit.".to_string()),
    };
    let (unit, minimum, maximum) = sensor.contract();
    Ok(Predicate {
        sensor,
        comparator,
        threshold_milli: parse_value(parts[2], unit, minimum, maximum)?,
    })
}

fn parse_condition(value: &str) -> Result<Vec<Predicate>, String> {
    let predicates = value
        .split(" and ")
        .map(parse_predicate)
        .collect::<Result<Vec<_>, _>>()?;
    if predicates.is_empty() || predicates.len() > MAX_PREDICATES_PER_BRANCH {
        return Err("Une branche GardenScript accepte de 1 a 8 predicats.".to_string());
    }
    Ok(predicates)
}

fn parse_branch_line<'a>(line: &'a str, prefix: &str) -> Result<(&'a str, &'a str), String> {
    let body = line
        .strip_prefix(prefix)
        .ok_or_else(|| "Indentation ou forme GardenScript invalide.".to_string())?;
    let (condition, action) = body
        .split_once(" => ")
        .ok_or_else(|| "Separateur GardenScript ` => ` absent.".to_string())?;
    if condition.is_empty() || action.is_empty() || action.contains(' ') {
        return Err("Branche GardenScript invalide.".to_string());
    }
    Ok((condition, action))
}

fn monitoring_action(value: &str) -> Result<MonitoringAction, String> {
    match value {
        "surface_scan" => Ok(MonitoringAction::SurfaceScan),
        "barrier_probe" => Ok(MonitoringAction::BarrierProbe),
        "full_perimeter" => Ok(MonitoringAction::FullPerimeter),
        _ => Err("Action monitoring interdite.".to_string()),
    }
}

fn containment_action(value: &str) -> Result<ContainmentAction, String> {
    match value {
        "observe" => Ok(ContainmentAction::Observe),
        "cut_detected_tip" => Ok(ContainmentAction::CutDetectedTip),
        "excavate_detected_sector" => Ok(ContainmentAction::ExcavateDetectedSector),
        _ => Err("Action containment interdite.".to_string()),
    }
}

fn barrier_action(value: &str) -> Result<BarrierAction, String> {
    match value {
        "none" => Ok(BarrierAction::None),
        "inspect_joints" => Ok(BarrierAction::InspectJoints),
        "repair_worst_joint" => Ok(BarrierAction::RepairWorstJoint),
        _ => Err("Action barrier interdite.".to_string()),
    }
}

fn canopy_action(value: &str) -> Result<CanopyAction, String> {
    match value {
        "keep" => Ok(CanopyAction::Keep),
        "thin_old_canes" => Ok(CanopyAction::ThinOldCanes),
        "harvest_mature_canes" => Ok(CanopyAction::HarvestMatureCanes),
        _ => Err("Action canopy interdite.".to_string()),
    }
}

trait ParseChannelAction: Sized + Clone {
    fn parse_action(value: &str) -> Result<Self, String>;
}

impl ParseChannelAction for MonitoringAction {
    fn parse_action(value: &str) -> Result<Self, String> {
        monitoring_action(value)
    }
}

impl ParseChannelAction for ContainmentAction {
    fn parse_action(value: &str) -> Result<Self, String> {
        containment_action(value)
    }
}

impl ParseChannelAction for BarrierAction {
    fn parse_action(value: &str) -> Result<Self, String> {
        barrier_action(value)
    }
}

impl ParseChannelAction for CanopyAction {
    fn parse_action(value: &str) -> Result<Self, String> {
        canopy_action(value)
    }
}

impl ParseChannelAction for i64 {
    fn parse_action(value: &str) -> Result<Self, String> {
        parse_value(value, Unit::Millimeter, 0, 20)
    }
}

fn parse_channel<T: ParseChannelAction>(
    lines: &[&str],
    cursor: &mut usize,
    expected_channel: &str,
) -> Result<(Channel<T>, usize), String> {
    let header = format!("decide {expected_channel}:");
    if lines.get(*cursor).copied() != Some(header.as_str()) {
        return Err(format!("Bloc {expected_channel} absent ou mal ordonne."));
    }
    *cursor += 1;
    let mut branches = Vec::new();
    let mut predicate_count = 0;
    while let Some(line) = lines.get(*cursor) {
        if line.starts_with("decide ") {
            return Err(format!("Bloc {expected_channel} sans otherwise."));
        }
        if let Some(action) = line.strip_prefix("  otherwise => ") {
            if action.is_empty() || action.contains(' ') {
                return Err(format!("Repli {expected_channel} invalide."));
            }
            let fallback = T::parse_action(action)?;
            *cursor += 1;
            if branches.is_empty() || branches.len() > MAX_WHEN_PER_CHANNEL {
                return Err(format!(
                    "Bloc {expected_channel}: entre 1 et 10 branches when requises."
                ));
            }
            return Ok((Channel { branches, fallback }, predicate_count));
        }
        let (condition, action) = parse_branch_line(line, "  when ")?;
        let predicates = parse_condition(condition)?;
        predicate_count += predicates.len();
        branches.push(Branch {
            predicates,
            action: T::parse_action(action)?,
        });
        if branches.len() > MAX_WHEN_PER_CHANNEL {
            return Err(format!("Bloc {expected_channel} trop long."));
        }
        *cursor += 1;
    }
    Err(format!("Bloc {expected_channel} incomplet."))
}

fn compile_program(source: &str) -> Result<Program, String> {
    if source.is_empty() || source.len() > MAX_SOURCE_BYTES {
        return Err("Source GardenScript vide ou superieure a 16 Kio.".to_string());
    }
    if source.contains('\r')
        || source.contains('\0')
        || !source.is_ascii()
        || source.lines().any(|line| line.is_empty())
        || source.contains('#')
        || source.contains("//")
    {
        return Err(
            "GardenScript exige ASCII, LF, sans ligne vide, commentaire ou octet nul.".to_string(),
        );
    }
    let lines = source.lines().collect::<Vec<_>>();
    if lines.len() < 18 {
        return Err("Programme GardenScript incomplet.".to_string());
    }
    let first = lines[0];
    let display_name = first
        .strip_prefix("garden \"")
        .and_then(|value| value.strip_suffix("\" version 0.5"))
        .filter(|value| {
            (1..=64).contains(&value.len())
                && !value.contains('"')
                && value.bytes().all(|byte| (0x20..=0x7e).contains(&byte))
        })
        .ok_or_else(|| "En-tete garden 0.5 invalide.".to_string())?
        .to_string();
    if lines.get(1).copied() != Some("domain bamboo")
        || lines.get(2).copied() != Some("ruleset: bamboo.v1")
    {
        return Err("Contrat domain bamboo / bamboo.v1 absent.".to_string());
    }
    let mut cursor = 3;
    let (monitoring, monitoring_predicates) =
        parse_channel::<MonitoringAction>(&lines, &mut cursor, "monitoring")?;
    let (containment, containment_predicates) =
        parse_channel::<ContainmentAction>(&lines, &mut cursor, "containment")?;
    let (barrier, barrier_predicates) =
        parse_channel::<BarrierAction>(&lines, &mut cursor, "barrier")?;
    let (canopy, canopy_predicates) = parse_channel::<CanopyAction>(&lines, &mut cursor, "canopy")?;
    let (irrigation, irrigation_predicates) =
        parse_channel::<i64>(&lines, &mut cursor, "irrigation")?;
    if cursor != lines.len() {
        return Err("Contenu GardenScript supplementaire interdit.".to_string());
    }
    let when_count = monitoring.branches.len()
        + containment.branches.len()
        + barrier.branches.len()
        + canopy.branches.len()
        + irrigation.branches.len();
    let predicate_count = monitoring_predicates
        + containment_predicates
        + barrier_predicates
        + canopy_predicates
        + irrigation_predicates;
    let static_budget_units = when_count + predicate_count + 5;
    if static_budget_units > MAX_STATIC_BUDGET {
        return Err("Budget statique GardenScript superieur a 512.".to_string());
    }
    let source_sha256 = canonical_sha256(&Value::String(source.to_string()));
    let canonical_ir = json!({
        "name": display_name,
        "version": "0.5",
        "domain": "bamboo",
        "ruleset": "bamboo.v1",
        "source_sha256": source_sha256,
        "static_budget_units": static_budget_units,
        "channel_branch_counts": [
            monitoring.branches.len(),
            containment.branches.len(),
            barrier.branches.len(),
            canopy.branches.len(),
            irrigation.branches.len()
        ],
        "predicate_count": predicate_count
    });
    let program_sha256 = canonical_sha256(&canonical_ir);
    Ok(Program {
        display_name,
        source_sha256,
        program_sha256,
        static_budget_units,
        monitoring,
        containment,
        barrier,
        canopy,
        irrigation,
    })
}

fn select_action<T: Copy>(channel: &Channel<T>, sensors: &BTreeMap<Sensor, i64>) -> T {
    channel
        .branches
        .iter()
        .find(|branch| {
            branch.predicates.iter().all(|predicate| {
                let value = sensors.get(&predicate.sensor).copied().unwrap_or_default();
                predicate
                    .comparator
                    .evaluate(value, predicate.threshold_milli)
            })
        })
        .map_or(channel.fallback, |branch| branch.action)
}

fn phase_for_day(day: u16) -> Phase {
    match day {
        1..=60 => Phase {
            start_day: 1,
            end_day: 60,
            growth_permille: 0,
            rain_7d_mm: 35,
            evaporation_mm_day: 1,
            shoots: false,
        },
        61..=120 => Phase {
            start_day: 61,
            end_day: 120,
            growth_permille: 250,
            rain_7d_mm: 28,
            evaporation_mm_day: 2,
            shoots: true,
        },
        121..=240 => Phase {
            start_day: 121,
            end_day: 240,
            growth_permille: 1_000,
            rain_7d_mm: 18,
            evaporation_mm_day: 3,
            shoots: false,
        },
        241..=300 => Phase {
            start_day: 241,
            end_day: 300,
            growth_permille: 450,
            rain_7d_mm: 24,
            evaporation_mm_day: 2,
            shoots: false,
        },
        _ => Phase {
            start_day: 301,
            end_day: 365,
            growth_permille: 100,
            rain_7d_mm: 30,
            evaporation_mm_day: 1,
            shoots: false,
        },
    }
}

fn day_forcing(scenario: &Scenario, day: u16, phase: &Phase) -> (i64, i64, i64, bool) {
    let mut rain = (phase.rain_7d_mm / 7) * scenario.rain_multiplier_permille / 1_000;
    let mut evaporation = (phase.evaporation_mm_day + scenario.evaporation_delta_mm_day).max(0);
    let mut drainage_multiplier = 1_000;
    if (scenario.drought_start..=scenario.drought_end).contains(&day) {
        rain = rain * 100 / 1_000;
        evaporation += 3;
    }
    if (scenario.flood_start..=scenario.flood_end).contains(&day) {
        rain += 35;
        drainage_multiplier = 250;
    }
    (
        rain.max(0),
        evaporation,
        drainage_multiplier,
        (scenario.wind_start..=scenario.wind_end).contains(&day),
    )
}

fn sensor_snapshot(
    state: &State,
    day: u16,
    phase: &Phase,
    rain_7d_mm: i64,
) -> BTreeMap<Sensor, i64> {
    let active_tips = state.tips.iter().filter(|tip| tip.active).count() as i64;
    let outside_tips = state
        .tips
        .iter()
        .filter(|tip| tip.active && tip.outside)
        .count() as i64;
    let detected_tips = state
        .tips
        .iter()
        .filter(|tip| tip.active && tip.detected)
        .count() as i64;
    let living_canes = state.canes.iter().filter(|cane| cane.alive).count() as i64;
    let mature_canes = state
        .canes
        .iter()
        .filter(|cane| cane.alive && cane.age_days >= 1_095)
        .count() as i64;
    let season_days = i64::from(phase.end_day - phase.start_day).max(1);
    let season_progress = i64::from(day - phase.start_day) * 100_000 / season_days;
    let nearest_barrier_mm = state
        .tips
        .iter()
        .filter(|tip| tip.active)
        .map(|tip| (1_500 - tip.x_mm.abs()).abs())
        .min()
        .unwrap_or(1_500);
    let mut sensors = BTreeMap::new();
    sensors.insert(Sensor::ClockDay, i64::from(day) * 1_000);
    sensors.insert(Sensor::SeasonProgressPct, season_progress);
    sensors.insert(Sensor::Rain7dMm, rain_7d_mm * 1_000);
    sensors.insert(Sensor::SoilWaterPct, state.soil_water_permille * 100);
    sensors.insert(Sensor::VitalityPct, state.vitality_permille * 100);
    sensors.insert(Sensor::ActiveTipsCount, active_tips * 1_000);
    sensors.insert(
        Sensor::SegmentCount,
        i64::from(state.segments_total) * 1_000,
    );
    sensors.insert(Sensor::MaxSpreadCm, state.max_spread_mm / 10 * 1_000);
    sensors.insert(Sensor::MaxDepthCm, state.max_depth_mm / 10 * 1_000);
    sensors.insert(Sensor::NearestBarrierCm, nearest_barrier_mm / 10 * 1_000);
    sensors.insert(
        Sensor::BarrierContacts30dCount,
        state.barrier_contact_days.len() as i64 * 1_000,
    );
    sensors.insert(Sensor::OutsideActiveTipsCount, outside_tips * 1_000);
    sensors.insert(Sensor::DetectedOutsideTipsCount, detected_tips * 1_000);
    sensors.insert(Sensor::BarrierMinDepthCm, 76_000);
    sensors.insert(Sensor::BarrierExposedLipCm, 15_000);
    sensors.insert(
        Sensor::JointIntegrityPct,
        state.joint_integrity.into_iter().min().unwrap_or_default() * 100,
    );
    sensors.insert(Sensor::ShootsCount, 0);
    sensors.insert(Sensor::LivingCanesCount, living_canes * 1_000);
    sensors.insert(Sensor::MatureCanesCount, mature_canes * 1_000);
    sensors.insert(
        Sensor::DaysSinceMonitoring,
        i64::from(
            state
                .last_monitoring_day
                .map_or(day, |last| day.saturating_sub(last)),
        ) * 1_000,
    );
    sensors.insert(
        Sensor::DaysSinceCut,
        i64::from(
            state
                .last_cut_day
                .map_or(day, |last| day.saturating_sub(last)),
        ) * 1_000,
    );
    sensors.insert(Sensor::WaterLeftMm, state.water_left_mm * 1_000);
    sensors.insert(Sensor::LaborLeftMin, state.labor_left_min * 1_000);
    sensors.insert(Sensor::PatchLeftCount, state.patches_left * 1_000);
    sensors
}

fn decisions_for(program: &Program, sensors: &BTreeMap<Sensor, i64>) -> Decisions {
    Decisions {
        monitoring: select_action(&program.monitoring, sensors),
        containment: select_action(&program.containment, sensors),
        barrier: select_action(&program.barrier, sensors),
        canopy: select_action(&program.canopy, sensors),
        irrigation_milli_mm: select_action(&program.irrigation, sensors),
    }
}

fn spend_labor(state: &mut State, amount: i64) -> bool {
    if state.labor_left_min < amount {
        state.resource_fallbacks += 1;
        false
    } else {
        state.labor_left_min -= amount;
        true
    }
}

fn apply_monitoring(state: &mut State, day: u16, action: MonitoringAction) {
    let labor = match action {
        MonitoringAction::SurfaceScan => 1,
        MonitoringAction::BarrierProbe => 8,
        MonitoringAction::FullPerimeter => 20,
    };
    if !spend_labor(state, labor) {
        return;
    }
    for tip in state.tips.iter_mut().filter(|tip| tip.active) {
        tip.detected = match action {
            MonitoringAction::SurfaceScan => tip.outside && tip.depth_mm <= 100,
            MonitoringAction::BarrierProbe => {
                tip.outside || ((1_500 - tip.x_mm.abs()).abs() <= 250 && tip.depth_mm <= 450)
            }
            MonitoringAction::FullPerimeter => tip.outside,
        };
    }
    state.last_monitoring_day = Some(day);
}

fn apply_containment(state: &mut State, day: u16, action: ContainmentAction) {
    match action {
        ContainmentAction::Observe => {}
        ContainmentAction::CutDetectedTip => {
            let target = state
                .tips
                .iter()
                .enumerate()
                .filter(|(_, tip)| tip.active && tip.detected)
                .min_by_key(|(_, tip)| (!tip.outside, tip.id))
                .map(|(index, _)| index);
            let Some(index) = target else {
                state.resource_fallbacks += 1;
                return;
            };
            if !spend_labor(state, 25) {
                return;
            }
            state.tips[index].active = false;
            state.tips[index].detected = false;
            state.vitality_permille = (state.vitality_permille - 8).max(0);
            state.last_cut_day = Some(day);
        }
        ContainmentAction::ExcavateDetectedSector => {
            let targets = state
                .tips
                .iter()
                .enumerate()
                .filter(|(_, tip)| tip.active && tip.detected)
                .map(|(index, _)| index)
                .collect::<Vec<_>>();
            if targets.is_empty() {
                state.resource_fallbacks += 1;
                return;
            }
            if !spend_labor(state, 90) {
                return;
            }
            let outside_targets = targets
                .iter()
                .filter(|index| state.tips[**index].outside)
                .count() as u32;
            for index in targets {
                state.tips[index].active = false;
                state.tips[index].detected = false;
            }
            state.outside_segments = state.outside_segments.saturating_sub(outside_targets);
            state.vitality_permille = (state.vitality_permille - 25).max(0);
            state.last_cut_day = Some(day);
        }
    }
}

fn apply_barrier(state: &mut State, action: BarrierAction) {
    match action {
        BarrierAction::None => {}
        BarrierAction::InspectJoints => {
            let _ = spend_labor(state, 18);
        }
        BarrierAction::RepairWorstJoint => {
            if state.patches_left <= 0 || state.labor_left_min < 55 {
                state.resource_fallbacks += 1;
                return;
            }
            state.labor_left_min -= 55;
            state.patches_left -= 1;
            let index = usize::from(state.joint_integrity[1] < state.joint_integrity[0]);
            state.joint_integrity[index] = (state.joint_integrity[index] + 300).min(1_000);
        }
    }
}

fn apply_canopy(state: &mut State, action: CanopyAction) {
    match action {
        CanopyAction::Keep => {}
        CanopyAction::ThinOldCanes => {
            if !spend_labor(state, 35) {
                return;
            }
            let mut candidates = state
                .canes
                .iter()
                .enumerate()
                .filter(|(_, cane)| cane.alive)
                .map(|(index, cane)| (index, cane.age_days))
                .collect::<Vec<_>>();
            candidates.sort_by_key(|(_, age)| std::cmp::Reverse(*age));
            for (index, _) in candidates.into_iter().take(2) {
                state.canes[index].alive = false;
            }
        }
        CanopyAction::HarvestMatureCanes => {
            if !spend_labor(state, 45) {
                return;
            }
            let targets = state
                .canes
                .iter()
                .enumerate()
                .filter(|(_, cane)| cane.alive && cane.age_days >= 1_095)
                .map(|(index, _)| index)
                .take(3)
                .collect::<Vec<_>>();
            for index in targets {
                state.canes[index].alive = false;
                state.canes[index].harvested = true;
            }
        }
    }
}

fn apply_irrigation(state: &mut State, requested_milli_mm: i64) -> i64 {
    let requested_mm = requested_milli_mm / 1_000;
    if requested_mm <= 0 {
        return 0;
    }
    if state.water_left_mm < requested_mm || state.labor_left_min < 2 {
        state.resource_fallbacks += 1;
        return 0;
    }
    state.water_left_mm -= requested_mm;
    state.labor_left_min -= 2;
    requested_mm
}

fn advance_water_and_vitality(
    state: &mut State,
    rain_mm: i64,
    evaporation_mm: i64,
    drainage_multiplier: i64,
    irrigation_mm: i64,
) {
    let gained_permille = (rain_mm + irrigation_mm) * 800 / 100;
    let lost_permille = evaporation_mm * 10;
    let unconstrained = state.soil_water_permille + gained_permille - lost_permille;
    let overflow = (unconstrained - 1_000).max(0);
    state.soil_water_permille = unconstrained.clamp(0, 1_000);
    let drainage = 30 * drainage_multiplier / 1_000;
    state.waterlogging_permille =
        (state.waterlogging_permille + overflow - drainage).clamp(0, 1_000);
    if state.soil_water_permille < 300 {
        state.vitality_permille = (state.vitality_permille - 4).max(0);
    } else if state.soil_water_permille >= 550 {
        state.vitality_permille = (state.vitality_permille + 1).min(1_000);
    }
    let living = state.canes.iter().filter(|cane| cane.alive).count();
    if living > 28 {
        state.vitality_permille = (state.vitality_permille - 1).max(0);
    }
}

fn advance_canes(state: &mut State, wind_active: bool) {
    for cane in state.canes.iter_mut().filter(|cane| cane.alive) {
        cane.age_days += 1;
        if cane.age_days <= 50 {
            cane.height_mm =
                (cane.final_height_mm * i64::from(cane.age_days) / 50).min(cane.final_height_mm);
        }
    }
    if wind_active {
        let mut eligible = state
            .canes
            .iter()
            .enumerate()
            .filter(|(_, cane)| cane.alive && cane.height_mm >= 5_000)
            .map(|(index, cane)| (index, cane.height_mm, cane.age_days, cane.id))
            .collect::<Vec<_>>();
        eligible.sort_by_key(|(_, height, age, id)| {
            (std::cmp::Reverse(*height), std::cmp::Reverse(*age), *id)
        });
        let damaged = (eligible.len() * 150)
            .div_ceil(1_000)
            .max(usize::from(!eligible.is_empty()));
        for (index, _, _, _) in eligible.into_iter().take(damaged) {
            state.canes[index].alive = false;
            state.vitality_permille = (state.vitality_permille - 6).max(0);
        }
    }
}

fn grow_rhizomes(state: &mut State, day: u16, phase: &Phase) {
    if phase.growth_permille == 0 || state.vitality_permille == 0 {
        return;
    }
    let growth_mm =
        45 * phase.growth_permille * state.vitality_permille * state.soil_water_permille.max(100)
            / 1_000
            / 1_000
            / 1_000;
    if growth_mm <= 0 {
        return;
    }
    let active_indices = state
        .tips
        .iter()
        .enumerate()
        .filter(|(_, tip)| tip.active)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    let mut new_tips = Vec::new();
    for index in active_indices {
        if state.segments_total as usize >= MAX_SEGMENTS {
            state.rankable = false;
            state
                .violations
                .insert("model_capacity_reached".to_string());
            break;
        }
        let prior = state.tips[index].clone();
        let horizontal_mm = growth_mm * 970 / 1_000;
        let mut depth_delta = growth_mm * 80 / 1_000;
        if prior.depth_mm > 300 {
            depth_delta = -depth_delta.abs();
        } else if prior.depth_mm < 120 || (usize::from(day) + index).is_multiple_of(2) {
            depth_delta = depth_delta.abs();
        } else {
            depth_delta = -depth_delta.abs();
        }
        let mut next_x = prior.x_mm + horizontal_mm * prior.heading;
        let mut next_depth = (prior.depth_mm + depth_delta).max(-150);
        let crossing_barrier = !prior.outside && prior.x_mm.abs() < 1_500 && next_x.abs() >= 1_500;
        let mut outside = prior.outside;
        if crossing_barrier {
            if next_depth > 760 {
                outside = true;
                state.under_breaches += 1;
            } else if next_depth < -150 {
                outside = true;
                state.over_lip_breaches += 1;
            } else {
                let side = usize::from(next_x > 0);
                let near_joint = (next_depth - 300).abs() <= 100;
                if near_joint {
                    state.joint_integrity[side] = (state.joint_integrity[side] - 30).max(0);
                    state.barrier_contact_days.push_back(day);
                }
                if near_joint && state.joint_integrity[side] < 600 {
                    outside = true;
                    state.joint_breaches += 1;
                } else {
                    next_x = prior.heading * 1_495;
                    next_depth = (next_depth - 45).max(-150);
                }
            }
        }
        state.segments_total += 1;
        if outside {
            state.outside_segments += 1;
        }
        state.max_spread_mm = state.max_spread_mm.max(next_x.abs());
        state.max_depth_mm = state.max_depth_mm.max(next_depth);
        let active_tip_count = state.tips.iter().filter(|tip| tip.active).count();
        let (tip_x_mm, tip_depth_mm, tip_heading, tip_outside, tip_active_days) = {
            let tip = &mut state.tips[index];
            tip.x_mm = next_x;
            tip.depth_mm = next_depth;
            tip.outside = outside;
            tip.active_days += 1;
            (
                tip.x_mm,
                tip.depth_mm,
                tip.heading,
                tip.outside,
                tip.active_days,
            )
        };
        if tip_x_mm.abs() > 5_000 {
            state.rankable = false;
            state.violations.insert("exclusion_zone_breach".to_string());
        }
        if tip_active_days.is_multiple_of(30) && active_tip_count + new_tips.len() < MAX_ACTIVE_TIPS
        {
            new_tips.push(Tip {
                id: state.next_tip_id,
                x_mm: tip_x_mm,
                depth_mm: tip_depth_mm,
                heading: -tip_heading,
                active: true,
                outside: tip_outside,
                detected: false,
                active_days: 0,
            });
            state.next_tip_id += 1;
        }
        if phase.shoots && tip_active_days.is_multiple_of(24) {
            state.canes.push(Cane {
                id: state.next_cane_id,
                age_days: 0,
                height_mm: 0,
                final_height_mm: 20_000,
                alive: true,
                harvested: false,
            });
            state.next_cane_id += 1;
        }
    }
    state.tips.extend(new_tips);
}

fn simulate(program: &Program, scenario: &Scenario) -> ScenarioMetrics {
    let mut state = State::new();
    let mut rainfall_history = VecDeque::<i64>::new();
    for day in 1_u16..=365 {
        while state
            .barrier_contact_days
            .front()
            .is_some_and(|contact_day| day.saturating_sub(*contact_day) > 30)
        {
            state.barrier_contact_days.pop_front();
        }
        let phase = phase_for_day(day);
        let (rain_mm, evaporation_mm, drainage_multiplier, wind_active) =
            day_forcing(scenario, day, &phase);
        rainfall_history.push_back(rain_mm);
        if rainfall_history.len() > 7 {
            rainfall_history.pop_front();
        }
        let rain_7d_mm = rainfall_history.iter().sum();
        let sensors = sensor_snapshot(&state, day, &phase, rain_7d_mm);
        let decisions = decisions_for(program, &sensors);
        apply_monitoring(&mut state, day, decisions.monitoring);
        apply_containment(&mut state, day, decisions.containment);
        apply_barrier(&mut state, decisions.barrier);
        apply_canopy(&mut state, decisions.canopy);
        let irrigation_mm = apply_irrigation(&mut state, decisions.irrigation_milli_mm);
        advance_water_and_vitality(
            &mut state,
            rain_mm,
            evaporation_mm,
            drainage_multiplier,
            irrigation_mm,
        );
        advance_canes(&mut state, wind_active);
        if (scenario.flood_start..=scenario.flood_end).contains(&day)
            && state.waterlogging_permille >= 600
        {
            state.vitality_permille = (state.vitality_permille - 8).max(0);
        }
        if day == scenario.joint_shift_day {
            state.joint_integrity[1] = (state.joint_integrity[1] - 220).max(0);
        }
        grow_rhizomes(&mut state, day, &phase);
        if state.tips.iter().any(|tip| tip.active && tip.outside) {
            state.days_uncontained += 1;
        }
        state.minimum_vitality_permille =
            state.minimum_vitality_permille.min(state.vitality_permille);
        if state.vitality_permille < 350 {
            state.rankable = false;
            state.violations.insert("vitality_floor_breach".to_string());
        }
    }
    let escaped_active_tips = state
        .tips
        .iter()
        .filter(|tip| tip.active && tip.outside)
        .count() as u32;
    let containment_permille = state
        .segments_total
        .saturating_sub(state.outside_segments)
        .saturating_mul(1_000)
        .checked_div(state.segments_total)
        .unwrap_or(1_000);
    ScenarioMetrics {
        rankable: state.rankable,
        escaped_active_tips,
        days_uncontained: state.days_uncontained,
        containment_permille,
        minimum_vitality_permille: state.minimum_vitality_permille,
        living_canes: state.canes.iter().filter(|cane| cane.alive).count() as u32,
        final_vitality_permille: state.vitality_permille,
        labor_used_min: 2_500 - state.labor_left_min,
        water_used_mm: 600 - state.water_left_mm,
        patches_used: 6 - state.patches_left,
        resource_fallbacks: state.resource_fallbacks,
        joint_breaches: state.joint_breaches,
        under_breaches: state.under_breaches,
        over_lip_breaches: state.over_lip_breaches,
        violations: state.violations.into_iter().collect(),
    }
}

fn aggregate(metrics: &[ScenarioMetrics]) -> AggregateMetrics {
    let count = metrics.len().max(1) as u64;
    AggregateMetrics {
        all_scenarios_rankable: metrics.iter().all(|item| item.rankable),
        scenario_count: metrics.len() as u32,
        escaped_active_tips_sum: metrics
            .iter()
            .map(|item| u64::from(item.escaped_active_tips))
            .sum(),
        days_uncontained_sum: metrics
            .iter()
            .map(|item| u64::from(item.days_uncontained))
            .sum(),
        containment_permille_mean: (metrics
            .iter()
            .map(|item| u64::from(item.containment_permille))
            .sum::<u64>()
            / count) as u32,
        minimum_vitality_permille_worst: metrics
            .iter()
            .map(|item| item.minimum_vitality_permille)
            .min()
            .unwrap_or_default(),
        living_canes_mean_milli: metrics
            .iter()
            .map(|item| u64::from(item.living_canes) * 1_000)
            .sum::<u64>()
            / count,
        final_vitality_permille_mean: metrics
            .iter()
            .map(|item| item.final_vitality_permille)
            .sum::<i64>()
            / count as i64,
        labor_used_min_sum: metrics.iter().map(|item| item.labor_used_min).sum(),
        water_used_mm_sum: metrics.iter().map(|item| item.water_used_mm).sum(),
        patches_used_sum: metrics.iter().map(|item| item.patches_used).sum(),
        resource_fallbacks_sum: metrics
            .iter()
            .map(|item| u64::from(item.resource_fallbacks))
            .sum(),
    }
}

fn compare_aggregate(left: &AggregateMetrics, right: &AggregateMetrics) -> Ordering {
    right
        .all_scenarios_rankable
        .cmp(&left.all_scenarios_rankable)
        .then_with(|| {
            left.escaped_active_tips_sum
                .cmp(&right.escaped_active_tips_sum)
        })
        .then_with(|| left.days_uncontained_sum.cmp(&right.days_uncontained_sum))
        .then_with(|| {
            right
                .containment_permille_mean
                .cmp(&left.containment_permille_mean)
        })
        .then_with(|| {
            right
                .minimum_vitality_permille_worst
                .cmp(&left.minimum_vitality_permille_worst)
        })
        .then_with(|| {
            right
                .living_canes_mean_milli
                .cmp(&left.living_canes_mean_milli)
        })
        .then_with(|| {
            right
                .final_vitality_permille_mean
                .cmp(&left.final_vitality_permille_mean)
        })
        .then_with(|| left.labor_used_min_sum.cmp(&right.labor_used_min_sum))
        .then_with(|| left.water_used_mm_sum.cmp(&right.water_used_mm_sum))
}

fn validate_provenance(provenance: &GardenCandidateProvenance) -> Result<(), String> {
    if !matches!(
        provenance.authoring_mode.as_str(),
        "blind_one_shot" | "open_book_iterative" | "human_authored"
    ) || !matches!(
        provenance.cost_status.as_str(),
        "measured" | "not_reported" | "subscription_quota_unknown" | "local_energy_not_measured"
    ) {
        return Err("Provenance candidat Garden invalide.".to_string());
    }
    if provenance.blind_one_shot
        && (provenance.simulator_used_during_authoring
            || provenance.thresholds_tuned_after_visible_runs
            || provenance.authoring_mode != "blind_one_shot")
    {
        return Err("Claim blind_one_shot contredit par la provenance.".to_string());
    }
    if provenance.cost_status == "measured" && provenance.api_cost_eur_micros.is_none() {
        return Err("Cout mesure absent de la provenance Garden.".to_string());
    }
    Ok(())
}

fn compile_candidates(request: EvaluateGardenRequest) -> Result<Vec<CompiledCandidate>, String> {
    if request.schema != REQUEST_SCHEMA || request.benchmark_id != GARDEN_BENCHMARK_ID {
        return Err("Requete ForgeBench Garden non conforme.".to_string());
    }
    if request.candidates.is_empty() || request.candidates.len() > MAX_CANDIDATES {
        return Err("ForgeBench Garden accepte de 1 a 8 candidats.".to_string());
    }
    let mut ids = BTreeSet::new();
    let mut source_digests = BTreeSet::new();
    request
        .candidates
        .into_iter()
        .map(|candidate| {
            if !strict_identifier(&candidate.candidate_id)
                || !ids.insert(candidate.candidate_id.clone())
            {
                return Err("Identifiant candidat Garden invalide ou duplique.".to_string());
            }
            validate_provenance(&candidate.provenance)?;
            let program = compile_program(&candidate.source)?;
            if !source_digests.insert(program.source_sha256.clone()) {
                return Err("Deux candidats Garden partagent la meme source.".to_string());
            }
            Ok(CompiledCandidate {
                candidate_id: candidate.candidate_id,
                program,
                provenance: candidate.provenance,
            })
        })
        .collect()
}

fn metrics_json(metrics: &ScenarioMetrics) -> Value {
    json!({
        "rankable": metrics.rankable,
        "escaped_active_tips": metrics.escaped_active_tips,
        "days_uncontained": metrics.days_uncontained,
        "containment_permille": metrics.containment_permille,
        "minimum_vitality_permille": metrics.minimum_vitality_permille,
        "living_canes": metrics.living_canes,
        "final_vitality_permille": metrics.final_vitality_permille,
        "labor_used_min": metrics.labor_used_min,
        "water_used_mm": metrics.water_used_mm,
        "patches_used": metrics.patches_used,
        "resource_fallbacks": metrics.resource_fallbacks,
        "joint_breaches": metrics.joint_breaches,
        "under_barrier_breaches": metrics.under_breaches,
        "over_lip_breaches": metrics.over_lip_breaches,
        "violations": metrics.violations
    })
}

fn aggregate_json(metrics: &AggregateMetrics) -> Value {
    json!({
        "all_scenarios_rankable": metrics.all_scenarios_rankable,
        "scenario_count": metrics.scenario_count,
        "escaped_active_tips_sum": metrics.escaped_active_tips_sum,
        "days_uncontained_sum": metrics.days_uncontained_sum,
        "containment_permille_mean": metrics.containment_permille_mean,
        "minimum_vitality_permille_worst": metrics.minimum_vitality_permille_worst,
        "living_canes_mean_milli": metrics.living_canes_mean_milli,
        "final_vitality_permille_mean": metrics.final_vitality_permille_mean,
        "labor_used_min_sum": metrics.labor_used_min_sum,
        "water_used_mm_sum": metrics.water_used_mm_sum,
        "patches_used_sum": metrics.patches_used_sum,
        "resource_fallbacks_sum": metrics.resource_fallbacks_sum
    })
}

#[cfg(test)]
pub(crate) fn evaluate_with_hidden_seeds(
    request: EvaluateGardenRequest,
    suite_receipt: &Value,
    hidden_seeds: &[u64],
) -> Result<Value, String> {
    // This pure test seam preserves the production order: compile/freeze first.
    let compiled = compile_candidates(request)?;
    evaluate_compiled_with_hidden_seeds(compiled, suite_receipt, hidden_seeds)
}

fn evaluate_compiled_with_hidden_seeds(
    compiled: Vec<CompiledCandidate>,
    suite_receipt: &Value,
    hidden_seeds: &[u64],
) -> Result<Value, String> {
    let contract = parse_contract()?;
    validate_garden_hidden_suite_receipt(suite_receipt)?;
    if hidden_seeds.len() < 3 || hidden_seeds.len() > 12 {
        return Err("Suite cachee Garden: 3 a 12 scenarios requis.".to_string());
    }
    if suite_receipt
        .get("hidden_scenarios_total")
        .and_then(Value::as_u64)
        != Some(hidden_seeds.len() as u64)
    {
        return Err("Recu et materiel du coffre Garden desynchronises.".to_string());
    }
    let unique_seeds = hidden_seeds.iter().copied().collect::<BTreeSet<_>>();
    if unique_seeds.len() != hidden_seeds.len() {
        return Err("Seeds caches Garden dupliques.".to_string());
    }

    let candidate_set_manifest = compiled
        .iter()
        .map(|candidate| {
            json!({
                "candidate_id": candidate.candidate_id,
                "source_sha256": candidate.program.source_sha256,
                "program_sha256": candidate.program.program_sha256
            })
        })
        .collect::<Vec<_>>();
    let candidate_set_sha256 = canonical_sha256(&Value::Array(candidate_set_manifest.clone()));

    let hidden_scenarios = hidden_seeds
        .iter()
        .enumerate()
        .map(|(index, seed)| Scenario::hidden(*seed, index + 1))
        .collect::<Vec<_>>();
    let scenario_commitments = hidden_scenarios
        .iter()
        .map(Scenario::commitment)
        .collect::<Vec<_>>();
    let hidden_scenario_digest = canonical_sha256(&Value::Array(scenario_commitments));
    let public_scenario = Scenario::public();

    let mut evaluations = Vec::new();
    for candidate in compiled {
        let started = Instant::now();
        let public_metrics = simulate(&candidate.program, &public_scenario);
        let hidden_metrics = hidden_scenarios
            .iter()
            .map(|scenario| simulate(&candidate.program, scenario))
            .collect::<Vec<_>>();
        let mut all_metrics = vec![public_metrics.clone()];
        all_metrics.extend(hidden_metrics.iter().cloned());
        let aggregate = aggregate(&all_metrics);
        evaluations.push(CandidateEvaluation {
            candidate,
            public_metrics,
            hidden_metrics,
            aggregate,
            evaluation_duration_ms: started.elapsed().as_millis(),
        });
    }
    evaluations.sort_by(|left, right| {
        compare_aggregate(&left.aggregate, &right.aggregate).then_with(|| {
            left.candidate
                .candidate_id
                .cmp(&right.candidate.candidate_id)
        })
    });

    let candidates_json = evaluations
        .iter()
        .enumerate()
        .map(|(index, evaluation)| {
            let hidden_aggregate = aggregate(&evaluation.hidden_metrics);
            json!({
                "candidate_id": evaluation.candidate.candidate_id,
                "display_name": evaluation.candidate.program.display_name,
                "source_sha256": evaluation.candidate.program.source_sha256,
                "program_sha256": evaluation.candidate.program.program_sha256,
                "static_budget_units": evaluation.candidate.program.static_budget_units,
                "provisional_rank": index + 1,
                "provenance": {
                    "authoring_mode": evaluation.candidate.provenance.authoring_mode,
                    "blind_one_shot": evaluation.candidate.provenance.blind_one_shot,
                    "simulator_used_during_authoring": evaluation.candidate.provenance.simulator_used_during_authoring,
                    "thresholds_tuned_after_visible_runs": evaluation.candidate.provenance.thresholds_tuned_after_visible_runs,
                    "eligible_for_blind_claim": evaluation.candidate.provenance.blind_one_shot
                        && !evaluation.candidate.provenance.simulator_used_during_authoring
                        && !evaluation.candidate.provenance.thresholds_tuned_after_visible_runs,
                    "generation_duration_ms": evaluation.candidate.provenance.generation_duration_ms,
                    "api_cost_eur_micros": evaluation.candidate.provenance.api_cost_eur_micros,
                    "energy_wh_milli": evaluation.candidate.provenance.energy_wh_milli,
                    "cost_status": evaluation.candidate.provenance.cost_status
                },
                "public_scenario": metrics_json(&evaluation.public_metrics),
                "hidden_aggregate": aggregate_json(&hidden_aggregate),
                "combined_aggregate": aggregate_json(&evaluation.aggregate),
                "performance": {
                    "evaluation_duration_ms": evaluation.evaluation_duration_ms,
                    "generation_speed_changes_strategy_order": false,
                    "generation_cost_changes_strategy_order": false
                }
            })
        })
        .collect::<Vec<_>>();
    let provisional_order = evaluations
        .iter()
        .map(|evaluation| evaluation.candidate.candidate_id.clone())
        .collect::<Vec<_>>();
    let all_comparable = evaluations
        .iter()
        .all(|evaluation| evaluation.aggregate.scenario_count == hidden_seeds.len() as u32 + 1);
    let contract_digest = canonical_sha256(&contract);
    let mut result = json!({
        "schema": GARDEN_RESULT_SCHEMA,
        "contract_version": CONTRACT_VERSION,
        "benchmark": {
            "id": GARDEN_BENCHMARK_ID,
            "track": "outilsia_exploratory_generalization",
            "official_gardenarena_ranking": false,
            "contract_sha256": contract_digest
        },
        "generated_at_ms": unix_ms(),
        "execution": {
            "started": true,
            "local_only": true,
            "network_called": false,
            "external_process_started": false,
            "candidate_code_executed": false,
            "dsl_interpreted": true,
            "file_access_by_candidate": false,
            "hidden_suite_loaded_after_candidate_freeze": true,
            "same_scenarios_for_all_candidates": true
        },
        "candidate_freeze": {
            "candidate_set_sha256": candidate_set_sha256,
            "candidate_count": candidate_set_manifest.len(),
            "manifest": candidate_set_manifest
        },
        "hidden_suite": {
            "receipt": suite_receipt,
            "scenario_count": hidden_seeds.len(),
            "scenario_commitment_digest": hidden_scenario_digest,
            "seeds_returned": false,
            "scenario_parameters_returned": false,
            "per_scenario_metrics_returned": false
        },
        "comparison": {
            "comparable_runs": all_comparable,
            "method": "lexicographic_aggregate_v1",
            "composite_score": false,
            "strategy_order": contract.pointer("/ranking/strategy_order").cloned().unwrap_or(Value::Null),
            "provisional_order": provisional_order,
            "winner_declared": false,
            "winner": Value::Null,
            "winner_blockers": [
                "human_review_required",
                "manual_release_validation_required",
                "exploratory_track_not_official_gardenarena_ranking"
            ],
            "speed_and_cost_reported_separately": true
        },
        "candidates": candidates_json,
        "privacy": {
            "raw_candidate_sources_returned": false,
            "raw_candidate_sources_persisted": false,
            "hidden_seeds_returned": false,
            "hidden_scenarios_returned": false,
            "competitor_source_shared": false,
            "competitor_output_shared": false
        },
        "truth": contract.get("truth").cloned().unwrap_or(Value::Null),
        "release": {
            "binary_published": false,
            "site_deployed": false,
            "manual_validation_required": true
        }
    });
    sign_document(&mut result)?;
    validate_forgebench_garden_result(&result)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn evaluate_forgebench_garden(
    app: AppHandle,
    request: EvaluateGardenRequest,
) -> Result<Value, String> {
    // Security boundary: source parsing and candidate-set hashing happen before
    // the hidden vault is touched. Candidate programs cannot execute code.
    let compiled = compile_candidates(request)?;
    let suite = garden_hidden_suite_material(&app)?
        .ok_or_else(|| "Scelle d'abord la suite cachee ForgeBench Garden.".to_string())?;
    evaluate_compiled_with_hidden_seeds(compiled, &suite.receipt, &suite.hidden_seeds)
}

fn contains_forbidden_result_key(value: &Value) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, nested)| {
            matches!(
                key.as_str(),
                "source"
                    | "hidden_seed"
                    | "hidden_seeds"
                    | "hidden_scenario"
                    | "hidden_scenarios"
                    | "scenario_parameters"
                    | "raw_candidate_source"
                    | "raw_candidate_sources"
            ) || contains_forbidden_result_key(nested)
        }),
        Value::Array(values) => values.iter().any(contains_forbidden_result_key),
        _ => false,
    }
}

fn required_u64(value: &Value, pointer: &str, maximum: u64) -> Result<u64, String> {
    value
        .pointer(pointer)
        .and_then(Value::as_u64)
        .filter(|number| *number <= maximum)
        .ok_or_else(|| format!("Metrique Garden invalide: {pointer}."))
}

fn aggregate_from_value(
    value: &Value,
    expected_scenarios: u32,
) -> Result<AggregateMetrics, String> {
    let scenario_count = required_u64(value, "/scenario_count", 13)? as u32;
    if scenario_count != expected_scenarios {
        return Err("Nombre de scenarios Garden incoherent.".to_string());
    }
    Ok(AggregateMetrics {
        all_scenarios_rankable: value
            .get("all_scenarios_rankable")
            .and_then(Value::as_bool)
            .ok_or_else(|| "Classabilite agregee Garden absente.".to_string())?,
        scenario_count,
        escaped_active_tips_sum: required_u64(
            value,
            "/escaped_active_tips_sum",
            u64::from(expected_scenarios) * 1_000,
        )?,
        days_uncontained_sum: required_u64(
            value,
            "/days_uncontained_sum",
            u64::from(expected_scenarios) * 365,
        )?,
        containment_permille_mean: required_u64(value, "/containment_permille_mean", 1_000)? as u32,
        minimum_vitality_permille_worst: required_u64(
            value,
            "/minimum_vitality_permille_worst",
            1_000,
        )? as i64,
        living_canes_mean_milli: required_u64(value, "/living_canes_mean_milli", 1_000_000)?,
        final_vitality_permille_mean: required_u64(value, "/final_vitality_permille_mean", 1_000)?
            as i64,
        labor_used_min_sum: required_u64(
            value,
            "/labor_used_min_sum",
            u64::from(expected_scenarios) * 2_500,
        )? as i64,
        water_used_mm_sum: required_u64(
            value,
            "/water_used_mm_sum",
            u64::from(expected_scenarios) * 600,
        )? as i64,
        patches_used_sum: required_u64(
            value,
            "/patches_used_sum",
            u64::from(expected_scenarios) * 6,
        )? as i64,
        resource_fallbacks_sum: required_u64(
            value,
            "/resource_fallbacks_sum",
            u64::from(expected_scenarios) * 365 * 5,
        )?,
    })
}

pub(crate) fn validate_forgebench_garden_result(result: &Value) -> Result<(), String> {
    if result.get("schema").and_then(Value::as_str) != Some(GARDEN_RESULT_SCHEMA)
        || result.pointer("/benchmark/id").and_then(Value::as_str) != Some(GARDEN_BENCHMARK_ID)
        || result
            .pointer("/benchmark/official_gardenarena_ranking")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/execution/hidden_suite_loaded_after_candidate_freeze")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/execution/same_scenarios_for_all_candidates")
            .and_then(Value::as_bool)
            != Some(true)
        || result
            .pointer("/execution/candidate_code_executed")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/comparison/composite_score")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/comparison/winner_declared")
            .and_then(Value::as_bool)
            != Some(false)
        || !result
            .pointer("/comparison/winner")
            .is_some_and(Value::is_null)
        || result
            .pointer("/privacy/raw_candidate_sources_persisted")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/privacy/hidden_seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/release/binary_published")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/release/site_deployed")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Resultat ForgeBench Garden non conforme.".to_string());
    }
    if contains_forbidden_result_key(result) {
        return Err("Le resultat Garden contient du materiel brut interdit.".to_string());
    }
    let expected_contract_digest = canonical_sha256(&parse_contract()?);
    if result
        .pointer("/benchmark/contract_sha256")
        .and_then(Value::as_str)
        != Some(expected_contract_digest.as_str())
        || !result
            .pointer("/candidate_freeze/candidate_set_sha256")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
        || !result
            .pointer("/hidden_suite/scenario_commitment_digest")
            .and_then(Value::as_str)
            .is_some_and(is_sha256)
    {
        return Err("Empreintes du resultat Garden invalides.".to_string());
    }
    let receipt = result
        .pointer("/hidden_suite/receipt")
        .ok_or_else(|| "Recu de suite Garden absent.".to_string())?;
    validate_garden_hidden_suite_receipt(receipt)?;
    let candidates = result
        .get("candidates")
        .and_then(Value::as_array)
        .ok_or_else(|| "Candidats Garden absents.".to_string())?;
    if candidates.is_empty() || candidates.len() > MAX_CANDIDATES {
        return Err("Nombre de candidats Garden invalide.".to_string());
    }
    let scenario_count = result
        .pointer("/hidden_suite/scenario_count")
        .and_then(Value::as_u64)
        .ok_or_else(|| "Nombre de scenarios caches absent.".to_string())?;
    if !(3..=12).contains(&scenario_count)
        || receipt
            .get("hidden_scenarios_total")
            .and_then(Value::as_u64)
            != Some(scenario_count)
        || result
            .pointer("/hidden_suite/seeds_returned")
            .and_then(Value::as_bool)
            != Some(false)
        || result
            .pointer("/hidden_suite/per_scenario_metrics_returned")
            .and_then(Value::as_bool)
            != Some(false)
    {
        return Err("Confidentialite de la suite Garden invalide.".to_string());
    }
    let manifest = result
        .pointer("/candidate_freeze/manifest")
        .and_then(Value::as_array)
        .ok_or_else(|| "Manifeste de gel Garden absent.".to_string())?;
    if manifest.len() != candidates.len()
        || result
            .pointer("/candidate_freeze/candidate_count")
            .and_then(Value::as_u64)
            != Some(candidates.len() as u64)
        || canonical_sha256(&Value::Array(manifest.clone()))
            != result
                .pointer("/candidate_freeze/candidate_set_sha256")
                .and_then(Value::as_str)
                .unwrap_or_default()
    {
        return Err("Manifeste de gel Garden incoherent.".to_string());
    }
    let manifest_by_id = manifest
        .iter()
        .filter_map(|entry| {
            Some((
                entry.get("candidate_id")?.as_str()?.to_string(),
                (
                    entry.get("source_sha256")?.as_str()?.to_string(),
                    entry.get("program_sha256")?.as_str()?.to_string(),
                ),
            ))
        })
        .collect::<BTreeMap<_, _>>();
    if manifest_by_id.len() != candidates.len() {
        return Err("Manifeste de gel Garden incomplet.".to_string());
    }
    let mut ids = BTreeSet::new();
    let mut source_digests = BTreeSet::new();
    let mut ranked = Vec::with_capacity(candidates.len());
    for (index, candidate) in candidates.iter().enumerate() {
        let id = candidate
            .get("candidate_id")
            .and_then(Value::as_str)
            .filter(|value| strict_identifier(value))
            .ok_or_else(|| "Identifiant candidat Garden invalide.".to_string())?;
        let source_digest = candidate
            .get("source_sha256")
            .and_then(Value::as_str)
            .filter(|value| is_sha256(value))
            .ok_or_else(|| "Empreinte source Garden invalide.".to_string())?;
        let program_digest = candidate
            .get("program_sha256")
            .and_then(Value::as_str)
            .filter(|value| is_sha256(value))
            .ok_or_else(|| "Empreinte programme Garden invalide.".to_string())?;
        if !ids.insert(id) || !source_digests.insert(source_digest) {
            return Err("Candidat ou source Garden duplique.".to_string());
        }
        if manifest_by_id.get(id) != Some(&(source_digest.to_string(), program_digest.to_string()))
        {
            return Err("Candidat et manifeste de gel Garden desynchronises.".to_string());
        }
        if candidate.get("provisional_rank").and_then(Value::as_u64) != Some((index + 1) as u64) {
            return Err("Rang provisoire Garden incoherent.".to_string());
        }
        let provenance_mode = candidate
            .pointer("/provenance/authoring_mode")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let blind = candidate
            .pointer("/provenance/blind_one_shot")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let simulator_used = candidate
            .pointer("/provenance/simulator_used_during_authoring")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let tuned = candidate
            .pointer("/provenance/thresholds_tuned_after_visible_runs")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let eligible_blind = candidate
            .pointer("/provenance/eligible_for_blind_claim")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        if !matches!(
            provenance_mode,
            "blind_one_shot" | "open_book_iterative" | "human_authored"
        ) || eligible_blind != (blind && !simulator_used && !tuned)
        {
            return Err("Provenance Garden incoherente.".to_string());
        }
        let aggregate = aggregate_from_value(
            candidate
                .get("combined_aggregate")
                .ok_or_else(|| "Agregat Garden absent.".to_string())?,
            scenario_count as u32 + 1,
        )?;
        ranked.push((id.to_string(), aggregate));
    }
    for pair in ranked.windows(2) {
        let ordering = compare_aggregate(&pair[0].1, &pair[1].1);
        if ordering == Ordering::Greater || (ordering == Ordering::Equal && pair[0].0 > pair[1].0) {
            return Err("Ordre lexicographique Garden falsifie.".to_string());
        }
    }
    let provisional_order = result
        .pointer("/comparison/provisional_order")
        .and_then(Value::as_array)
        .ok_or_else(|| "Ordre provisoire Garden absent.".to_string())?;
    if provisional_order.len() != ranked.len()
        || provisional_order
            .iter()
            .zip(&ranked)
            .any(|(actual, expected)| actual.as_str() != Some(expected.0.as_str()))
        || result
            .pointer("/comparison/comparable_runs")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err("Comparabilite Garden invalide.".to_string());
    }
    verify_integrity(result, "du resultat Garden")?;
    Ok(())
}

fn garden_example_document(
    candidate_id: &str,
    source: &str,
    authoring_mode: &str,
    simulator_used: bool,
    thresholds_tuned: bool,
) -> Value {
    json!({
        "schema": "outilsia.forgebench_garden_example.v1",
        "benchmark_id": GARDEN_BENCHMARK_ID,
        "candidate_id": candidate_id,
        "source": source,
        "provenance": {
            "authoring_mode": authoring_mode,
            "blind_one_shot": false,
            "simulator_used_during_authoring": simulator_used,
            "thresholds_tuned_after_visible_runs": thresholds_tuned,
            "api_cost_eur_micros": Value::Null,
            "generation_duration_ms": Value::Null,
            "energy_wh_milli": Value::Null,
            "cost_status": "not_reported"
        },
        "truth": {
            "eligible_for_blind_claim": false,
            "winner_declared": false
        }
    })
}

#[tauri::command]
pub(crate) fn get_forgebench_garden_example() -> Value {
    garden_example_document(
        "fable-joint-sentinel-v0.5",
        EXAMPLE_SOURCE,
        "open_book_iterative",
        true,
        true,
    )
}

#[tauri::command]
pub(crate) fn get_forgebench_garden_baseline() -> Value {
    garden_example_document(
        "controle-conservateur-outilsia-v1",
        BASELINE_SOURCE,
        "human_authored",
        false,
        false,
    )
}

#[cfg(test)]
pub(crate) fn test_forgebench_garden_result() -> Value {
    let request = serde_json::from_value::<EvaluateGardenRequest>(json!({
        "schema": REQUEST_SCHEMA,
        "benchmark_id": GARDEN_BENCHMARK_ID,
        "candidates": [{
            "candidate_id": "fable-joint-sentinel-v0.5",
            "source": EXAMPLE_SOURCE,
            "provenance": {
                "authoring_mode": "open_book_iterative",
                "blind_one_shot": false,
                "simulator_used_during_authoring": true,
                "thresholds_tuned_after_visible_runs": true,
                "api_cost_eur_micros": Value::Null,
                "generation_duration_ms": 1250,
                "energy_wh_milli": Value::Null,
                "cost_status": "not_reported"
            }
        }]
    }))
    .expect("test Garden request");
    evaluate_with_hidden_seeds(
        request,
        &crate::forgebench_garden_vault::test_garden_hidden_suite_receipt(3),
        &[100_001, 100_002, 100_003],
    )
    .expect("test Garden result")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::forgebench_garden_vault::test_garden_hidden_suite_receipt;

    fn provenance(mode: &str) -> GardenCandidateProvenance {
        GardenCandidateProvenance {
            authoring_mode: mode.to_string(),
            blind_one_shot: mode == "blind_one_shot",
            simulator_used_during_authoring: mode == "open_book_iterative",
            thresholds_tuned_after_visible_runs: mode == "open_book_iterative",
            api_cost_eur_micros: None,
            generation_duration_ms: Some(1_250),
            energy_wh_milli: None,
            cost_status: "not_reported".to_string(),
        }
    }

    fn request(candidates: Vec<(&str, &str, &str)>) -> EvaluateGardenRequest {
        EvaluateGardenRequest {
            schema: REQUEST_SCHEMA.to_string(),
            benchmark_id: GARDEN_BENCHMARK_ID.to_string(),
            candidates: candidates
                .into_iter()
                .map(|(id, source, mode)| GardenCandidateInput {
                    candidate_id: id.to_string(),
                    source: source.to_string(),
                    provenance: provenance(mode),
                })
                .collect(),
        }
    }

    fn receipt(count: usize) -> Value {
        test_garden_hidden_suite_receipt(count)
    }

    #[test]
    fn contract_is_frozen_and_complete() {
        let contract = parse_contract().expect("contract");
        assert_eq!(contract["sensors"].as_array().map(Vec::len), Some(24));
        assert_eq!(contract["ranking"]["method"], "lexicographic_aggregate_v1");
    }

    #[test]
    fn fable_joint_sentinel_compiles() {
        let program = compile_program(EXAMPLE_SOURCE).expect("program");
        assert_eq!(program.display_name, "Fable Joint Sentinel");
        assert!(program.static_budget_units <= 512);
        assert!(is_sha256(&program.source_sha256));
        assert!(is_sha256(&program.program_sha256));
    }

    #[test]
    fn outilsia_human_control_compiles() {
        let program = compile_program(BASELINE_SOURCE).expect("program");
        assert_eq!(program.display_name, "Controle conservateur OutilsIA");
        assert!(program.static_budget_units <= 512);
        assert!(is_sha256(&program.source_sha256));
        assert!(is_sha256(&program.program_sha256));
    }

    #[test]
    fn parser_rejects_capabilities_and_unknown_sensor() {
        let with_comment =
            EXAMPLE_SOURCE.replace("domain bamboo", "domain bamboo\n# import network");
        assert!(compile_program(&with_comment).is_err());
        let unknown = EXAMPLE_SOURCE.replace("soil.water_pct < 34%", "system.secret_value < 34%");
        assert!(compile_program(&unknown).is_err());
        let wrong_unit = EXAMPLE_SOURCE.replace(
            "resource.water_left_mm >= 12mm",
            "resource.water_left_mm >= 12%",
        );
        assert!(compile_program(&wrong_unit).is_err());
    }

    #[test]
    fn simulator_is_deterministic() {
        let program = compile_program(EXAMPLE_SOURCE).expect("program");
        let scenario = Scenario::hidden(42_424_242, 1);
        let first = simulate(&program, &scenario);
        let second = simulate(&program, &scenario);
        assert_eq!(metrics_json(&first), metrics_json(&second));
    }

    #[test]
    fn candidate_order_does_not_change_metrics() {
        let seeds = [100_001, 100_002, 100_003, 100_004, 100_005];
        let first = evaluate_with_hidden_seeds(
            request(vec![
                ("fable", EXAMPLE_SOURCE, "open_book_iterative"),
                ("control", BASELINE_SOURCE, "human_authored"),
            ]),
            &receipt(5),
            &seeds,
        )
        .expect("first");
        let second = evaluate_with_hidden_seeds(
            request(vec![
                ("control", BASELINE_SOURCE, "human_authored"),
                ("fable", EXAMPLE_SOURCE, "open_book_iterative"),
            ]),
            &receipt(5),
            &seeds,
        )
        .expect("second");
        let by_id = |value: &Value| {
            value["candidates"]
                .as_array()
                .expect("candidates")
                .iter()
                .map(|candidate| {
                    (
                        candidate["candidate_id"].as_str().unwrap().to_string(),
                        candidate["combined_aggregate"].clone(),
                    )
                })
                .collect::<BTreeMap<_, _>>()
        };
        assert_eq!(by_id(&first), by_id(&second));
        assert_eq!(first["candidates"].as_array().map(Vec::len), Some(2));
        assert_eq!(first["comparison"]["winner_declared"], false);
    }

    #[test]
    fn hidden_material_and_sources_never_return() {
        let result = evaluate_with_hidden_seeds(
            request(vec![("fable", EXAMPLE_SOURCE, "open_book_iterative")]),
            &receipt(3),
            &[100_001, 100_002, 100_003],
        )
        .expect("result");
        let serialized = serde_json::to_string(&result).expect("json");
        assert!(!serialized.contains("100001"));
        assert!(!serialized.contains("when rhizome"));
        assert_eq!(result["comparison"]["winner_declared"], false);
        assert!(result["comparison"]["winner"].is_null());
    }

    #[test]
    fn tuned_candidate_cannot_claim_blind_generation() {
        let mut invalid = provenance("blind_one_shot");
        invalid.simulator_used_during_authoring = true;
        assert!(validate_provenance(&invalid).is_err());
    }

    #[test]
    fn result_integrity_detects_metric_tampering() {
        let mut result = evaluate_with_hidden_seeds(
            request(vec![("fable", EXAMPLE_SOURCE, "open_book_iterative")]),
            &receipt(3),
            &[100_001, 100_002, 100_003],
        )
        .expect("result");
        result["candidates"][0]["combined_aggregate"]["days_uncontained_sum"] = json!(999_999);
        assert!(validate_forgebench_garden_result(&result).is_err());
    }

    #[test]
    fn rehashing_cannot_forge_a_winner_or_hidden_material() {
        let original = evaluate_with_hidden_seeds(
            request(vec![("fable", EXAMPLE_SOURCE, "open_book_iterative")]),
            &receipt(3),
            &[100_001, 100_002, 100_003],
        )
        .expect("result");

        let mut winner = original.clone();
        winner["comparison"]["winner_declared"] = json!(true);
        winner["comparison"]["winner"] = json!("fable");
        sign_document(&mut winner).expect("rehash winner");
        assert!(validate_forgebench_garden_result(&winner).is_err());

        let mut leaked = original;
        leaked["hidden_suite"]["hidden_seeds"] = json!([100_001, 100_002, 100_003]);
        sign_document(&mut leaked).expect("rehash hidden material");
        assert!(validate_forgebench_garden_result(&leaked).is_err());
    }

    #[test]
    fn rehashing_cannot_forge_provenance_or_ranking() {
        let conservative = EXAMPLE_SOURCE
            .replace(
                "barrier.joint_integrity_pct <= 64%",
                "barrier.joint_integrity_pct <= 70%",
            )
            .replace("Fable Joint Sentinel", "Conservative Joint Sentinel");
        let original = evaluate_with_hidden_seeds(
            request(vec![
                ("fable", EXAMPLE_SOURCE, "open_book_iterative"),
                ("conservative", &conservative, "human_authored"),
            ]),
            &receipt(3),
            &[100_001, 100_002, 100_003],
        )
        .expect("result");

        let mut provenance = original.clone();
        provenance["candidates"][0]["provenance"]["eligible_for_blind_claim"] = json!(true);
        sign_document(&mut provenance).expect("rehash provenance");
        assert!(validate_forgebench_garden_result(&provenance).is_err());

        let mut ranking = original;
        ranking["candidates"]
            .as_array_mut()
            .expect("candidates")
            .reverse();
        for (index, candidate) in ranking["candidates"]
            .as_array_mut()
            .expect("candidates")
            .iter_mut()
            .enumerate()
        {
            candidate["provisional_rank"] = json!(index + 1);
        }
        ranking["comparison"]["provisional_order"] = Value::Array(
            ranking["candidates"]
                .as_array()
                .expect("candidates")
                .iter()
                .map(|candidate| candidate["candidate_id"].clone())
                .collect(),
        );
        sign_document(&mut ranking).expect("rehash ranking");
        assert!(validate_forgebench_garden_result(&ranking).is_err());
    }
}
