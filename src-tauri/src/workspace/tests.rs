use std::path::PathBuf;

use serde_json::json;

use super::fs_util::*;
use super::schema::*;
use super::store::{self, NodeEntry, WorkspaceInfo};
use crate::error::AppError;
use crate::http_engine::RequestSettings;

fn blank(name: &str) -> RequestFile {
    RequestFile {
        schema_version: SCHEMA_VERSION,
        id: String::new(),
        name: name.into(),
        method: "GET".into(),
        url: "https://x.dev".into(),
        params: vec![],
        headers: vec![],
        body: BodyFile {
            mode: BodyMode::None,
            json: String::new(),
            raw: String::new(),
            raw_mime: "text/plain".into(),
            form: vec![],
        },
        settings: RequestSettings {
            timeout_ms: 30_000,
            follow_redirects: true,
        },
    }
}

fn setup() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = store::create_workspace(dir.path(), "Test WS").unwrap();
    (dir, root)
}

fn outline(info: &WorkspaceInfo) -> Vec<String> {
    info.nodes
        .iter()
        .map(|n| format!("{}{}", "  ".repeat(n.depth as usize), n.name))
        .collect()
}

fn find<'a>(info: &'a WorkspaceInfo, name: &str) -> &'a NodeEntry {
    info.nodes.iter().find(|n| n.name == name).unwrap()
}

#[test]
fn request_file_roundtrips() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.request.json");
    let mut file = blank("Login");
    file.id = new_id();
    file.method = "POST".into();
    write_json(&path, &file).unwrap();

    let back = store::read_request(&path).unwrap();
    assert_eq!(back.id, file.id);
    assert_eq!(back.name, "Login");
    assert_eq!(back.method, "POST");
    assert_eq!(back.settings.timeout_ms, 30_000);
}

#[test]
fn newer_schema_versions_are_rejected() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("a.request.json");
    std::fs::write(
        &path,
        json!({ "schemaVersion": 99, "id": "x", "name": "n" }).to_string(),
    )
    .unwrap();
    assert!(matches!(
        store::read_request(&path),
        Err(AppError::Unsupported(_))
    ));
}

#[test]
fn atomic_write_replaces_without_leftovers() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("f.json");
    atomic_write(&path, b"one").unwrap();
    atomic_write(&path, b"two").unwrap();
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "two");
    assert_eq!(
        std::fs::read_dir(dir.path()).unwrap().count(),
        1,
        "temp file left behind"
    );
}

#[test]
fn scan_returns_the_tree_depth_first_in_order() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let folder = store::create_folder(&root, &col, "Auth").unwrap();
    store::create_request(&root, &folder, blank("Login")).unwrap();
    store::create_request(&root, &col, blank("List users")).unwrap();

    let info = store::scan(&root).unwrap();
    assert_eq!(
        outline(&info),
        ["API", "  Auth", "    Login", "  List users"]
    );
    assert!(info.warnings.is_empty());
}

#[test]
fn broken_files_become_warnings() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    std::fs::write(root.join(&col).join("bad.request.json"), "{ nope").unwrap();

    let info = store::scan(&root).unwrap();
    assert_eq!(outline(&info), ["API"]);
    assert_eq!(info.warnings.len(), 1);
}

#[test]
fn move_node_reorders_and_reparents() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let a = store::create_request(&root, &col, blank("A")).unwrap();
    let b = store::create_request(&root, &col, blank("B")).unwrap();
    let info = store::scan(&root).unwrap();
    let (id_a, id_b) = (find(&info, "A").id.clone(), find(&info, "B").id.clone());

    store::move_node(&root, &b, &col, &[id_b, id_a.clone()]).unwrap();
    assert_eq!(outline(&store::scan(&root).unwrap()), ["API", "  B", "  A"]);

    let folder = store::create_folder(&root, &col, "Sub").unwrap();
    let moved = store::move_node(&root, &a, &folder, &[id_a]).unwrap();
    assert!(moved.starts_with(&folder));
    assert_eq!(
        outline(&store::scan(&root).unwrap()),
        ["API", "  B", "  Sub", "    A"]
    );
}

#[test]
fn folders_cannot_move_into_themselves() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let outer = store::create_folder(&root, &col, "Outer").unwrap();
    let inner = store::create_folder(&root, &outer, "Inner").unwrap();
    assert!(store::move_node(&root, &outer, &inner, &[]).is_err());
}

#[test]
fn rename_duplicate_and_delete() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let req = store::create_request(&root, &col, blank("Login")).unwrap();

    let renamed = store::rename_node(&root, &req, "Sign in").unwrap();
    assert!(renamed.ends_with("sign-in.request.json"));
    assert_eq!(
        store::read_request(&root.join(&renamed)).unwrap().name,
        "Sign in"
    );

    let copy = store::duplicate_node(&root, &renamed).unwrap();
    assert!(copy.ends_with("sign-in-copy.request.json"));
    let info = store::scan(&root).unwrap();
    assert_eq!(outline(&info), ["API", "  Sign in", "  Sign in copy"]);
    assert_ne!(find(&info, "Sign in").id, find(&info, "Sign in copy").id);

    store::delete_node(&root, &renamed).unwrap();
    assert_eq!(
        outline(&store::scan(&root).unwrap()),
        ["API", "  Sign in copy"]
    );
}

#[test]
fn duplicating_a_folder_gives_every_node_a_new_id() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let folder = store::create_folder(&root, &col, "Auth").unwrap();
    store::create_request(&root, &folder, blank("Login")).unwrap();
    store::duplicate_node(&root, &folder).unwrap();

    let info = store::scan(&root).unwrap();
    assert_eq!(
        outline(&info),
        ["API", "  Auth", "    Login", "  Auth copy", "    Login"]
    );
    let ids: Vec<_> = info.nodes.iter().map(|n| n.id.clone()).collect();
    let unique: std::collections::HashSet<_> = ids.iter().collect();
    assert_eq!(ids.len(), unique.len());
}

#[test]
fn save_request_keeps_the_id_and_refuses_missing_files() {
    let (_dir, root) = setup();
    let col = store::create_collection(&root, "API").unwrap();
    let req = store::create_request(&root, &col, blank("Login")).unwrap();
    let before = store::load_request(&root, &req).unwrap();

    let mut edited = blank("Login");
    edited.url = "https://changed.dev".into();
    edited.id = "attempted-id-change".into();
    store::save_request(&root, &req, edited).unwrap();
    let after = store::load_request(&root, &req).unwrap();
    assert_eq!(after.id, before.id);
    assert_eq!(after.url, "https://changed.dev");

    std::fs::remove_file(root.join(&req)).unwrap();
    assert!(matches!(
        store::save_request(&root, &req, blank("Login")),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn unsafe_paths_are_rejected() {
    let root = PathBuf::from("workspace-root");
    for bad in ["../x", "a/../../x", "/etc/passwd"] {
        assert!(safe_join(&root, bad).is_err(), "{bad} should be rejected");
    }
    assert!(safe_join(&root, "collections/a/b.request.json").is_ok());

    let (_dir, ws) = setup();
    assert!(store::delete_node(&ws, "workspace.json").is_err());
    assert!(store::load_request(&ws, "../outside.request.json").is_err());
}

#[test]
fn slugify_cases() {
    assert_eq!(slugify("  Create charge! "), "create-charge");
    assert_eq!(slugify("¿Qué tal?"), "qué-tal");
    assert_eq!(slugify("***"), "untitled");
    assert_eq!(slugify("CON"), "con-item");
    assert_eq!(slugify(&"a".repeat(100)).len(), 60);
}
