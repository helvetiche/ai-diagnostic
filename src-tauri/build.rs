fn main() {
    println!("cargo:rerun-if-changed=app.manifest");

    let windows =
        tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest"));
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .app_manifest(tauri_build::AppManifest::new().commands(&[
            "list_power_plans",
            "set_power_plan",
            "get_display_brightness",
            "set_display_brightness",
            "get_game_mode",
            "set_game_mode",
            "get_hags",
            "set_hags",
            "get_windows_updates_paused",
            "set_windows_updates_paused",
            "get_startup_apps",
            "disable_startup_app",
            "enable_startup_app",
            "toggle_startup_file",
            "get_power_timeouts",
            "set_power_timeouts",
            "get_fast_startup",
            "set_fast_startup",
            "resource_history",
            "get_processes",
            "set_resource_streaming",
            "logs_bitlocker",
            "logs_snapshot",
            "power_history",
            "thermal_history",
            "recheck_thermals",
            "memory_conversation_create",
            "memory_conversation_list",
            "memory_conversation_get",
            "memory_conversation_delete",
            "memory_conversation_archive",
            "memory_conversation_touch",
            "memory_message_append",
            "memory_message_list",
            "memory_message_delete",
            "memory_fact_upsert",
            "memory_fact_list",
            "memory_fact_delete",
            "memory_fact_clear",
            "memory_search_index_upsert",
            "memory_search_index_delete",
            "memory_search",
            "memory_stats",
            "memory_clear_all",
            "openrouter_chat",
        ]));

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}