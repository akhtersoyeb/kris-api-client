use rusqlite::Connection;

use super::db;
use super::recorder::{self, now_ms, Outcome, RecordInput};
use super::redact::{self, MASK};
use super::settings::{AppSettings, HistorySettings, SettingsState};
use super::types::NewEntry;
use crate::auth::{ApiKeyLocation, AuthConfig};
use crate::error::AppError;
use crate::http_engine::{KeyValue, RequestBody, RequestSettings, RequestSpec};
use crate::variables::environments;
use crate::workspace::store;

fn conn() -> Connection {
    let mut conn = Connection::open_in_memory().unwrap();
    db::migrate(&mut conn).unwrap();
    conn
}

fn kv(key: &str, value: &str) -> KeyValue {
    KeyValue {
        key: key.into(),
        value: value.into(),
        enabled: true,
    }
}

fn spec(method: &str, url: &str) -> RequestSpec {
    RequestSpec {
        method: method.into(),
        url: url.into(),
        headers: vec![],
        body: RequestBody::None,
        settings: RequestSettings {
            timeout_ms: 1000,
            follow_redirects: true,
        },
        auth: crate::auth::AuthConfig::None,
    }
}

fn add(conn: &Connection, method: &str, url: &str, status: Option<u16>, ts_ms: i64) {
    db::insert(
        conn,
        &NewEntry {
            ts_ms,
            spec: spec(method, url),
            status,
            duration_ms: Some(5),
            size_bytes: Some(10),
            error: None,
            environment: None,
            request_path: None,
        },
    )
    .unwrap();
}

fn urls(entries: &[super::HistoryEntry]) -> Vec<&str> {
    entries.iter().map(|e| e.url.as_str()).collect()
}

// ---------- database ----------

#[test]
fn migrations_are_idempotent_and_refuse_newer_databases() {
    let mut conn = Connection::open_in_memory().unwrap();
    db::migrate(&mut conn).unwrap();
    db::migrate(&mut conn).unwrap();
    let version: u32 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .unwrap();
    assert_eq!(version as usize, db::MIGRATIONS.len());

    conn.pragma_update(None, "user_version", 99).unwrap();
    assert!(matches!(
        db::migrate(&mut conn),
        Err(AppError::Unsupported(_))
    ));
}

#[test]
fn list_is_newest_first_and_paginates() {
    let c = conn();
    for n in 1..=5 {
        add(&c, "GET", &format!("https://x.dev/{n}"), Some(200), n);
    }
    assert_eq!(
        urls(&db::list(&c, 2, 0).unwrap()),
        ["https://x.dev/5", "https://x.dev/4"]
    );
    assert_eq!(urls(&db::list(&c, 2, 4).unwrap()), ["https://x.dev/1"]);
}

#[test]
fn search_matches_substrings_status_and_method_in_every_word() {
    let c = conn();
    add(&c, "GET", "https://api.example.com/users/42", Some(200), 1);
    add(&c, "POST", "https://api.example.com/orders", Some(404), 2);
    add(&c, "GET", "https://other.dev/health", Some(200), 3);

    assert_eq!(db::search(&c, "xample", 10).unwrap().len(), 2);
    assert_eq!(
        urls(&db::search(&c, "USERS", 10).unwrap()),
        ["https://api.example.com/users/42"]
    );
    assert_eq!(
        urls(&db::search(&c, "404", 10).unwrap()),
        ["https://api.example.com/orders"]
    );
    assert_eq!(
        urls(&db::search(&c, "example orders", 10).unwrap()),
        ["https://api.example.com/orders"]
    );
    assert_eq!(db::search(&c, "post", 10).unwrap().len(), 1);
    assert_eq!(db::search(&c, "   ", 10).unwrap().len(), 3);
}

