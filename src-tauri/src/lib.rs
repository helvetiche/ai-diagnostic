mod network;
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
            resources::spawn_sampler(app.handle().clone(), state.clone());
            thermal::spawn_sampler(app.handle().clone(), thermal_state, state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resources::resource_history,
            resources::get_processes,
            resources::set_resource_streaming,
            thermal::thermal_history,
            thermal::recheck_thermals,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
