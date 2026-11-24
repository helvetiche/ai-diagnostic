mod configure;
mod llm;
mod logs;
mod memory;
mod network;
mod power;
mod resources;
mod thermal;

use std::sync::Arc;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = Arc::new(resources::ResourceState::new());
            let thermal_state = Arc::new(thermal::ThermalState::new());
            app.manage(state.clone());
            app.manage(thermal_state.clone());
            let memory_state = memory::db::open(app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            app.manage(memory_state);
            resources::spawn_sampler(app.handle().clone(), state.clone());
            thermal::spawn_sampler(app.handle().clone(), thermal_state, state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            configure::list_power_plans,
            configure::set_power_plan,
            configure::get_display_brightness,
            configure::set_display_brightness,
            configure::get_game_mode,
            configure::set_game_mode,
            configure::get_hags,
            configure::set_hags,
            configure::get_windows_updates_paused,
            configure::set_windows_updates_paused,
            configure::get_startup_apps,
            configure::disable_startup_app,
            configure::enable_startup_app,
            configure::toggle_startup_file,
            configure::get_power_timeouts,
            configure::set_power_timeouts,
            configure::get_fast_startup,
            configure::set_fast_startup,
            resources::resource_history,
            resources::get_processes,
            resources::set_resource_streaming,
            logs::logs_bitlocker,
            logs::logs_snapshot,
            power::power_history,
            thermal::thermal_history,
            thermal::recheck_thermals,
            memory::commands::memory_conversation_create,
            memory::commands::memory_conversation_list,
            memory::commands::memory_conversation_get,
            memory::commands::memory_conversation_delete,
            memory::commands::memory_conversation_archive,
            memory::commands::memory_conversation_touch,
            memory::commands::memory_message_append,
            memory::commands::memory_message_list,
            memory::commands::memory_message_delete,
            memory::commands::memory_fact_upsert,
            memory::commands::memory_fact_list,
            memory::commands::memory_fact_delete,
            memory::commands::memory_fact_clear,
            memory::commands::memory_search_index_upsert,
            memory::commands::memory_search_index_delete,
            memory::commands::memory_search,
            memory::commands::memory_stats,
            memory::commands::memory_clear_all,
            llm::openrouter_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
