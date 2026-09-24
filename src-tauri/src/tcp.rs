use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use crate::rdp;
use crate::state;

/// 对齐 Form1.HttpGet（WebClient.DownloadData）
pub fn http_get(url: &str) -> Result<String, String> {
    let resp = ureq::get(url)
        .timeout(Duration::from_secs(15))
        .call()
        .map_err(|e| e.to_string())?;
    resp.into_string().map_err(|e| e.to_string())
}

/// 对齐 zhuchebutton_Click_1：注册地址由配置提供
/// 原代码里还有两行调试用 Process.Start，按注释“代码完成删除”不迁移。
pub fn register_key() -> Result<String, String> {
    let key = state::get_key();
    let url = crate::config::config()
        .register_url_template
        .replace("{key}", &key);
    state::push_log("正在请求注册");
    match http_get(&url) {
        Ok(name) => {
            state::set_register_name(name.clone());
            Ok(name)
        }
        Err(e) => {
            let mut first = e.split('\n').next().unwrap_or(&e).to_string();
            if first.contains("404") {
                first = format!(
                    "{first} —— 注册接口不存在/已下线，请改配置 register_url_template（当前指向的地址返回 404）"
                );
            }
            state::push_log(&format!("请求注册失败  {first}"));
            state::set_register_name(String::new());
            Err(first)
        }
    }
}

static TCP_RUNNING: AtomicBool = AtomicBool::new(false);

/// 对齐 socket_Tick：
/// - 已连接 → 断开
/// - 未连接且 namelabel 非空 → 连接配置中的中继，发送 KEY，循环收 DIRECTORY:
pub fn toggle_connection() -> Result<String, String> {
    if TCP_RUNNING.load(Ordering::SeqCst) {
        TCP_RUNNING.store(false, Ordering::SeqCst);
        state::set_connected(false);
        state::set_register_name(String::new());
        state::push_log("取消注册成功，已断开连接");
        return Ok("disconnected".into());
    }

    if state::get_register_name().is_empty() {
        state::push_log("未注册，无法连接");
        return Err("未注册".into());
    }

    let key = state::get_key();
    TCP_RUNNING.store(true, Ordering::SeqCst);
    // 在后台线程里做阻塞收包，避免 UI 卡死（原 while(true) 在 UI 线程）
    std::thread::spawn(move || {
        run_tcp_loop(key);
    });
    Ok("connecting".into())
}

fn run_tcp_loop(key: String) {
    let result = (|| -> Result<(), String> {
        let cfg = crate::config::config();
        let mut stream = TcpStream::connect((cfg.relay_host.as_str(), cfg.relay_port))
            .map_err(|e| e.to_string())?;
        state::set_connected(true);
        state::push_log("连接成功");
        state::push_log("请求连接");
        stream
            .write_all(key.as_bytes())
            .map_err(|e| e.to_string())?;
        stream
            .set_read_timeout(Some(Duration::from_millis(500)))
            .ok();

        let mut buf = [0u8; 1024];
        while TCP_RUNNING.load(Ordering::SeqCst) {
            match stream.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let message = String::from_utf8_lossy(&buf[..n]).to_string();
                    if let Some(directory_path) = message.strip_prefix("DIRECTORY:") {
                        match rdp::open_directory(directory_path) {
                            Ok(()) => state::push_log(&format!("接收地址:{directory_path}")),
                            Err(e) => state::push_log(&format!("打开目录失败:{e}")),
                        }
                    }
                }
                Err(e) => {
                    // 超时继续等，其他错误退出
                    if e.kind() == std::io::ErrorKind::WouldBlock
                        || e.kind() == std::io::ErrorKind::TimedOut
                    {
                        continue;
                    }
                    return Err(e.to_string());
                }
            }
        }
        Ok(())
    })();

    if let Err(e) = result {
        state::push_log(&format!("未注册成功  {e}"));
    }
    TCP_RUNNING.store(false, Ordering::SeqCst);
    state::set_connected(false);
    state::set_register_name(String::new());
}
