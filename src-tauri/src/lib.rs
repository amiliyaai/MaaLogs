// MaaLogs 应用程序核心库
// 本文件定义了 Tauri 应用程序的主要逻辑，包括：
// - Tauri 命令注册和处理
// - 插件初始化
// - 应用程序生命周期管理

mod config;
mod metrics;

use std::time::Instant;

// 问候命令 - 接收一个名字并返回问候语
#[tauri::command]
fn greet(name: &str) -> String {
    let start = Instant::now();
    let result = format!("Hello, {}! You've been greeted from Rust!", name);
    metrics::observe_command("greet", "success", start.elapsed().as_secs_f64());
    result
}

// 打开开发者工具命令
#[tauri::command]
fn open_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    let start = Instant::now();
    window.open_devtools();
    metrics::observe_command("open_devtools", "success", start.elapsed().as_secs_f64());
    Ok(())
}

// 获取应用程序版本号命令
#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> String {
    let start = Instant::now();
    let result = app.package_info().version.to_string();
    metrics::observe_command("get_app_version", "success", start.elapsed().as_secs_f64());
    result
}

// 应用程序运行入口 - 配置并启动 Tauri 应用程序
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(context: tauri::Context<tauri::Wry>) {
    tauri::Builder::default()
        .setup(|_app| {
            if config::metrics_enabled() {
                metrics::start_metrics_server(config::metrics_port());
            }
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, open_devtools, get_app_version])
        .run(context)
        .expect("error while running tauri application");
}
