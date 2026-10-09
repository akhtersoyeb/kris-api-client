use std::path::PathBuf;

use super::apply::apply;
use super::context;
use super::environments::{self, Environment};
use super::resolver::Context;
use super::scopes::{self, ScopeRef};
use super::secrets::{account, MemoryStore, SecretStore};
use super::types::{Variable, VariableScope};
use crate::error::AppError;
use crate::http_engine::{KeyValue, RequestBody, RequestSettings, RequestSpec};
use crate::workspace::store;

fn fixed(name: &str) -> Option<String> {
    match name {
        "$uuid" => Some("UUID".into()),
        "$timestamp" => Some("1700000000".into()),
        _ => None,
    }
}

fn var(key: &str, value: &str) -> Variable {
    Variable {
        key: key.into(),
        value: value.into(),
        enabled: true,
        secret: false,
    }
}

fn secret(key: &str, value: &str) -> Variable {
    Variable {
        secret: true,
        ..var(key, value)
    }
}

fn layered(global: &[Variable], collection: &[Variable], env: &[Variable]) -> Context {
    let mut c = Context::new(fixed);
    c.add_layer(VariableScope::Global, global);
    c.add_layer(VariableScope::Collection, collection);
    c.add_layer(VariableScope::Environment, env);
    c
}

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = store::create_workspace(dir.path(), "WS").unwrap();
    (dir, root)
}

fn env_file_text(root: &std::path::Path) -> String {
    let entry = std::fs::read_dir(root.join("environments"))
        .unwrap()
        .flatten()
        .next()
        .unwrap();
    std::fs::read_to_string(entry.path()).unwrap()
}

// ---------- resolver ----------

#[test]
fn environment_beats_collection_beats_global() {
    let c = layered(
        &[var("a", "global"), var("b", "global"), var("c", "global")],
        &[var("b", "collection"), var("c", "collection")],
        &[var("c", "environment")],
    );
    assert_eq!(
        c.resolve("{{a}} {{b}} {{c}}").text,
        "global collection environment"
    );
}

#[test]
fn disabled_and_blank_variables_are_ignored() {
    let off = Variable {
        enabled: false,
        ..var("x", "1")
    };
    let c = layered(&[off, var("  ", "blank")], &[], &[]);
    let r = c.resolve("{{x}}");
    assert_eq!(r.text, "{{x}}");
    assert_eq!(r.unresolved, ["x"]);
}

#[test]
fn values_can_reference_other_variables() {
    let c = layered(
        &[],
        &[],
        &[var("base", "https://{{host}}/v1"), var("host", "api.dev")],
    );
    let r = c.resolve("{{ base }}/users");
    assert_eq!(r.text, "https://api.dev/v1/users");
    assert!(r.unresolved.is_empty() && r.cyclic.is_empty());
}

#[test]
fn cycles_are_reported_and_left_in_place() {
    let c = layered(&[], &[], &[var("a", "{{b}}"), var("b", "{{a}}")]);
    let r = c.resolve("{{a}}");
    assert_eq!(r.text, "{{a}}");
    assert_eq!(r.cyclic, ["a"]);
}

#[test]
fn unresolved_names_are_reported_once() {
    let r = layered(&[], &[], &[]).resolve("{{missing}} and {{missing}} and {{other}}");
    assert_eq!(r.text, "{{missing}} and {{missing}} and {{other}}");
    assert_eq!(r.unresolved, ["missing", "other"]);
}

#[test]
fn builtins_resolve_and_unknown_dollar_names_do_not() {
    let r = layered(&[], &[], &[]).resolve("{{$uuid}}:{{$timestamp}}:{{$nope}}");
    assert_eq!(r.text, "UUID:1700000000:{{$nope}}");
    assert_eq!(r.unresolved, ["$nope"]);
}

#[test]
fn real_builtins_produce_values() {
    let mut c = Context::new(super::builtins::dynamic_value);
    c.add_layer(VariableScope::Global, &[]);
    let r = c.resolve("{{$uuid}} {{$timestamp}} {{$randomInt}}");
    assert!(r.unresolved.is_empty());
    let parts: Vec<&str> = r.text.split(' ').collect();
    assert_eq!(parts[0].len(), 36);
    assert!(parts[1].parse::<u64>().unwrap() > 1_600_000_000);
    assert!(parts[2].parse::<u32>().unwrap() <= 1000);
}

