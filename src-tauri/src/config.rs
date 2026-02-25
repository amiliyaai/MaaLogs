// 应用程序配置模块
// 本模块负责从环境变量中读取应用程序配置

use std::env;

// 检查指标收集是否启用
pub fn metrics_enabled() -> bool {
    env::var("MAALOGS_METRICS_ENABLED")
        .map(|value| {
            let value = value.to_ascii_lowercase();
            value == "1" || value == "true" || value == "yes"
        })
        .unwrap_or(true)
}

// 获取指标服务器端口号
pub fn metrics_port() -> u16 {
    env::var("MAALOGS_METRICS_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(9100)
}
