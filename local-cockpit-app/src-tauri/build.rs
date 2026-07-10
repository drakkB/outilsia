fn main() {
    println!("cargo:rerun-if-env-changed=OUTILSIA_BUILD_ID");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    tauri_build::build();
}