#[test]
fn braces_that_are_not_variables_stay_literal() {
    let c = layered(&[], &[], &[var("name", "x")]);
    let text = r#"{"t": "{{ not a var }}", "open": "{{", "close": "}}"} {{ name }}"#;
    assert_eq!(
        c.resolve(text).text,
        r#"{"t": "{{ not a var }}", "open": "{{", "close": "}}"} x"#
    );
}

// ---------- secrets and environments ----------

#[test]
fn secret_values_stay_out_of_the_files() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let saved = environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![var("host", "api.dev"), secret("token", "s3cret")],
            ..env
        },
    )
    .unwrap();

    let text = env_file_text(&root);
    assert!(
        !text.contains("s3cret"),
        "secret leaked into the file: {text}"
    );
    assert!(text.contains("api.dev"));
    assert_eq!(
        store
            .get(&account("ws1", &saved.id, "token"))
            .unwrap()
            .as_deref(),
        Some("s3cret")
    );
    assert_eq!(saved.variables[1].value, "s3cret"); // reloaded with the secret filled in
}

#[test]
fn an_empty_secret_value_keeps_the_stored_secret() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let saved = environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![secret("token", "keep")],
            ..env
        },
    )
    .unwrap();

    // The UI couldn't read the keychain, so it sends the secret back empty.
    environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![secret("token", "")],
            ..saved.clone()
        },
    )
    .unwrap();
    assert_eq!(
        store
            .get(&account("ws1", &saved.id, "token"))
            .unwrap()
            .as_deref(),
        Some("keep")
    );
}

#[test]
fn unmarking_or_removing_a_secret_clears_the_keychain() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let saved = environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![secret("a", "1"), secret("b", "2")],
            ..env
        },
    )
    .unwrap();

    // a is no longer secret (its value becomes plain text), b is deleted.
    environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![var("a", "1")],
            ..saved.clone()
        },
    )
    .unwrap();
    assert!(store
        .get(&account("ws1", &saved.id, "a"))
        .unwrap()
        .is_none());
    assert!(store
        .get(&account("ws1", &saved.id, "b"))
        .unwrap()
        .is_none());
    assert!(env_file_text(&root).contains("\"1\""));
}

#[test]
fn saving_renames_the_file_only_when_the_name_changes() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let file_name = || {
        std::fs::read_dir(root.join("environments"))
            .unwrap()
            .flatten()
            .next()
            .unwrap()
            .file_name()
    };

    assert_eq!(file_name().to_string_lossy(), "dev.env.json");
    let saved = environments::save(&root, &store, "ws1", env).unwrap();
    assert_eq!(file_name().to_string_lossy(), "dev.env.json");
    environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            name: "Staging".into(),
            ..saved
        },
    )
    .unwrap();
    assert_eq!(file_name().to_string_lossy(), "staging.env.json");
    assert_eq!(environments::list(&root)[0].name, "Staging");
}

#[test]
fn deleting_an_environment_removes_its_secrets() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let saved = environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![secret("token", "x")],
            ..env
        },
    )
    .unwrap();

    environments::delete(&root, &store, "ws1", &saved.id).unwrap();
    assert!(store
        .get(&account("ws1", &saved.id, "token"))
        .unwrap()
        .is_none());
    assert!(environments::list(&root).is_empty());
}

#[test]
fn duplicating_copies_secrets_under_the_new_id() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let env = environments::create(&root, "Dev").unwrap();
    let saved = environments::save(
        &root,
        &store,
        "ws1",
        Environment {
            variables: vec![secret("token", "x")],
            ..env
        },
    )
    .unwrap();

    let copy = environments::duplicate(&root, &store, "ws1", &saved.id).unwrap();
    assert_eq!(copy.name, "Dev copy");
    assert_eq!(
        store
            .get(&account("ws1", &copy.id, "token"))
            .unwrap()
            .as_deref(),
        Some("x")
    );
}

// ---------- scopes and context ----------

