use std::error::Error as StdError;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE};
use reqwest::Method;
use url::Url;

use super::client::HttpState;
use super::types::*;
use crate::error::{AppError, AppResult};

use tokio_util::sync::CancellationToken;

/// Bodies larger than this are cut off. Streaming to disk arrives in Phase 7.
const MAX_BODY_BYTES: usize = 50 * 1024 * 1024;

pub async fn execute(state: &HttpState, spec: RequestSpec) -> AppResult<ResponseSpec> {
    let url = build_url(&spec.url)?;
    let method = Method::from_bytes(spec.method.trim().to_uppercase().as_bytes())
        .map_err(|_| AppError::InvalidInput(format!("invalid HTTP method: {}", spec.method)))?;
    let mut headers = build_headers(&spec.headers)?;

    let client = state.client(spec.settings.follow_redirects);
    let mut request = client.request(method, url);

    if let Some((content, mime)) = encode_body(&spec.body) {
        if !headers.contains_key(CONTENT_TYPE) {
            let value = HeaderValue::from_str(&mime)
                .map_err(|_| AppError::InvalidInput(format!("invalid content type: {mime}")))?;
            headers.insert(CONTENT_TYPE, value);
        }
        request = request.body(content);
    }
    if spec.settings.timeout_ms > 0 {
        // Applies to the whole exchange, including reading the body.
        request = request.timeout(Duration::from_millis(u64::from(spec.settings.timeout_ms)));
    }

    let started = Instant::now();
    let mut response = request.headers(headers).send().await.map_err(map_error)?;

    let status = response.status();
    let http_version = format!("{:?}", response.version());
    let final_url = response.url().to_string();
    let response_headers = collect_headers(response.headers());
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let mut bytes: Vec<u8> = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = response.chunk().await.map_err(map_error)? {
        if bytes.len() + chunk.len() > MAX_BODY_BYTES {
            let room = MAX_BODY_BYTES - bytes.len();
            bytes.extend_from_slice(&chunk[..room]);
            truncated = true;
            break;
        }
        bytes.extend_from_slice(&chunk);
    }
    let duration_ms = u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX);
    let size_bytes = u32::try_from(bytes.len()).unwrap_or(u32::MAX);

    let (body, body_encoding) = if truncated {
        (
            String::from_utf8_lossy(&bytes).into_owned(),
            BodyEncoding::Utf8,
        )
    } else {
        match String::from_utf8(bytes) {
            Ok(text) => (text, BodyEncoding::Utf8),
            Err(e) => (STANDARD.encode(e.into_bytes()), BodyEncoding::Base64),
        }
    };

    Ok(ResponseSpec {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        http_version,
        headers: response_headers,
        body,
        body_encoding,
        body_truncated: truncated,
        size_bytes,
        duration_ms,
        final_url,
        content_type,
        unresolved: Vec::new(),
    })
}

fn build_url(raw: &str) -> AppResult<Url> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err(AppError::InvalidInput("the URL is empty".into()));
    }
    // Like curl and Postman: a bare "localhost:3000/x" means http://.
    let with_scheme = if raw.contains("://") {
        raw.to_string()
    } else {
        format!("http://{raw}")
    };
    let url = Url::parse(&with_scheme)
        .map_err(|e| AppError::InvalidInput(format!("invalid URL: {e}")))?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(AppError::InvalidInput(
            "only http and https URLs are supported".into(),
        ));
    }
    Ok(url)
}

fn build_headers(entries: &[KeyValue]) -> AppResult<HeaderMap> {
    let mut map = HeaderMap::new();
    for entry in entries
        .iter()
        .filter(|e| e.enabled && !e.key.trim().is_empty())
    {
        let name = HeaderName::from_bytes(entry.key.trim().as_bytes())
            .map_err(|_| AppError::InvalidInput(format!("invalid header name: {}", entry.key)))?;
        let value = HeaderValue::from_bytes(entry.value.as_bytes()).map_err(|_| {
            AppError::InvalidInput(format!("invalid value for header {}", entry.key))
        })?;
        map.append(name, value);
    }
    Ok(map)
}

/// Returns (content, default content type).
fn encode_body(body: &RequestBody) -> Option<(String, String)> {
    match body {
        RequestBody::None => None,
        RequestBody::Json { content } => Some((content.clone(), "application/json".into())),
        RequestBody::Raw { content, mime } => Some((content.clone(), mime.clone())),
        RequestBody::FormUrlEncoded { fields } => {
            let mut form = url::form_urlencoded::Serializer::new(String::new());
            for f in fields.iter().filter(|f| f.enabled && !f.key.is_empty()) {
                form.append_pair(&f.key, &f.value);
            }
            Some((form.finish(), "application/x-www-form-urlencoded".into()))
        }
    }
}

fn collect_headers(map: &HeaderMap) -> Vec<HeaderEntry> {
    // Iterating (not get()) keeps repeated headers such as Set-Cookie.
    map.iter()
        .map(|(name, value)| HeaderEntry {
            name: name.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).into_owned(),
        })
        .collect()
}

fn map_error(e: reqwest::Error) -> AppError {
    let detail = error_chain(&e);
    if e.is_timeout() {
        AppError::Timeout(detail)
    } else {
        AppError::Network(detail)
    }
}

/// reqwest's top-level message is vague ("error sending request"); the causes say why.
fn error_chain(e: &dyn StdError) -> String {
    let mut message = e.to_string();
    let mut source = e.source();
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

/// Dropping the `execute` future aborts the connection and any body download.
pub async fn execute_cancellable(
    state: &HttpState,
    spec: RequestSpec,
    token: &CancellationToken,
) -> AppResult<ResponseSpec> {
    tokio::select! {
        _ = token.cancelled() => Err(AppError::Cancelled("request cancelled".into())),
        result = execute(state, spec) => result,
    }
}
