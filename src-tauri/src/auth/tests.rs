use std::path::PathBuf;

use wiremock::matchers::{header, method, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::collection;
use super::config::{ApiKeyLocation, AuthConfig};
use super::providers::{apply_auth, set_query_param};
use super::resolve::{effective, substitute};
use crate::error::AppError;
use crate::http_engine::{execute, HttpState, KeyValue, RequestBody, RequestSettings, RequestSpec};
use crate::variables::{Context, Variable, VariableScope};
use crate::workspace::schema::RequestFile;
use crate::workspace::store;

fn spec(url: &str) -> RequestSpec {
    RequestSpec {
        method: "GET".into(),
        url: url.into(),
        headers: vec![],
        body: RequestBody::None,
        settings: RequestSettings {
            timeout_ms: 5000,
            follow_redirects: true,
        },
        auth: AuthConfig::None,
    }
}

fn header_value<'a>(spec: &'a RequestSpec, name: &str) -> Option<&'a str> {
    spec.headers
        .iter()
        .find(|h| h.key.eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str())
}

fn bearer(token: &str) -> AuthConfig {
    AuthConfig::Bearer {
        token: token.into(),
        prefix: "Bearer".into(),
    }
}

fn workspace() -> (tempfile::TempDir, PathBuf) {
    let dir = tempfile::tempdir().unwrap();
    let root = store::create_workspace(dir.path(), "WS").unwrap();
    (dir, root)
}

// ---------- providers ----------

#[test]
fn basic_auth_sets_an_encoded_authorization_header() {
    let mut s = spec("https://x.dev");
    apply_auth(
        &AuthConfig::Basic {
            username: "user".into(),
            password: "pass".into(),
        },
        &mut s,
    )
    .unwrap();
    assert_eq!(
        header_value(&s, "authorization"),
        Some("Basic dXNlcjpwYXNz")
    );
}

#[test]
fn basic_usernames_cannot_contain_colons() {
    let mut s = spec("https://x.dev");
    let auth = AuthConfig::Basic {
        username: "a:b".into(),
        password: "x".into(),
    };
    assert!(matches!(
        apply_auth(&auth, &mut s),
        Err(AppError::InvalidInput(_))
    ));
}

#[test]
fn bearer_uses_the_default_or_a_custom_prefix() {
    let mut s = spec("https://x.dev");
    apply_auth(&bearer(" abc "), &mut s).unwrap();
    assert_eq!(header_value(&s, "Authorization"), Some("Bearer abc"));

    let mut custom = spec("https://x.dev");
    apply_auth(
        &AuthConfig::Bearer {
            token: "abc".into(),
            prefix: "Token".into(),
        },
        &mut custom,
    )
    .unwrap();
    assert_eq!(header_value(&custom, "Authorization"), Some("Token abc"));

    let mut blank_prefix = spec("https://x.dev");
    apply_auth(
        &AuthConfig::Bearer {
            token: "abc".into(),
            prefix: "  ".into(),
        },
        &mut blank_prefix,
    )
    .unwrap();
    assert_eq!(
        header_value(&blank_prefix, "Authorization"),
        Some("Bearer abc")
    );
}

#[test]
fn empty_tokens_and_api_key_values_are_errors() {
    let mut s = spec("https://x.dev");
    assert!(apply_auth(&bearer("  "), &mut s).is_err());
    let no_value = AuthConfig::ApiKey {
        key: "X-Key".into(),
        value: String::new(),
        location: ApiKeyLocation::Header,
    };
    assert!(apply_auth(&no_value, &mut s).is_err());
    let no_name = AuthConfig::ApiKey {
        key: " ".into(),
        value: "v".into(),
        location: ApiKeyLocation::Header,
    };
    assert!(apply_auth(&no_name, &mut s).is_err());
    assert!(s.headers.is_empty());
}

#[test]
fn a_hand_written_authorization_header_wins() {
    let mut s = spec("https://x.dev");
    s.headers.push(KeyValue {
        key: "authorization".into(),
        value: "manual".into(),
        enabled: true,
    });
    apply_auth(&bearer("generated"), &mut s).unwrap();
    assert_eq!(s.headers.len(), 1);
    assert_eq!(s.headers[0].value, "manual");
}

#[test]
fn api_keys_go_in_a_header_or_the_query_string() {
    let mut header_spec = spec("https://x.dev/a");
    let in_header = AuthConfig::ApiKey {
        key: "X-Api-Key".into(),
        value: "k1".into(),
        location: ApiKeyLocation::Header,
    };
    apply_auth(&in_header, &mut header_spec).unwrap();
    assert_eq!(header_value(&header_spec, "x-api-key"), Some("k1"));
    assert_eq!(header_spec.url, "https://x.dev/a");

    let mut query_spec = spec("https://x.dev/a?page=2");
    let in_query = AuthConfig::ApiKey {
        key: "api_key".into(),
        value: "k 1&2".into(),
        location: ApiKeyLocation::Query,
    };
    apply_auth(&in_query, &mut query_spec).unwrap();
    assert_eq!(query_spec.url, "https://x.dev/a?page=2&api_key=k+1%262");
    assert!(query_spec.headers.is_empty());
}

#[test]
fn query_params_are_replaced_not_duplicated_and_the_rest_stays_raw() {
    assert_eq!(
        set_query_param("https://x.dev/a?k=old&x=%20y#top", "k", "new value"),
        "https://x.dev/a?k=new+value&x=%20y#top"
    );
    assert_eq!(
        set_query_param("https://x.dev/a", "k", "v"),
        "https://x.dev/a?k=v"
    );
    assert_eq!(
        set_query_param("https://x.dev/a?k=1&k=2", "k", "v"),
        "https://x.dev/a?k=v"
    );
}

