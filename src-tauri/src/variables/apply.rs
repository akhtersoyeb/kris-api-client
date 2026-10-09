use super::resolver::Context;
use crate::error::{AppError, AppResult};
use crate::http_engine::{KeyValue, RequestBody, RequestSpec};

pub struct Applied {
    pub spec: RequestSpec,
    /// Undefined variables found in headers and bodies (sent as written).
    pub unresolved: Vec<String>,
}

struct Collector<'a> {
    context: &'a Context,
    unresolved: Vec<String>,
}

impl Collector<'_> {
    fn sub(&mut self, text: &str) -> String {
        let r = self.context.resolve(text);
        self.unresolved.extend(r.unresolved);
        self.unresolved.extend(r.cyclic);
        r.text
    }

    /// Disabled rows aren't sent, so they're left alone (and don't trigger warnings).
    fn rows(&mut self, rows: Vec<KeyValue>) -> Vec<KeyValue> {
        rows.into_iter()
            .map(|row| {
                if row.enabled {
                    KeyValue {
                        key: self.sub(&row.key),
                        value: self.sub(&row.value),
                        enabled: true,
                    }
                } else {
                    row
                }
            })
            .collect()
    }
}

pub fn apply(context: &Context, spec: RequestSpec) -> AppResult<Applied> {
    let mut c = Collector {
        context,
        unresolved: Vec::new(),
    };

    // The URL can't work with missing variables, so fail early with a useful message.
    let url = c.sub(&spec.url);
    if !c.unresolved.is_empty() {
        c.unresolved.sort();
        c.unresolved.dedup();
        return Err(AppError::InvalidInput(format!(
            "The URL uses variables that aren't defined: {}. Select an environment or define them first.",
            c.unresolved.join(", ")
        )));
    }

    let headers = c.rows(spec.headers);
    let body = match spec.body {
        RequestBody::None => RequestBody::None,
        RequestBody::Json { content } => RequestBody::Json {
            content: c.sub(&content),
        },
        RequestBody::Raw { content, mime } => RequestBody::Raw {
            content: c.sub(&content),
            mime,
        },
        RequestBody::FormUrlEncoded { fields } => RequestBody::FormUrlEncoded {
            fields: c.rows(fields),
        },
    };

    let mut unresolved = c.unresolved;
    unresolved.sort();
    unresolved.dedup();
    Ok(Applied {
        spec: RequestSpec {
            method: spec.method,
            url,
            headers,
            body,
            settings: spec.settings,
        },
        unresolved,
    })
}
