use once_cell::sync::Lazy;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

static FORCE_QUIT: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
pub struct AppState {
    pub key: Mutex<String>,
    pub register_name: Mutex<String>,
    pub connected: AtomicBool,
    pub logs: Mutex<Vec<String>>,
    pub browser_url: Mutex<String>,
}

pub static STATE: Lazy<AppState> = Lazy::new(|| AppState {
    browser_url: Mutex::new(crate::config::config().pc_list_url.clone()),
    ..Default::default()
});

pub fn set_force_quit(_app: &tauri::AppHandle, v: bool) {
    FORCE_QUIT.store(v, Ordering::SeqCst);
}

pub fn force_quit_flag() -> bool {
    FORCE_QUIT.load(Ordering::SeqCst)
}

pub fn set_key(_app: tauri::AppHandle, key: String) {
    *STATE.key.lock().unwrap() = key;
}

pub fn get_key() -> String {
    STATE.key.lock().unwrap().clone()
}

pub fn set_register_name(name: String) {
    *STATE.register_name.lock().unwrap() = name;
}

pub fn get_register_name() -> String {
    STATE.register_name.lock().unwrap().clone()
}

pub fn set_connected(v: bool) {
    STATE.connected.store(v, Ordering::SeqCst);
}

pub fn get_connected() -> bool {
    STATE.connected.load(Ordering::SeqCst)
}

pub fn register_btn_text() -> String {
    if get_connected() {
        "点击断开(已注册)".to_string()
    } else {
        "点击注册(未注册)".to_string()
    }
}

/// 日志条数上限，避免 infotextBox 无限增长
const MAX_LOGS: usize = 500;

pub fn push_log(msg: &str) {
    let ts = chrono_lite_now();
    let line = format!("{ts}   {msg}");
    let mut logs = STATE.logs.lock().unwrap();
    logs.insert(0, line);
    if logs.len() > MAX_LOGS {
        logs.truncate(MAX_LOGS);
    }
}

pub fn clear_logs() {
    STATE.logs.lock().unwrap().clear();
}

pub fn get_logs() -> Vec<String> {
    STATE.logs.lock().unwrap().clone()
}

pub fn get_browser_url() -> String {
    STATE.browser_url.lock().unwrap().clone()
}

pub fn set_browser_url(url: String) {
    *STATE.browser_url.lock().unwrap() = url;
}

/// 对齐原 WinForms 的 DateTime.Now 字符串展示
fn chrono_lite_now() -> String {
    // 不额外引 chrono，用本地时间格式近似 C# 默认 ToString
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    // 简化为 yyyy-MM-dd HH:mm:ss（本地时区偏移由操作系统 printf 处理成本高，用 UTC+8 近似大陆办公场景）
    let local = secs + 8 * 3600;
    let days = local / 86400;
    let rem = local % 86400;
    let (y, m, d) = civil_from_days(days);
    format!(
        "{:04}/{:02}/{:02} {:02}:{:02}:{:02}",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
