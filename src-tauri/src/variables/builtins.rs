use std::time::{SystemTime, UNIX_EPOCH};

/// Names offered by the UI for autocomplete and highlighting.
pub const NAMES: [&str; 3] = ["$uuid", "$timestamp", "$randomInt"];

/// Evaluated freshly at every use, so two `{{$uuid}}` in one request differ.
pub fn dynamic_value(name: &str) -> Option<String> {
    match name {
        "$uuid" => Some(uuid::Uuid::new_v4().to_string()),
        "$timestamp" => {
            let secs = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some(secs.to_string())
        }
        // 0..=1000, like Postman. A v4 UUID is a convenient source of randomness without another crate.
        "$randomInt" => Some((uuid::Uuid::new_v4().as_u128() % 1001).to_string()),
        _ => None,
    }
}
