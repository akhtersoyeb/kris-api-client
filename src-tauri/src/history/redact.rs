use super::settings::HistorySettings;
use crate::auth::AuthConfig;
use crate::http_engine::{KeyValue, RequestBody, RequestSpec};

pub const MASK: &str = "[redacted]";

/// Header, query and form names whose values are treated as secrets.
pub fn is_sensitive_name(name: &str) -> bool {
    const PARTS: [&str; 9] = [
        "authorization",
        "cookie",
        "token",
        "secret",
        "password",
        "passwd",
        "apikey",
        "signature",
        "credential",
    ];
    let normalized: String = name
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect::<String>()
        .to_lowercase();
    PARTS.iter().any(|p| normalized.contains(p))
        || matches!(normalized.as_str(), "key" | "sig" | "pwd" | "auth")
}

fn strip_variables(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("{{") {
        out.push_str(&rest[..start]);
        match rest[start + 2..].find("}}") {
            Some(end) => rest = &rest[start + 2 + end + 2..],
            None => {
                out.push_str(&rest[start..]); // a lone "{{" is ordinary text
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

/// A value holds no literal secret if all that's left after removing {{variables}} is an auth scheme word.
/// `Bearer {{token}}` is kept; `Bearer abc123` is not.
pub fn is_safe_value(value: &str) -> bool {
    matches!(
        strip_variables(value).trim().to_lowercase().as_str(),
        "" | "bearer" | "basic" | "token" | "digest"
    )
}

fn redact_rows(rows: &[KeyValue]) -> Vec<KeyValue> {
    rows.iter()
        .map(|row| {
            if is_sensitive_name(&row.key) && !is_safe_value(&row.value) {
                KeyValue {
                    value: MASK.to_string(),
                    ..row.clone()
                }
            } else {
                row.clone()
            }
        })
        .collect()
}

fn redact_userinfo(base: &str) -> String {
    let Some(scheme_end) = base.find("://") else {
        return base.to_string();
    };
    let authority_start = scheme_end + 3;
    let rest = &base[authority_start..];
    let authority_end = rest.find('/').unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    match authority.rfind('@') {
        Some(at) if !is_safe_value(&authority[..at].replace(':', "")) => format!(
            "{}{}@{}{}",
            &base[..authority_start],
            MASK,
            &authority[at + 1..],
            &rest[authority_end..]
        ),
        _ => base.to_string(),
    }
}

pub fn redact_url(url: &str) -> String {
    let (before_hash, hash) = match url.find('#') {
        Some(i) => (&url[..i], &url[i..]),
        None => (url, ""),
    };
    let (base, query) = match before_hash.find('?') {
        Some(i) => (&before_hash[..i], Some(&before_hash[i + 1..])),
        None => (before_hash, None),
    };
    let base = redact_userinfo(base);
    let query = query.map(|q| {
        q.split('&')
            .map(|pair| match pair.split_once('=') {
                Some((name, value)) if is_sensitive_name(name) && !is_safe_value(value) => {
                    format!("{name}={MASK}")
                }
                _ => pair.to_string(),
            })
            .collect::<Vec<_>>()
            .join("&")
    });
    match query {
        Some(q) => format!("{base}?{q}{hash}"),
        None => format!("{base}{hash}"),
    }
}

/// What actually gets written to the history database.
pub fn for_history(spec: &RequestSpec, settings: &HistorySettings) -> RequestSpec {
    let mut out = spec.clone();
    if settings.redact_secrets {
        out.url = redact_url(&out.url);
        out.headers = redact_rows(&out.headers);
        if let RequestBody::FormUrlEncoded { fields } = &mut out.body {
            *fields = redact_rows(fields);
        }
        out.auth = redact_auth(&out.auth);
    }
    if !settings.store_bodies {
        out.body = match out.body {
            RequestBody::None => RequestBody::None,
            RequestBody::Json { .. } => RequestBody::Json {
                content: String::new(),
            },
            RequestBody::Raw { mime, .. } => RequestBody::Raw {
                content: String::new(),
                mime,
            },
            RequestBody::FormUrlEncoded { fields } => RequestBody::FormUrlEncoded {
                fields: fields
                    .into_iter()
                    .map(|f| KeyValue {
                        value: String::new(),
                        ..f
                    })
                    .collect(),
            },
        };
    }
    out
}

fn mask_literal(value: &str) -> String {
    if is_safe_value(value) {
        value.to_string() // empty, or nothing but {{variables}} and a scheme word
    } else {
        MASK.to_string()
    }
}

pub fn redact_auth(auth: &AuthConfig) -> AuthConfig {
    match auth {
        AuthConfig::Basic { username, password } => AuthConfig::Basic {
            username: username.clone(),
            password: mask_literal(password),
        },
        AuthConfig::Bearer { token, prefix } => AuthConfig::Bearer {
            token: mask_literal(token),
            prefix: prefix.clone(),
        },
        AuthConfig::ApiKey {
            key,
            value,
            location,
        } => AuthConfig::ApiKey {
            key: key.clone(),
            value: mask_literal(value),
            location: *location,
        },
        other => other.clone(),
    }
}
