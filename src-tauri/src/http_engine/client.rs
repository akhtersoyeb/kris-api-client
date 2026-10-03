use reqwest::{redirect::Policy, Client};

use crate::error::{AppError, AppResult};

/// Two shared clients, because the redirect policy is a client-level setting.
/// Sharing them keeps connection pooling and TLS sessions alive between requests.
pub struct HttpState {
    follow: Client,
    no_follow: Client,
}

impl HttpState {
    pub fn new() -> AppResult<Self> {
        Ok(Self {
            follow: build(Policy::limited(10))?,
            no_follow: build(Policy::none())?,
        })
    }

    pub fn client(&self, follow_redirects: bool) -> &Client {
        if follow_redirects {
            &self.follow
        } else {
            &self.no_follow
        }
    }
}

fn build(policy: Policy) -> AppResult<Client> {
    Client::builder()
        .redirect(policy)
        .user_agent(concat!("APIClient/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| AppError::Internal(format!("failed to build http client: {e}")))
}
