use std::collections::HashMap;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;

use reqwest::{redirect::Policy, Client};

use crate::error::{AppError, AppResult};

/// Two shared clients, because the redirect policy is a client-level setting.
/// Sharing them keeps connection pooling and TLS sessions alive between requests.
pub struct HttpState {
    follow: Client,
    no_follow: Client,
    inflight: Mutex<HashMap<String, CancellationToken>>,
}

impl HttpState {
    pub fn new() -> AppResult<Self> {
        Ok(Self {
            follow: build(Policy::limited(10))?,
            no_follow: build(Policy::none())?,
            inflight: Mutex::new(HashMap::new()),
        })
    }

    pub fn client(&self, follow_redirects: bool) -> &Client {
        if follow_redirects {
            &self.follow
        } else {
            &self.no_follow
        }
    }

    pub fn register(&self, request_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.lock().insert(request_id.to_string(), token.clone());
        token
    }

    pub fn unregister(&self, request_id: &str) {
        self.lock().remove(request_id);
    }

    /// Returns true if a request with this id was in flight.
    pub fn cancel(&self, request_id: &str) -> bool {
        match self.lock().remove(request_id) {
            Some(token) => {
                token.cancel();
                true
            }
            None => false,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, CancellationToken>> {
        self.inflight.lock().unwrap_or_else(|e| e.into_inner())
    }
}

fn build(policy: Policy) -> AppResult<Client> {
    Client::builder()
        .redirect(policy)
        .user_agent(concat!("APIClient/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))
}