#[test]
fn short_terms_use_like_and_wildcards_are_literal() {
    let c = conn();
    add(&c, "GET", "https://api.example.com/users/42", Some(200), 1);
    add(&c, "GET", "https://api.example.com/orders", Some(200), 2);
    add(&c, "GET", "https://other.dev/health", Some(200), 3);

    assert_eq!(
        urls(&db::search(&c, "42", 10).unwrap()),
        ["https://api.example.com/users/42"]
    );
    assert_eq!(db::search(&c, "/o", 10).unwrap().len(), 2);
    assert!(db::search(&c, "%", 10).unwrap().is_empty());
    assert!(db::search(&c, "a_i", 10).unwrap().is_empty()); // "_" is not a wildcard
}

#[test]
fn quotes_in_queries_cannot_break_the_search_expression() {
    let c = conn();
    add(&c, "GET", "https://x.dev/a", Some(200), 1);
    assert!(db::search(&c, "\"abc\" OR *", 10).is_ok());
}

#[test]
fn deleting_removes_rows_from_the_search_index_too() {
    let c = conn();
    add(&c, "GET", "https://api.example.com/users", Some(200), 1);
    add(&c, "GET", "https://api.example.com/orders", Some(200), 2);

    let id = db::search(&c, "users", 10).unwrap()[0].id;
    db::delete(&c, id).unwrap();
    assert!(db::search(&c, "users", 10).unwrap().is_empty());
    assert_eq!(db::search(&c, "example", 10).unwrap().len(), 1);

    db::clear(&c).unwrap();
    assert!(db::search(&c, "example", 10).unwrap().is_empty());
    assert!(db::list(&c, 10, 0).unwrap().is_empty());
}

#[test]
fn prune_applies_count_and_age_limits() {
    let c = conn();
    let day = 86_400_000;
    let now = 100 * day;
    // Recorded oldest first, like real use: a higher id means a newer timestamp.
    // So /5 is 1 day old, /4 is 2 days old, ... and /1 is 5 days old.
    for n in 1..=5 {
        add(
            &c,
            "GET",
            &format!("https://x.dev/{n}"),
            Some(200),
            now - (6 - n) * day,
        );
    }

    let by_count = HistorySettings {
        retention_days: 0,
        max_entries: 3,
        ..Default::default()
    };
    db::prune(&c, &by_count, now).unwrap();
    assert_eq!(
        urls(&db::list(&c, 10, 0).unwrap()),
        ["https://x.dev/5", "https://x.dev/4", "https://x.dev/3"]
    );

    // The cutoff is exactly 2 days ago: an entry exactly 2 days old stays, older ones go.
    let by_age = HistorySettings {
        retention_days: 2,
        max_entries: 100,
        ..Default::default()
    };
    db::prune(&c, &by_age, now).unwrap();
    assert_eq!(
        urls(&db::list(&c, 10, 0).unwrap()),
        ["https://x.dev/5", "https://x.dev/4"]
    );
}

