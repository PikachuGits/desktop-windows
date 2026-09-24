use serde::Serialize;

/// PC 列表页行结构（与配置中的列表页 HTML 对齐）
#[derive(Debug, Clone, Serialize)]
pub struct PcRow {
    pub id: String,
    pub hostname: String,
    pub lan_mac: String,
    pub lan_ip: String,
    pub route_ip: String,
    pub status_online: bool,
    pub status_text: String,
    /// 唤醒链接路径（页面 wol 链接）
    pub wake_path: String,
    /// 内网远程（页面第一处 id=iprdp）
    pub lan_rdp_ip: String,
    pub lan_rdp_ping: String,
    /// 外网远程（页面第二处 id=iprdp）
    pub remote_rdp_ip: String,
    pub remote_rdp_ping: String,
    /// 网盘目录（id=opendir 的 data-dir）
    pub open_dir: String,
}

/// 拉取 PC 列表页 HTML（地址来自本地配置）
pub fn fetch_pc_list_html() -> Result<String, String> {
    let url = crate::config::config().pc_list_url.clone();
    crate::tcp::http_get(&url)
}

/// 调唤醒接口（URL 模板来自本地配置）
pub fn wake_host(pcname: &str, lanmac: &str) -> Result<String, String> {
    let url = crate::config::config()
        .wake_url_template
        .replace("{pcname}", &urlencode(pcname))
        .replace("{lanmac}", &urlencode(lanmac));
    crate::tcp::http_get(&url)
}

pub fn urlencode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// 粗粒度解析 index.php 表格行（不引 HTML 依赖，够用且稳）
pub fn parse_pc_list(html: &str) -> Vec<PcRow> {
    let mut rows = Vec::new();
    for (idx, chunk) in html.split("<tr>").skip(1).enumerate() {
        let tds: Vec<&str> = chunk.split("<td").skip(1).collect();
        if tds.len() < 8 {
            continue;
        }
        let hostname = strip_tags(tds.get(1).copied().unwrap_or("")).trim().to_string();
        if hostname.is_empty() || hostname == "主机名" {
            continue;
        }
        let lan_mac = strip_tags(tds.get(2).copied().unwrap_or("")).trim().to_string();

        // pingIP 链接按序：内网IP、路由IP、代理IP、zerotier
        let pings = find_all(chunk, "data-pingIP='");
        let lan_ip = pings.first().cloned().unwrap_or_default();
        let route_ip = pings.get(1).cloned().unwrap_or_default();

        let status_text = {
            // 页面状态格是 <td style=color:red>离线</td>（属性未加引号），
            // strip_tags 后会残留 style 残渣，不能整格 equals，只能看关键字。
            let mut st = "离线".to_string();
            for td in &tds {
                let raw = td.to_string();
                if let Some(pos) = raw.find("在线") {
                    // 避免误匹配到「不在线」之类；本页只有 在线/离线
                    let _ = pos;
                    if raw.contains("离线") && !raw.contains(">在线") && !raw.contains("在线<") {
                        // 同格同时出现时以显式状态为准
                    }
                    if raw.contains("离线") {
                        st = "离线".to_string();
                    } else {
                        st = "在线".to_string();
                    }
                    break;
                } else if raw.contains("离线") {
                    st = "离线".to_string();
                    break;
                }
            }
            // 与 data-pingstatus 交叉校验：任一远程位为 1 也视为在线
            if st == "离线" {
                for part in chunk.split("id='iprdp'").skip(1) {
                    if find_attr(part, "data-pingstatus='").as_deref() == Some("1") {
                        st = "在线".to_string();
                        break;
                    }
                }
            }
            st
        };

        let wake_path = find_attr_quoted(chunk, "href='", "wol.php")
            .map(|h| h.replace("&amp;", "&"))
            .unwrap_or_default();

        // 两处 iprdp
        let mut iprdps = Vec::new();
        for part in chunk.split("id='iprdp'").skip(1) {
            let ip = find_attr(part, "data-ip='").unwrap_or_default();
            let ping = find_attr(part, "data-pingstatus='").unwrap_or_default();
            iprdps.push((ip, ping));
        }

        let open_dir = find_attr(chunk, "data-dir='").unwrap_or_default();

        rows.push(PcRow {
            id: format!("row-{idx}-{hostname}"),
            hostname,
            lan_mac,
            lan_ip,
            route_ip,
            status_online: status_text == "在线",
            status_text,
            wake_path,
            lan_rdp_ip: iprdps.first().map(|x| x.0.clone()).unwrap_or_default(),
            lan_rdp_ping: iprdps.first().map(|x| x.1.clone()).unwrap_or_default(),
            remote_rdp_ip: iprdps.get(1).map(|x| x.0.clone()).unwrap_or_default(),
            remote_rdp_ping: iprdps.get(1).map(|x| x.1.clone()).unwrap_or_default(),
            open_dir,
        });
    }
    rows
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    // 去掉 style 残留噪声
    out.replace('\n', " ").replace('\r', " ")
}

fn find_attr(hay: &str, key: &str) -> Option<String> {
    let i = hay.find(key)?;
    let rest = &hay[i + key.len()..];
    let end = rest.find('\'')?;
    Some(rest[..end].to_string())
}

fn find_attr_quoted(hay: &str, key: &str, must_contain: &str) -> Option<String> {
    let mut search = hay;
    while let Some(i) = search.find(key) {
        let rest = &search[i + key.len()..];
        let end = rest.find('\'')?;
        let val = &rest[..end];
        if val.contains(must_contain) {
            return Some(val.to_string());
        }
        search = rest;
    }
    None
}

fn find_all(hay: &str, key: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut search = hay;
    while let Some(i) = search.find(key) {
        let rest = &search[i + key.len()..];
        if let Some(end) = rest.find('\'') {
            out.push(rest[..end].to_string());
            search = rest;
        } else {
            break;
        }
    }
    out
}
