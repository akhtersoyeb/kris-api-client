use std::sync::Arc;

use crate::error::{AppError, AppResult};

/// Where secret values live. The real implementation is the OS keychain; tests use memory.
pub trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> AppResult<Option<String>>;
    fn set(&self, account: &str, value: &str) -> AppResult<()>;
    /// Deleting something that doesn't exist is not an error.
    fn delete(&self, account: &str) -> AppResult<()>;
}

/// `workspaceId/scopeId/key`: unique across workspaces, so two workspaces never share secrets.
pub fn account(workspace_id: &str, scope_id: &str, key: &str) -> String {
    format!("{workspace_id}/{scope_id}/{key}")
}

pub struct KeyringStore {
    service: String,
}

impl KeyringStore {
    pub fn new(service: &str) -> Self {
        Self {
            service: service.to_string(),
        }
    }

    fn entry(&self, account: &str) -> AppResult<keyring::Entry> {
        keyring::Entry::new(&self.service, account).map_err(keychain_error)
    }
}

fn keychain_error(e: keyring::Error) -> AppError {
    AppError::Keychain(e.to_string())
}

impl SecretStore for KeyringStore {
    fn get(&self, account: &str) -> AppResult<Option<String>> {
        match self.entry(account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(keychain_error(e)),
        }
    }

    fn set(&self, account: &str, value: &str) -> AppResult<()> {
        self.entry(account)?
            .set_password(value)
            .map_err(keychain_error)
    }

    fn delete(&self, account: &str) -> AppResult<()> {
        match self.entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(keychain_error(e)),
        }
    }
}

/// Managed Tauri state. `Arc` so a handle can move into blocking tasks.
pub struct SecretsState {
    pub store: Arc<dyn SecretStore>,
}

impl SecretsState {
    pub fn new(store: impl SecretStore + 'static) -> Self {
        Self {
            store: Arc::new(store),
        }
    }
}

#[cfg(test)]
#[derive(Default)]
pub struct MemoryStore {
    items: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[cfg(test)]
impl SecretStore for MemoryStore {
    fn get(&self, account: &str) -> AppResult<Option<String>> {
        Ok(self.items.lock().unwrap().get(account).cloned())
    }
    fn set(&self, account: &str, value: &str) -> AppResult<()> {
        self.items
            .lock()
            .unwrap()
            .insert(account.to_string(), value.to_string());
        Ok(())
    }
    fn delete(&self, account: &str) -> AppResult<()> {
        self.items.lock().unwrap().remove(account);
        Ok(())
    }
}
