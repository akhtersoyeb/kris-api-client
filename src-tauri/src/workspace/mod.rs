#![allow(dead_code)] // removed in R7, once everything is wired up

pub mod fs_util;
pub mod schema;
pub mod state;
pub mod store;
pub mod watcher;

pub use state::WorkspaceState;
pub use store::{Mutation, NodeEntry, NodeKind, WorkspaceInfo};
