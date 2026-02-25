// 应用程序指标收集模块
// 本模块提供 Prometheus 指标收集功能

use once_cell::sync::Lazy;
use prometheus::{
    Encoder, HistogramOpts, HistogramVec, IntCounterVec, IntGauge, Opts, TextEncoder,
};
use std::net::SocketAddr;
use std::thread;
use tiny_http::{Header, Response, Server};

// 全局指标单例
static METRICS: Lazy<Metrics> = Lazy::new(Metrics::new);

// 应用程序指标结构体
pub struct Metrics {
    #[allow(dead_code)]
    command_total: IntCounterVec,
    #[allow(dead_code)]
    command_duration: HistogramVec,
    #[allow(dead_code)]
    app_up: IntGauge,
}

impl Metrics {
    // 创建新的指标实例
    fn new() -> Self {
        let command_total = IntCounterVec::new(
            Opts::new("tauri_command_total", "Tauri command total"),
            &["command", "status"][..],
        )
        .expect("counter");
        let command_duration = HistogramVec::new(
            HistogramOpts::new("tauri_command_duration_seconds", "Tauri command duration"),
            &["command"][..],
        )
        .expect("histogram");
        let app_up = IntGauge::new("tauri_app_up", "Tauri app up").expect("gauge");
        prometheus::register(Box::new(command_total.clone())).expect("register counter");
        prometheus::register(Box::new(command_duration.clone())).expect("register histogram");
        prometheus::register(Box::new(app_up.clone())).expect("register gauge");
        app_up.set(1);
        Self {
            command_total,
            command_duration,
            app_up,
        }
    }
}

// 记录命令执行指标
pub fn observe_command(command: &str, status: &str, duration_seconds: f64) {
    METRICS
        .command_total
        .with_label_values(&[command, status])
        .inc();
    METRICS
        .command_duration
        .with_label_values(&[command])
        .observe(duration_seconds);
}

// 启动指标 HTTP 服务器
pub fn start_metrics_server(port: u16) {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    thread::spawn(move || {
        let server = match Server::http(address) {
            Ok(server) => server,
            Err(_) => return,
        };
        let encoder = TextEncoder::new();
        for request in server.incoming_requests() {
            if request.url() != "/metrics" {
                let response = Response::from_string("not found").with_status_code(404);
                let _ = request.respond(response);
                continue;
            }
            let metric_families = prometheus::gather();
            let mut buffer = Vec::new();
            if encoder.encode(&metric_families, &mut buffer).is_err() {
                let response = Response::from_string("encode error").with_status_code(500);
                let _ = request.respond(response);
                continue;
            }
            let response = Response::from_data(buffer).with_header(
                Header::from_bytes(&b"Content-Type"[..], &b"text/plain; version=0.0.4; charset=utf-8"[..])
                    .unwrap(),
            );
            let _ = request.respond(response);
        }
    });
}
