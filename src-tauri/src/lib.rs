mod commands;
mod error;
mod http_engine;
mod workspace;

#[cfg(debug_assertions)]
use specta_typescript::Typescript;
use tauri_specta::{collect_commands, Builder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::ping::ping,
        commands::http::send_request,
        commands::http::cancel_request,
        commands::workspace::open_workspace,
        commands::workspace::create_workspace,
        commands::workspace::close_workspace,
        commands::workspace::refresh_workspace,
        commands::workspace::create_collection,
        commands::workspace::create_folder,
        commands::workspace::create_request,
        commands::workspace::rename_node,
        commands::workspace::duplicate_node,
        commands::workspace::delete_node,
        commands::workspace::load_request,
        commands::workspace::save_request,
        commands::workspace::move_node,
        commands::workspace::list_recent_workspaces,
        commands::workspace::forget_recent_workspace,
        commands::workspace::save_session,
        commands::workspace::load_session,
    ]);

    // Regenerate TypeScript bindings on every dev run. The file is committed.
    #[cfg(debug_assertions)]
    builder
        .export(
            Typescript::default().header("// @ts-nocheck\n"),
            "../src/lib/bindings.ts",
        )
        .expect("failed to export typescript bindings");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(http_engine::HttpState::new().expect("failed to initialise http client"))
        .manage(workspace::WorkspaceState::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
