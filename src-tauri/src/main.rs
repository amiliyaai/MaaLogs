// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// MaaLogs 桌面应用程序入口文件
// 这是 Tauri 应用程序的入口点，负责启动桌面应用程序
// 在 Windows release 构建中会隐藏控制台窗口

fn main() {
    maalogs_lib::run(tauri::generate_context!())
}
