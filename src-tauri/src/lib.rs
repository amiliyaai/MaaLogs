// MaaLogs 应用程序核心库
// 本文件定义了 Tauri 应用程序的主要逻辑，包括：
// - Tauri 命令注册和处理
// - 插件初始化
// - 应用程序生命周期管理

mod config;
mod metrics;

use std::fs;
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

#[derive(serde::Serialize)]
struct PngFileInfo {
    filename: String,
    path: String,
}

#[tauri::command]
fn list_png_files(dir_path: String) -> Result<Vec<PngFileInfo>, String> {
    let start = Instant::now();
    let mut result: Vec<PngFileInfo> = Vec::new();

    fn scan_dir(dir: &std::path::Path, result: &mut Vec<PngFileInfo>) {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    scan_dir(&path, result);
                } else if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().to_lowercase() == "png" {
                        if let Some(filename) = path.file_name() {
                            result.push(PngFileInfo {
                                filename: filename.to_string_lossy().to_string(),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    let path = std::path::Path::new(&dir_path);
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    scan_dir(path, &mut result);
    metrics::observe_command("list_png_files", "success", start.elapsed().as_secs_f64());
    Ok(result)
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet, open_devtools, get_app_version, list_png_files])
        .run(context)
        .expect("error while running tauri application");
}
