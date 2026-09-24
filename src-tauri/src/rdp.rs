use std::path::PathBuf;
use std::process::Command;

/// 对齐 Form1.GetRdpPassword —— PowerShell ConvertFrom-SecureString（DPAPI）
/// 仅 Windows 可用；其他平台返回空串并在日志中说明。
#[cfg(windows)]
pub fn get_rdp_password(password_text: &str) -> String {
    let ps = format!(
        "$password = ConvertTo-SecureString \"{password_text}\" -AsPlainText -Force; \
         [System.Runtime.InteropServices.Marshal]::PtrToStringAuto(\
         [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)) | \
         ConvertTo-SecureString -AsPlainText -Force | ConvertFrom-SecureString"
    );
    match Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
        .output()
    {
        Ok(out) => String::from_utf8_lossy(&out.stdout).trim().to_string(),
        Err(e) => {
            crate::state::push_log(&format!("加密 RDP 密码失败: {e}"));
            String::new()
        }
    }
}

#[cfg(not(windows))]
pub fn get_rdp_password(_password_text: &str) -> String {
    crate::state::push_log("当前非 Windows，跳过 DPAPI 密码加密（password 51 仅 Windows 有效）");
    String::new()
}

/// 对齐 Form1.WriteRdpFile
pub fn write_rdp_file(
    file_name: &str,
    server_name: &str,
    user_name: &str,
    password: &str,
) -> std::io::Result<()> {
    // 文件名清洗，避免 IP 带换行导致 IOException（见 bin 下崩溃日志）
    let safe_name: String = file_name
        .chars()
        .map(|c| if c.is_control() { '_' } else { c })
        .collect();
    let path = PathBuf::from(&safe_name);
    // C# 写的是 Encoding.Unicode (UTF-16 LE)
    let body = build_rdp_body(server_name, user_name, password);
    write_utf16_le_bom(&path, &body)
}

fn build_rdp_body(server_name: &str, user_name: &str, password: &str) -> String {
    let mut s = String::new();
    // 保持与 Form1.WriteRdpFile 相同键序
    s.push_str("screen mode id:i:1\n");
    s.push_str("desktopwidth:i:1366\n");
    s.push_str("desktopheight:i:768\n");
    s.push_str("session bpp:i:32\n");
    s.push_str("winposstr:s:0,1,0,0,1366,768\n");
    s.push_str("compression:i:1\n");
    s.push_str("keyboardhook:i:2\n");
    s.push_str("audiocapturemode:i:0\n");
    s.push_str("videoplaybackmode:i:1\n");
    s.push_str("connection type:i:7\n");
    s.push_str("networkautodetect:i:1\n");
    s.push_str("bandwidthautodetect:i:1\n");
    s.push_str("displayconnectionbar:i:1\n");
    s.push_str(&format!("username:s:{user_name}\n"));
    s.push_str("domain:s:\n");
    s.push_str("authentication level:i:0\n");
    s.push_str("prompt for credentials:i:0\n");
    s.push_str("negotiate security layer:i:1\n");
    s.push_str("remoteapplicationmode:i:0\n");
    s.push_str("alternate shell:s:\n");
    s.push_str("shell working directory:s:\n");
    s.push_str("gatewayhostname:s:\n");
    s.push_str("gatewayusagemethod:i:4\n");
    s.push_str("gatewaycredentialssource:i:4\n");
    s.push_str("gatewayprofileusagemethod:i:0\n");
    s.push_str("promptcredentialonce:i:0\n");
    s.push_str("use multimon:i:0\n");
    s.push_str("audiomode:i:0\n");
    s.push_str("redirectprinters:i:1\n");
    s.push_str("redirectcomports:i:0\n");
    s.push_str("redirectsmartcards:i:1\n");
    s.push_str("redirectclipboard:i:1\n");
    s.push_str("redirectposdevices:i:0\n");
    s.push_str("drivestoredirect:s:\n");
    s.push_str(&format!("username:s:{user_name}\n"));
    s.push_str(&format!("password 51:b:{password}\n"));
    s.push_str(&format!("full address:s:{server_name}\n"));
    s
}

fn write_utf16_le_bom(path: &PathBuf, text: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::File::create(path)?;
    f.write_all(&[0xFF, 0xFE])?;
    for u in text.encode_utf16() {
        f.write_all(&u.to_le_bytes())?;
    }
    Ok(())
}

/// 对齐 Form1.openrdp
/// Windows: mstsc.exe /f file
/// macOS: 用「Windows App」(com.microsoft.rdc.macos) 打开 .rdp，可远程连 Windows
#[cfg(windows)]
pub fn open_rdp(file_name: &str) -> Result<(), String> {
    if !std::path::Path::new(file_name).exists() {
        return Err("远程桌面配置文件不存在！".into());
    }
    Command::new("mstsc.exe")
        .args(["/f", &format!("\"{file_name}\"")])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
pub fn open_rdp(file_name: &str) -> Result<(), String> {
    if !std::path::Path::new(file_name).exists() {
        return Err("远程桌面配置文件不存在！".into());
    }
    // 优先 Windows App，其次旧版 Microsoft Remote Desktop
    for app in ["Windows App", "Microsoft Remote Desktop"] {
        let ok = Command::new("open")
            .args(["-a", app, file_name])
            .spawn()
            .is_ok();
        if ok {
            crate::state::push_log(&format!("已调用 {app} 打开 {file_name}"));
            return Ok(());
        }
    }
    // 兜底：交给系统按 .rdp 关联打开
    Command::new("open")
        .arg(file_name)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 对齐 Process.Start("explorer.exe", path)，
/// 但 Windows 上 `explorer.exe <UNC/路径>` 常会再弹一个默认窗，
/// 故用 `/root,` 只开目标目录，避免双窗。
#[cfg(windows)]
pub fn open_directory(path: &str) -> Result<(), String> {
    Command::new("explorer.exe")
        .arg(format!("/root,{path}"))
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
pub fn open_directory(path: &str) -> Result<(), String> {
    // Mac 仅 UI 预览：尽量用 Finder 打开；UNC 需转 smb://
    let target = if path.starts_with("\\\\") {
        let trimmed = path.trim_start_matches('\\');
        format!("smb://{trimmed}")
    } else {
        path.to_string()
    };
    Command::new("open")
        .arg(&target)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// 对齐 Form1.link_Click
pub fn open_rdp_for_ip(raw_ip: &str, ping_status: &str) -> Result<(), String> {
    if ping_status == "0" {
        let msg = format!("{raw_ip}主机的IP不通，请先唤醒主机");
        crate::state::push_log(&msg);
        return Err(msg);
    }
    let ip: String = raw_ip
        .chars()
        .filter(|c| *c != ' ' && *c != '\r' && *c != '\n')
        .collect();
    let cfg = crate::config::config();
    let username = cfg.rdp_username.clone();
    let password = get_rdp_password(&cfg.rdp_password);
    crate::state::push_log(&format!(
        "启动远程桌面:{ip}  {username}  {password}"
    ));
    let file_name = format!("{ip}.rdp");
    if std::path::Path::new(&file_name).exists() {
        let _ = std::fs::remove_file(&file_name);
    }
    write_rdp_file(&file_name, &ip, &username, &password).map_err(|e| e.to_string())?;
    open_rdp(&file_name)
}
