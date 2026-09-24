#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod config;
mod pc_list;
mod rdp;
mod state;
mod tcp;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};

fn build_tray_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示窗口", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle_register", "点击注册(未注册)", true, None::<&str>)?;
    let copy = MenuItem::with_id(app, "copy_key", "复制KEY", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
    Menu::with_items(app, &[&show, &toggle, &copy, &quit])
}

/// 进程互斥，防止出现两个主窗口（对齐 Program.cs 单实例）
/// 用本机端口独占代替锁文件，进程退出自动释放，不会误挡下次启动。
fn already_running() -> bool {
    use std::net::TcpListener;
    match TcpListener::bind("127.0.0.1:47211") {
        Ok(listener) => {
            // 泄漏监听器，占用端口直到进程退出
            std::mem::forget(listener);
            false
        }
        Err(_) => true,
    }
}

fn main() {
    // 对齐 Program.cs：先做单实例，避免第二次启动又开一个窗
    if already_running() {
        return;
    }
    let mut builder = tauri::Builder::default();

    // Windows 单实例（对齐 Program.cs 的进程名互斥）
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }));

    builder
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            commands::init_key,
            commands::copy_key,
            commands::register_key,
            commands::toggle_connection,
            commands::clear_log,
            commands::open_rdp,
            commands::open_directory,
            commands::get_platform,
            commands::set_browser_url,
            commands::browser_ping,
            commands::quit_app,
            commands::fetch_pc_list,
            commands::wake_host,
            commands::get_public_config,
            commands::fetch_page_html,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let menu = build_tray_menu(&handle)?;
            let tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().cloned().expect("missing app icon"))
                .icon_as_template(true)
                .tooltip("打开本地链接服务")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                    "toggle_register" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn_blocking(move || {
                            // 对齐 服务器未配对ToolStripMenuItem_Click：注册 + socket_Tick
                            let _ = commands::register_key(app);
                        });
                    }
                    "copy_key" => {
                        let app = app.clone();
                        let _ = commands::copy_key(app);
                    }
                    "quit" => {
                        state::set_force_quit(app, true);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(win) = tray.app_handle().get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.unminimize();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // 启动即生成密钥（对齐 Form1 构造函数）
            let app_handle = app.handle().clone();
            let key = commands::init_key(app_handle.clone());
            state::set_key(app_handle.clone(), key.clone());
            // 对齐 Form1 构造：复制KEY菜单显示「单击复制」+KEY
            let copy_text = format!("单击复制{key}");
            let copy_item = MenuItem::with_id(&handle, "copy_key", &copy_text, true, None::<&str>)?;
            let show_item = MenuItem::with_id(&handle, "show", "显示窗口", true, None::<&str>)?;
            let toggle_item =
                MenuItem::with_id(&handle, "toggle_register", "点击注册(未注册)", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(&handle, "quit", "退出程序", true, None::<&str>)?;
            let new_menu =
                Menu::with_items(&handle, &[&show_item, &toggle_item, &copy_item, &quit_item])?;
            let _ = tray.set_menu(Some(new_menu));
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.eval("window.__onAppReady && window.__onAppReady()");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 对齐 Form1_FormClosing：关窗隐藏到托盘，不退出
                if !state::force_quit_flag() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if !state::force_quit_flag() {
                    api.prevent_exit();
                }
            }
        });
}
