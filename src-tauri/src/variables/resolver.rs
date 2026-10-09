use std::collections::HashMap;

use super::types::{Resolution, Variable, VariableScope};

const MAX_DEPTH: usize = 10;

#[derive(Debug, Clone)]
pub struct Entry {
    pub value: String,
    pub scope: VariableScope,
    pub secret: bool,
}

/// Resolves built-in dynamic variables such as `$uuid`. A plain fn so tests can use a deterministic one.
pub type BuiltinFn = fn(&str) -> Option<String>;

pub struct Context {
    vars: HashMap<String, Entry>,
    builtin: BuiltinFn,
}

/// Variable names: letters, digits and `_ - . $`. Anything else (spaces, braces, ...) is left as literal text,
/// so template syntax inside a JSON body isn't mistaken for a variable.
fn is_valid_name(name: &str) -> bool {
    !name.is_empty()
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || matches!(c, '_' | '-' | '.' | '$'))
}

impl Context {
    pub fn new(builtin: BuiltinFn) -> Self {
        Self {
            vars: HashMap::new(),
            builtin,
        }
    }

    /// Later layers override earlier ones: add globals first, then the collection, then the environment.
    pub fn add_layer(&mut self, scope: VariableScope, variables: &[Variable]) {
        for v in variables
            .iter()
            .filter(|v| v.enabled && !v.key.trim().is_empty())
        {
            self.vars.insert(
                v.key.trim().to_string(),
                Entry {
                    value: v.value.clone(),
                    scope,
                    secret: v.secret,
                },
            );
        }
    }

    pub fn entries(&self) -> impl Iterator<Item = (&String, &Entry)> {
        self.vars.iter()
    }

    pub fn resolve(&self, text: &str) -> Resolution {
        let mut resolution = Resolution::default();
        let expanded = self.expand(text, &mut Vec::new(), &mut resolution);
        resolution.text = expanded;
        resolution.unresolved.sort();
        resolution.unresolved.dedup();
        resolution.cyclic.sort();
        resolution.cyclic.dedup();
        resolution
    }

    fn expand(&self, text: &str, stack: &mut Vec<String>, out: &mut Resolution) -> String {
        let mut result = String::with_capacity(text.len());
        let mut rest = text;
        while let Some(start) = rest.find("{{") {
            result.push_str(&rest[..start]);
            let after = &rest[start + 2..];
            match after.find("}}") {
                Some(end) if is_valid_name(after[..end].trim()) => {
                    let raw = &rest[start..start + 2 + end + 2];
                    result.push_str(&self.expand_token(after[..end].trim(), raw, stack, out));
                    rest = &after[end + 2..];
                }
                _ => {
                    result.push_str("{{");
                    rest = after;
                }
            }
        }
        result.push_str(rest);
        result
    }

    fn expand_token(
        &self,
        name: &str,
        raw: &str,
        stack: &mut Vec<String>,
        out: &mut Resolution,
    ) -> String {
        if name.starts_with('$') {
            return match (self.builtin)(name) {
                Some(value) => value,
                None => {
                    out.unresolved.push(name.to_string());
                    raw.to_string()
                }
            };
        }
        if stack.iter().any(|s| s == name) || stack.len() >= MAX_DEPTH {
            out.cyclic.push(name.to_string());
            return raw.to_string();
        }
        match self.vars.get(name) {
            Some(entry) => {
                stack.push(name.to_string());
                let value = self.expand(&entry.value, stack, out);
                stack.pop();
                value
            }
            None => {
                out.unresolved.push(name.to_string());
                raw.to_string()
            }
        }
    }
}
