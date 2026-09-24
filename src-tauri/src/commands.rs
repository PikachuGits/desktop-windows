use rand::Rng;
use serde::Serialize;
use tauri::Manager;

use crate::rdp;
use crate::state;
use crate::tcp;

#[derive(Serialize)]
pub struct UiState {
    pub key: String,
    pub info: String,
    pub register_name: String,
    pub register_btn: String,
    pub logs: Vec<String>,
    pub platform: String,
    pub browser_url: String,
    pub welcome: String,
}

/// 对齐 Form1.randkey(12)
#[tauri::command]
pub fn init_key(app: tauri::AppHandle) -> String {
    let charset: Vec<char> = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
        .chars()
        .collect();
    let mut rng = rand::thread_rng();
    let key: String = (0..12).map(|_| charset[rng.gen_range(0..charset.len())]).collect();
    state::set_key(app, key.clone());
    key
}

/// 对齐 CopyToClipboard + infolabel = "已复制"
#[tauri::command]
pub fn copy_key(app: tauri::AppHandle) -> Result<UiState, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let key = state::get_key();
    app.clipboard()
        .write_text(key)
        .map_err(|e| e.to_string())?;
    Ok(ui_state_with_info("已复制"))
}

/// 对齐 zhuchebutton_Click：注册 + 随后 socket_Tick
#[tauri::command]
pub fn register_key(app: tauri::AppHandle) -> Result<UiState, String> {
    let _ = &app;
    tcp::register_key()?;
    // 原逻辑：注册后立刻触发连接
    let _ = tcp::toggle_connection();
    Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
}

/// 对齐 socket_Tick / 托盘「点击注册」
#[tauri::command]
pub fn toggle_connection(app: tauri::AppHandle) -> Result<UiState, String> {
    let _ = &app;
    // 托盘与按钮共用：若未注册则先走注册
    if state::get_register_name().is_empty() && !state::get_connected() {
        let _ = tcp::register_key();
    }
    tcp::toggle_connection()?;
    Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
}

/// 对齐 button1 清空日志
#[tauri::command]
pub fn clear_log(_app: tauri::AppHandle) -> Result<UiState, String> {
    state::clear_logs();
    Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
}

/// 对齐 link_Click
#[tauri::command]
pub fn open_rdp(_app: tauri::AppHandle, ip: String, pingstatus: String) -> Result<UiState, String> {
    match rdp::open_rdp_for_ip(&ip, &pingstatus) {
        Ok(()) => Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板")),
        Err(e) => Ok(ui_state_with_info(&e)),
    }
}

/// 对齐 DIRECTORY: 处理
#[tauri::command]
pub fn open_directory(_app: tauri::AppHandle, path: String) -> Result<UiState, String> {
    match rdp::open_directory(&path) {
        Ok(()) => {
            state::push_log(&format!("接收地址:{path}"));
            Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
        }
        Err(e) => {
            state::push_log(&format!("打开目录失败:{e}"));
            Ok(ui_state_with_info(&e))
        }
    }
}

#[tauri::command]
pub fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
pub fn set_browser_url(_app: tauri::AppHandle, url: String) -> Result<UiState, String> {
    state::set_browser_url(url);
    Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
}

/// 主窗口定期拉取 UI 状态（托盘/后台线程改状态后刷新）
#[tauri::command]
pub fn browser_ping(app: tauri::AppHandle) -> Result<UiState, String> {
    let _ = &app;
    Ok(ui_state_with_info("单击密钥或按钮复制到粘贴板"))
}

/// 拉取并解析 PC 列表（地址见本地配置）
#[tauri::command]
pub fn fetch_pc_list(_app: tauri::AppHandle) -> Result<Vec<crate::pc_list::PcRow>, String> {
    let html = crate::pc_list::fetch_pc_list_html()?;
    Ok(crate::pc_list::parse_pc_list(&html))
}

/// 页面「唤醒」按钮：wol.php?pcname=&lanmac=
#[tauri::command]
pub fn wake_host(_app: tauri::AppHandle, pcname: String, lanmac: String) -> Result<UiState, String> {
    state::push_log(&format!("请求唤醒: {pcname} ({lanmac})"));
    match crate::pc_list::wake_host(&pcname, &lanmac) {
        Ok(body) => {
            // wol.php 成功时返回「魔法包发送成功！…已尝试唤醒…」
            let 摘要 = body
                .replace('\n', " ")
                .replace("<br>", " · ");
            let 摘要: String = 摘要.chars().take(120).collect();
            state::push_log(&format!("唤醒服务应答: {摘要}"));
            Ok(ui_state_with_info("唤醒指令已提交，请约 1 分钟后刷新在线状态"))
        }
        Err(e) => {
            state::push_log(&format!("唤醒失败  {e}"));
            Ok(ui_state_with_info(&format!("唤醒失败  {e}")))
        }
    }
}

/// 给前端的非敏感配置（不含 RDP 口令）
#[derive(serde::Serialize)]
pub struct PublicConfig {
    pub pc_list_url: String,
    pub welcome_text: String,
    pub brand_title: String,
    pub brand_subtitle: String,
}

#[tauri::command]
pub fn get_public_config(_app: tauri::AppHandle) -> PublicConfig {
    let c = crate::config::config();
    PublicConfig {
        pc_list_url: c.pc_list_url.clone(),
        welcome_text: c.welcome_text.clone(),
        brand_title: c.brand_title.clone(),
        brand_subtitle: c.brand_subtitle.clone(),
    }
}

/// 对齐 button2 / 托盘「退出程序」
#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    state::set_force_quit(&app, true);
    app.exit(0);
    Ok(())
}

pub fn ui_state_with_info(info: &str) -> UiState {
    UiState {
        key: state::get_key(),
        info: info.to_string(),
        register_name: state::get_register_name(),
        register_btn: state::register_btn_text(),
        logs: state::get_logs(),
        platform: std::env::consts::OS.to_string(),
        browser_url: state::get_browser_url(),
        welcome: crate::config::config().welcome_text.clone(),
    }
}

/// 供 setup 里 eval 初始化
#[allow(dead_code)]
pub fn notify_ui(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.__refreshFromRust && window.__refreshFromRust()");
    }
}
