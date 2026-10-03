use std::time::Duration;

use tokio_util::sync::CancellationToken;
use wiremock::matchers::{body_string, header, method, path, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::*;
use crate::error::AppError;

fn spec(verb: &str, url: String) -> RequestSpec {
    RequestSpec {
        method: verb.into(),
        url,
        headers: vec![],
        body: RequestBody::None,
        settings: RequestSettings {
            timeout_ms: 5_000,
            follow_redirects: true,
        },
    }
}

fn kv(key: &str, value: &str, enabled: bool) -> KeyValue {
    KeyValue {
        key: key.into(),
        value: value.into(),
        enabled,
    }
}

#[tokio::test]
async fn get_sends_query_and_headers() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/hello"))
        .and(query_param("a", "1"))
        .and(header("x-test", "yes"))
        .respond_with(ResponseTemplate::new(200).set_body_string("hi"))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let mut s = spec("GET", format!("{}/hello?a=1", server.uri()));
    s.headers = vec![kv("X-Test", "yes", true), kv("X-Off", "no", false)];

    let res = execute(&state, s).await.unwrap();
    assert_eq!(res.status, 200);
    assert_eq!(res.body, "hi");
    assert_eq!(res.size_bytes, 2);
}

#[tokio::test]
async fn json_body_sets_content_type() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(header("content-type", "application/json"))
        .and(body_string(r#"{"a":1}"#))
        .respond_with(ResponseTemplate::new(201))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let mut s = spec("POST", server.uri());
    s.body = RequestBody::Json {
        content: r#"{"a":1}"#.into(),
    };

    assert_eq!(execute(&state, s).await.unwrap().status, 201);
}

#[tokio::test]
async fn form_body_is_urlencoded_and_skips_disabled_fields() {
    let server = MockServer::start().await;
    Mock::given(method("POST"))
        .and(header("content-type", "application/x-www-form-urlencoded"))
        .and(body_string("a=1&b=two+words"))
        .respond_with(ResponseTemplate::new(200))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let mut s = spec("POST", server.uri());
    s.body = RequestBody::FormUrlEncoded {
        fields: vec![
            kv("a", "1", true),
            kv("skip", "x", false),
            kv("b", "two words", true),
        ],
    };

    assert_eq!(execute(&state, s).await.unwrap().status, 200);
}

#[tokio::test]
async fn redirects_are_followed_or_not() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/old"))
        .respond_with(ResponseTemplate::new(302).insert_header("location", "/new"))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path("/new"))
        .respond_with(ResponseTemplate::new(200).set_body_string("arrived"))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let url = format!("{}/old", server.uri());

    let followed = execute(&state, spec("GET", url.clone())).await.unwrap();
    assert_eq!(followed.status, 200);
    assert_eq!(followed.body, "arrived");
    assert!(followed.final_url.ends_with("/new"));

    let mut s = spec("GET", url);
    s.settings.follow_redirects = false;
    let not_followed = execute(&state, s).await.unwrap();
    assert_eq!(not_followed.status, 302);
    assert!(not_followed.headers.iter().any(|h| h.name == "location"));
}

#[tokio::test]
async fn slow_response_times_out() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_millis(1_500)))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let mut s = spec("GET", server.uri());
    s.settings.timeout_ms = 100;

    let err = execute(&state, s).await.unwrap_err();
    assert!(matches!(err, AppError::Timeout(_)), "got {err:?}");
}

#[tokio::test]
async fn request_can_be_cancelled() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(5)))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let token = CancellationToken::new();
    let trigger = token.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        trigger.cancel();
    });

    let err = execute_cancellable(&state, spec("GET", server.uri()), &token)
        .await
        .unwrap_err();
    assert!(matches!(err, AppError::Cancelled(_)), "got {err:?}");
}

#[tokio::test]
async fn binary_bodies_are_base64() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .respond_with(ResponseTemplate::new(200).set_body_bytes(vec![0xff, 0xfe, 0x00]))
        .mount(&server)
        .await;

    let state = HttpState::new().unwrap();
    let res = execute(&state, spec("GET", server.uri())).await.unwrap();
    assert_eq!(res.body_encoding, BodyEncoding::Base64);
    assert_eq!(res.body, "//4A");
}

#[tokio::test]
async fn bad_urls_are_rejected() {
    let state = HttpState::new().unwrap();
    for url in ["", "http://", "ftp://example.com"] {
        let err = execute(&state, spec("GET", url.into())).await.unwrap_err();
        assert!(
            matches!(err, AppError::InvalidInput(_)),
            "{url:?} gave {err:?}"
        );
    }
}