// ---------- inheritance ----------

#[test]
fn inherit_uses_the_collections_auth_and_requests_can_override_it() {
    let (_dir, root) = workspace();
    let col = store::create_collection(&root, "API").unwrap();
    collection::set(&root, &col, bearer("t")).unwrap();
    let request_path = format!("{col}/x.request.json");

    assert_eq!(
        effective(Some(&root), Some(&request_path), &AuthConfig::Inherit),
        bearer("t")
    );
    assert_eq!(
        effective(Some(&root), Some(&request_path), &AuthConfig::None),
        AuthConfig::None
    );
    assert_eq!(
        effective(Some(&root), Some(&request_path), &bearer("own")),
        bearer("own")
    );

    // Unsaved requests, and no open workspace, have nothing to inherit.
    assert_eq!(
        effective(Some(&root), None, &AuthConfig::Inherit),
        AuthConfig::None
    );
    assert_eq!(
        effective(None, Some(&request_path), &AuthConfig::Inherit),
        AuthConfig::None
    );
}

#[test]
fn collection_auth_round_trips_and_none_removes_it_from_the_file() {
    let (_dir, root) = workspace();
    let col = store::create_collection(&root, "API").unwrap();
    let file = root.join(&col).join("collection.json");
    assert_eq!(collection::get(&root, &col).unwrap(), AuthConfig::None);

    let basic = AuthConfig::Basic {
        username: "me".into(),
        password: "{{pw}}".into(),
    };
    collection::set(&root, &col, basic.clone()).unwrap();
    assert_eq!(collection::get(&root, &col).unwrap(), basic);
    assert!(std::fs::read_to_string(&file).unwrap().contains("\"auth\""));

    collection::set(&root, &col, AuthConfig::None).unwrap();
    assert_eq!(collection::get(&root, &col).unwrap(), AuthConfig::None);
    assert!(!std::fs::read_to_string(&file).unwrap().contains("\"auth\""));
}

#[test]
fn collection_auth_rejects_paths_that_are_not_collections() {
    let (_dir, root) = workspace();
    assert!(collection::get(&root, "../elsewhere").is_err());
    assert!(collection::get(&root, "workspace.json").is_err());
    assert!(collection::set(&root, "collections", AuthConfig::None).is_err());
}

#[test]
fn files_and_history_entries_written_before_auth_existed_still_load() {
    let file: RequestFile = serde_json::from_str(
        r#"{"schemaVersion":1,"id":"x","name":"n","method":"GET","url":"u",
            "body":{"mode":"none"},"settings":{"timeoutMs":1,"followRedirects":true}}"#,
    )
    .unwrap();
    assert_eq!(file.auth, AuthConfig::Inherit);

    let spec: RequestSpec = serde_json::from_str(
        r#"{"method":"GET","url":"u","headers":[],"body":{"type":"none"},
            "settings":{"timeoutMs":1,"followRedirects":true}}"#,
    )
    .unwrap();
    assert_eq!(spec.auth, AuthConfig::Inherit);
}

// ---------- variables ----------

fn context(vars: &[(&str, &str)]) -> Context {
    let mut c = Context::new(|_| None);
    let variables: Vec<Variable> = vars
        .iter()
        .map(|(k, v)| Variable {
            key: (*k).into(),
            value: (*v).into(),
            enabled: true,
            secret: false,
        })
        .collect();
    c.add_layer(VariableScope::Environment, &variables);
    c
}

#[test]
fn variables_in_auth_fields_are_substituted() {
    let c = context(&[("user", "me"), ("pw", "s3cret")]);
    let resolved = substitute(
        &c,
        AuthConfig::Basic {
            username: "{{user}}".into(),
            password: "{{pw}}".into(),
        },
    )
    .unwrap();
    assert_eq!(
        resolved,
        AuthConfig::Basic {
            username: "me".into(),
            password: "s3cret".into()
        }
    );
    assert_eq!(substitute(&c, AuthConfig::None).unwrap(), AuthConfig::None);
}

#[test]
fn undefined_variables_in_auth_fields_fail_the_send() {
    let c = context(&[]);
    match substitute(&c, bearer("{{token}}")) {
        Err(AppError::InvalidInput(message)) => assert!(message.contains("token"), "{message}"),
        other => panic!("expected an error, got {other:?}"),
    }
}

// ---------- on the wire ----------

#[tokio::test]
async fn credentials_reach_the_server() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(header("authorization", "Basic dXNlcjpwYXNz"))
        .respond_with(ResponseTemplate::new(200).set_body_string("basic ok"))
        .mount(&server)
        .await;
    Mock::given(method("POST"))
        .and(query_param("api_key", "k1"))
        .respond_with(ResponseTemplate::new(200).set_body_string("key ok"))
        .mount(&server)
        .await;
    let state = HttpState::new().unwrap();

    let mut basic = spec(&server.uri());
    apply_auth(
        &AuthConfig::Basic {
            username: "user".into(),
            password: "pass".into(),
        },
        &mut basic,
    )
    .unwrap();
    assert_eq!(execute(&state, basic).await.unwrap().body, "basic ok");

    let mut keyed = spec(&server.uri());
    keyed.method = "POST".into();
    let auth = AuthConfig::ApiKey {
        key: "api_key".into(),
        value: "k1".into(),
        location: ApiKeyLocation::Query,
    };
    apply_auth(&auth, &mut keyed).unwrap();
    assert_eq!(execute(&state, keyed).await.unwrap().body, "key ok");
}