#[test]
fn a_stored_request_comes_back_intact() {
    let c = conn();
    let mut s = spec("POST", "https://x.dev/login");
    s.body = RequestBody::Json {
        content: r#"{"a":1}"#.into(),
    };
    db::insert(
        &c,
        &NewEntry {
            ts_ms: 1,
            spec: s,
            status: Some(201),
            duration_ms: None,
            size_bytes: None,
            error: None,
            environment: None,
            request_path: None,
        },
    )
    .unwrap();

    let id = db::list(&c, 1, 0).unwrap()[0].id;
    let back = db::get_request(&c, id).unwrap();
    assert_eq!(back.method, "POST");
    assert!(matches!(back.body, RequestBody::Json { content } if content == r#"{"a":1}"#));
    assert!(matches!(
        db::get_request(&c, 9999),
        Err(AppError::NotFound(_))
    ));
}

// ---------- redaction ----------

#[test]
fn sensitive_headers_are_masked_unless_they_only_reference_variables() {
    let mut s = spec("GET", "https://x.dev");
    s.headers = vec![
        kv("Authorization", "Bearer abc123"),
        kv("X-Api-Key", "{{apiKey}}"),
        kv("Authorization", "Bearer {{token}}"),
        kv("Cookie", "session=1"),
        kv("Content-Type", "application/json"),
        KeyValue {
            enabled: false,
            ..kv("X-Auth-Token", "hunter2")
        },
    ];
    let out = redact::for_history(&s, &HistorySettings::default());
    let values: Vec<&str> = out.headers.iter().map(|h| h.value.as_str()).collect();
    assert_eq!(
        values,
        [
            MASK,
            "{{apiKey}}",
            "Bearer {{token}}",
            MASK,
            "application/json",
            MASK
        ]
    );
}

#[test]
fn urls_lose_credentials_and_sensitive_query_values() {
    assert_eq!(
        redact::redact_url("https://u:p@host/x?token=abc&page=2&api_key={{k}}#frag"),
        "https://[redacted]@host/x?token=[redacted]&page=2&api_key={{k}}#frag"
    );
    assert_eq!(
        redact::redact_url("https://{{user}}:{{pass}}@host/x"),
        "https://{{user}}:{{pass}}@host/x"
    );
    assert_eq!(
        redact::redact_url("http://localhost:3000/a?b=1"),
        "http://localhost:3000/a?b=1"
    );
}

#[test]
fn form_fields_are_masked_but_json_bodies_are_kept() {
    let mut form = spec("POST", "https://x.dev");
    form.body = RequestBody::FormUrlEncoded {
        fields: vec![kv("user", "me"), kv("password", "pw")],
    };
    match redact::for_history(&form, &HistorySettings::default()).body {
        RequestBody::FormUrlEncoded { fields } => assert_eq!(
            (fields[0].value.as_str(), fields[1].value.as_str()),
            ("me", MASK)
        ),
        _ => panic!("body changed type"),
    }

    let mut json = spec("POST", "https://x.dev");
    json.body = RequestBody::Json {
        content: r#"{"password":"pw"}"#.into(),
    };
    assert!(
        matches!(redact::for_history(&json, &HistorySettings::default()).body, RequestBody::Json { content } if content.contains("pw"))
    );
}

#[test]
fn bodies_can_be_left_out_entirely_and_redaction_can_be_off() {
    let mut s = spec("POST", "https://x.dev?token=abc");
    s.headers = vec![kv("Authorization", "Bearer abc")];
    s.body = RequestBody::Json {
        content: "secret".into(),
    };

    let no_bodies = HistorySettings {
        store_bodies: false,
        ..Default::default()
    };
    assert!(
        matches!(redact::for_history(&s, &no_bodies).body, RequestBody::Json { content } if content.is_empty())
    );

    let raw = HistorySettings {
        redact_secrets: false,
        ..Default::default()
    };
    let out = redact::for_history(&s, &raw);
    assert_eq!(out.url, "https://x.dev?token=abc");
    assert_eq!(out.headers[0].value, "Bearer abc");
}

#[test]
fn sensitive_name_detection() {
    for yes in [
        "Authorization",
        "x-api-key",
        "API_KEY",
        "access_token",
        "Set-Cookie",
        "client_secret",
        "key",
        "password",
    ] {
        assert!(redact::is_sensitive_name(yes), "{yes}");
    }
    for no in ["Content-Type", "page", "limit", "Accept", "keyboard"] {
        assert!(!redact::is_sensitive_name(no), "{no}");
    }
}

// ---------- recording ----------

#[test]
fn recording_stores_a_redacted_request_with_the_environment_name() {
    let app_dir = tempfile::tempdir().unwrap();
    let ws_dir = tempfile::tempdir().unwrap();
    let root = store::create_workspace(ws_dir.path(), "WS").unwrap();
    let ws_id = store::read_container(&root.join("workspace.json"))
        .unwrap()
        .id;
    let env = environments::create(&root, "Dev").unwrap();

    let mut s = spec("GET", "https://x.dev/a?token=sekrit");
    s.headers = vec![kv("Authorization", "Bearer sekrit")];
    recorder::record(
        app_dir.path(),
        &root,
        &HistorySettings::default(),
        RecordInput {
            spec: s,
            environment_id: Some(env.id),
            request_path: Some("collections/api/x.request.json".into()),
            outcome: Outcome::Response {
                status: 200,
                duration_ms: 12,
                size_bytes: 34,
            },
        },
    )
    .unwrap();
    recorder::record(
        app_dir.path(),
        &root,
        &HistorySettings::default(),
        RecordInput {
            spec: spec("GET", "https://down.dev"),
            environment_id: None,
            request_path: None,
            outcome: Outcome::Failed {
                message: "connection refused".into(),
            },
        },
    )
    .unwrap();

    let conn = db::open(app_dir.path(), &ws_id).unwrap();
    let entries = db::list(&conn, 10, 0).unwrap();
    assert_eq!(entries.len(), 2);

    let failed = &entries[0];
    assert_eq!(
        (failed.status, failed.error.as_deref()),
        (None, Some("connection refused"))
    );

    let ok = &entries[1];
    assert_eq!(ok.status, Some(200));
    assert_eq!(ok.environment.as_deref(), Some("Dev"));
    assert_eq!(ok.url, "https://x.dev/a?token=[redacted]");
    let stored = serde_json::to_string(&db::get_request(&conn, ok.id).unwrap()).unwrap();
    assert!(
        !stored.contains("sekrit"),
        "secret leaked into history: {stored}"
    );
    assert!(now_ms() > 0);
}

// ---------- settings ----------

#[test]
fn settings_are_clamped_persisted_and_survive_a_corrupt_file() {
    let dir = tempfile::tempdir().unwrap();
    let state = SettingsState::load(dir.path().to_path_buf());
    assert!(state.history().enabled);

    let saved = state
        .set(AppSettings {
            history: HistorySettings {
                max_entries: 1,
                retention_days: 99_999,
                enabled: false,
                ..Default::default()
            },
        })
        .unwrap();
    assert_eq!(
        (saved.history.max_entries, saved.history.retention_days),
        (50, 3650)
    );

    let reloaded = SettingsState::load(dir.path().to_path_buf());
    assert!(!reloaded.history().enabled);

    std::fs::write(dir.path().join("settings.json"), "{ not json").unwrap();
    assert!(
        SettingsState::load(dir.path().to_path_buf())
            .history()
            .enabled
    ); // falls back to defaults
}

#[test]
fn literal_auth_secrets_are_masked_but_variables_are_kept() {
    let settings = HistorySettings::default();
    let mut s = spec("GET", "https://x.dev");

    s.auth = AuthConfig::Basic {
        username: "me".into(),
        password: "hunter2".into(),
    };
    match redact::for_history(&s, &settings).auth {
        AuthConfig::Basic { username, password } => {
            assert_eq!((username.as_str(), password.as_str()), ("me", MASK))
        }
        other => panic!("unexpected auth: {other:?}"),
    }

    s.auth = AuthConfig::Bearer {
        token: "{{token}}".into(),
        prefix: "Bearer".into(),
    };
    assert_eq!(redact::for_history(&s, &settings).auth, s.auth);

    s.auth = AuthConfig::ApiKey {
        key: "k".into(),
        value: "abc".into(),
        location: ApiKeyLocation::Query,
    };
    assert!(
        matches!(redact::for_history(&s, &settings).auth, AuthConfig::ApiKey { value, .. } if value == MASK)
    );

    s.auth = AuthConfig::Bearer {
        token: "abc".into(),
        prefix: "Bearer".into(),
    };
    let off = HistorySettings {
        redact_secrets: false,
        ..Default::default()
    };
    assert_eq!(redact::for_history(&s, &off).auth, s.auth);
}
