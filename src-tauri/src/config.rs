use once_cell::sync::Lazy;
use serde::Deserialize;
use std::path::{Path, PathBuf};

/// 内网地址、账号口令等一律不进源码，只读本地配置。
/// 查找顺序：
/// 1) 环境变量 OPEN_LOCAL_LINK_CONFIG
/// 2) 当前工作目录 open-local-link.config.json
/// 3) 可执行文件同目录 open-local-link.config.json
/// 4) 工程根目录 open-local-link.config.json（开发时）
#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub pc_list_url: String,
    pub wake_url_template: String,
    pub register_url_template: String,
    pub relay_host: String,
    pub relay_port: u16,
    pub rdp_username: String,
    pub rdp_password: String,
    pub welcome_text: String,
    pub brand_title: String,
    pub brand_subtitle: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            pc_list_url: String::new(),
            wake_url_template: String::new(),
            register_url_template: String::new(),
            relay_host: String::new(),
            relay_port: 0,
            rdp_username: String::new(),
            rdp_password: String::new(),
            welcome_text: "欢迎使用本机链接服务".into(),
            brand_title: "打开本地链接服务".into(),
            brand_subtitle: "本机配对网关".into(),
        }
    }
}

pub static CONFIG: Lazy<AppConfig> = Lazy::new(load);

fn candidate_paths() -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Ok(p) = std::env::var("OPEN_LOCAL_LINK_CONFIG") {
        v.push(PathBuf::from(p));
    }
    v.push(PathBuf::from("open-local-link.config.json"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            v.push(dir.join("open-local-link.config.json"));
        }
    }
    // 开发：从 src-tauri 向上找 tauri-app/ 根
    v.push(PathBuf::from("../open-local-link.config.json"));
    v.push(PathBuf::from("../../open-local-link.config.json"));
    v
}

fn load() -> AppConfig {
    for p in candidate_paths() {
        if let Some(cfg) = try_read(&p) {
            return cfg;
        }
    }
    eprintln!(
        "未找到 open-local-link.config.json，请复制 open-local-link.config.example.json 后填写本地值。"
    );
    AppConfig::default()
}

fn try_read(path: &Path) -> Option<AppConfig> {
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str::<AppConfig>(&text).ok()
}

pub fn config() -> &'static AppConfig {
    &CONFIG
}