#[test]
fn context_layers_come_from_files_and_the_keychain() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let ws_id = store::read_container(&root.join("workspace.json"))
        .unwrap()
        .id;
    let collection = store::create_collection(&root, "API").unwrap();

    scopes::set(
        &root,
        &store,
        &ws_id,
        &ScopeRef::Global,
        &[var("who", "global"), var("only_global", "g")],
    )
    .unwrap();
    scopes::set(
        &root,
        &store,
        &ws_id,
        &ScopeRef::Collection {
            path: collection.clone(),
        },
        &[var("who", "collection"), secret("key", "k-123")],
    )
    .unwrap();
    let env = environments::create(&root, "Dev").unwrap();
    let env = environments::save(
        &root,
        &store,
        &ws_id,
        Environment {
            variables: vec![var("who", "env")],
            ..env
        },
    )
    .unwrap();
    let request_path = format!("{collection}/x.request.json");

    let with_secrets =
        context::build(&root, Some(&store), Some(&env.id), Some(&request_path)).unwrap();
    assert_eq!(
        with_secrets.resolve("{{who}} {{only_global}} {{key}}").text,
        "env g k-123"
    );

    // Previews never read the keychain.
    let preview = context::build(&root, None, Some(&env.id), Some(&request_path)).unwrap();
    assert_eq!(preview.resolve("{{key}}").text, "");
    let infos = context::describe(&preview);
    let key = infos.iter().find(|i| i.name == "key").unwrap();
    assert!(key.secret && key.value.is_empty());
    assert!(infos
        .iter()
        .any(|i| i.name == "$uuid" && i.scope == VariableScope::Builtin));

    // Without the collection in the request path, its layer is absent.
    let no_collection = context::build(&root, Some(&store), Some(&env.id), None).unwrap();
    assert_eq!(no_collection.resolve("{{key}}").unresolved, ["key"]);
}

#[test]
fn a_deleted_environment_counts_as_none_selected() {
    let (_dir, root) = workspace();
    let ctx = context::build(&root, None, Some("no-such-id"), None).unwrap();
    assert_eq!(ctx.resolve("{{x}}").unresolved, ["x"]);
}

#[test]
fn deleting_a_collection_purges_its_secrets() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let ws_id = store::read_container(&root.join("workspace.json"))
        .unwrap()
        .id;
    let collection = store::create_collection(&root, "API").unwrap();
    scopes::set(
        &root,
        &store,
        &ws_id,
        &ScopeRef::Collection {
            path: collection.clone(),
        },
        &[secret("key", "k")],
    )
    .unwrap();
    let collection_id = store::read_container(&root.join(&collection).join("collection.json"))
        .unwrap()
        .id;

    scopes::purge_collection_secrets(&root, &store, &collection);
    assert!(store
        .get(&account(&ws_id, &collection_id, "key"))
        .unwrap()
        .is_none());
}

#[test]
fn scope_paths_must_be_collections() {
    let (_dir, root) = workspace();
    let store = MemoryStore::default();
    let bad = ScopeRef::Collection {
        path: "../elsewhere".into(),
    };
    assert!(scopes::get(&root, &store, "ws", &bad).is_err());
}

// ---------- applying variables to a request ----------

fn spec(url: &str) -> RequestSpec {
    RequestSpec {
        method: "POST".into(),
        url: url.into(),
        headers: vec![
            KeyValue {
                key: "Authorization".into(),
                value: "Bearer {{token}}".into(),
                enabled: true,
            },
            KeyValue {
                key: "X-Off".into(),
                value: "{{ignored}}".into(),
                enabled: false,
            },
        ],
        body: RequestBody::Json {
            content: r#"{"id": {{id}}, "who": "{{missing}}"}"#.into(),
        },
        settings: RequestSettings {
            timeout_ms: 1000,
            follow_redirects: true,
        },
    }
}

#[test]
fn apply_substitutes_everywhere_and_reports_leftovers() {
    let c = layered(
        &[],
        &[],
        &[
            var("base", "https://api.dev"),
            var("token", "t0k"),
            var("id", "42"),
        ],
    );
    let applied = apply(&c, spec("{{base}}/users")).unwrap();

    assert_eq!(applied.spec.url, "https://api.dev/users");
    assert_eq!(applied.spec.headers[0].value, "Bearer t0k");
    assert_eq!(applied.spec.headers[1].value, "{{ignored}}"); // disabled rows are untouched
    match applied.spec.body {
        RequestBody::Json { content } => assert_eq!(content, r#"{"id": 42, "who": "{{missing}}"}"#),
        _ => panic!("body changed type"),
    }
    assert_eq!(applied.unresolved, ["missing"]);
}

#[test]
fn undefined_variables_in_the_url_fail_the_send() {
    let c = layered(&[], &[], &[]);
    let err = apply(&c, spec("{{base}}/users"))
        .err()
        .expect("should fail");
    match err {
        AppError::InvalidInput(message) => assert!(message.contains("base"), "{message}"),
        other => panic!("unexpected error: {other:?}"),
    }
}
