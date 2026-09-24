/**
 * 打开本地链接服务 — 前端
 * 主机列表 / 唤醒 / 本地连接 / 远程连接 / 网盘目录
 * 端点地址读 window.__APP_CONFIG__ 或桌面端本地配置，不写死内网 IP。
 */
(function () {
  "use strict";

  const 刷新间隔 = 5000;
  const $ = (id) => document.getElementById(id);

  const 状态 = {
    密钥: 随机密钥(12),
    提示: "单击密钥或按钮复制到粘贴板",
    注册人: "",
    已连接: false,
    平台: "浏览器预览",
    筛选词: "",
    筛选模式: "all",
    自动刷新: true,
    列表: [],
  };

  let 定时器 = null;
  let 正在刷新 = false;

  function 调用(命令, 参数) {
    const 内核 = window.__TAURI__ && window.__TAURI__.core;
    if (内核 && typeof 内核.invoke === "function") {
      return 内核.invoke(命令, 参数);
    }
    return 演示调用(命令, 参数);
  }

  function 演示调用(命令, 参数) {
    switch (命令) {
      case "copy_key":
        if (navigator.clipboard) navigator.clipboard.writeText(状态.密钥).catch(() => {});
        return Promise.resolve(界面快照("已复制"));
      case "toggle_connection":
      case "register_key": {
        const 首次 = !状态.注册人 && !状态.已连接;
        if (首次) {
          状态.注册人 = "演示注册人";
          写日志("正在请求注册");
          写日志("（浏览器演示）已模拟注册");
        }
        状态.已连接 = !状态.已连接;
        写日志(状态.已连接 ? "连接成功" : "取消注册成功，已断开连接");
        if (!状态.已连接) 状态.注册人 = "";
        return Promise.resolve(界面快照(状态.注册人 || 状态.提示));
      }
      case "clear_log":
        $("infotextBox").textContent = "";
        return Promise.resolve(界面快照("单击密钥或按钮复制到粘贴板"));
      case "quit_app":
        写日志("浏览器演示模式无法退出宿主程序");
        return Promise.resolve(界面快照("浏览器演示模式"));
      case "open_directory":
        写日志("打开网盘目录: " + ((参数 && (参数.path || 参数.dir)) || ""));
        return Promise.resolve(界面快照("已请求打开网盘目录"));
      case "open_rdp": {
        const 主机 = (参数 && 参数.ip) || "";
        const 通 = (参数 && params_ping(参数)) || "1";
        if (通 === "0") {
          const 文 = 主机 + "主机的IP不通，请先唤醒主机";
          写日志(文);
          return Promise.resolve(界面快照(文));
        }
        写日志("启动远程桌面: " + 主机 + "  （账号口令来自本地配置）");
        return Promise.resolve(界面快照("已请求远程桌面"));
      }
      case "wake_host":
        写日志(
          "请求唤醒: " +
            ((参数 && 参数.pcname) || "") +
            " (" +
            ((参数 && 参数.lanmac) || "") +
            ")"
        );
        写日志("唤醒指令已提交");
        return Promise.resolve(界面快照("唤醒指令已提交"));
      case "browser_ping":
        return Promise.resolve(界面快照(状态.提示));
      case "init_key":
        return Promise.resolve(状态.密钥);
      case "fetch_pc_list":
        return 拉取演示列表();
      case "set_browser_url":
        return Promise.resolve(界面快照(状态.提示));
      case "get_public_config":
        return Promise.resolve(window.__APP_CONFIG__ || {});
      default:
        return Promise.resolve(界面快照(状态.提示));
    }
  }

  function params_ping(参数) {
    return 参数.pingstatus != null ? 参数.pingstatus : 参数.ping_status;
  }

  function 界面快照(提示) {
    return {
      key: 状态.密钥,
      info: 提示 || 状态.提示,
      register_name: 状态.注册人,
      register_btn: 按钮文案(),
      logs: ($("infotextBox").textContent || "").split(/\r?\n/).filter(Boolean),
      platform: 状态.平台 === "浏览器预览" ? "browser" : 状态.平台,
      browser_url: "",
      welcome: "欢迎使用网页弹出文件夹或文件的服务",
    };
  }

  function 随机密钥(长度) {
    const 表 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let 出 = "";
    for (let i = 0; i < 长度; i++) 出 += 表[(Math.random() * 表.length) | 0];
    return 出;
  }

  function 时间戳() {
    const d = new Date();
    const 补 = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + 补(d.getMonth() + 1) + "/" + 补(d.getDate()) + " " +
      补(d.getHours()) + ":" + 补(d.getMinutes()) + ":" + 补(d.getSeconds())
    );
  }

  function 写日志(文) {
    const 框 = $("infotextBox");
    const 行 = 时间戳() + "   " + 文;
    const 列表 = 框.textContent ? 框.textContent.split(/\r?\n/) : [];
    列表.unshift(行);
    while (列表.length > 500) 列表.pop();
    框.textContent = 列表.join("\n");
  }

  function 按钮文案() {
    return 状态.已连接 ? "点击断开（已注册）" : "点击注册（未注册）";
  }

  function 应用状态(s) {
    if (!s) return;
    if (s.key) 状态.密钥 = s.key;
    if (s.info) 状态.提示 = s.info;
    if (typeof s.register_name === "string") 状态.注册人 = s.register_name;
    if (s.register_btn) 状态.已连接 = s.register_btn.indexOf("断开") >= 0;
    if (s.platform) {
      状态.平台 =
        s.platform === "windows" ? "窗口系统 · 可弹目录与远程桌面"
          : s.platform === "darwin" ? "苹果系统 · 仅界面预览"
            : s.platform === "browser" ? "浏览器预览" : s.platform;
    }
    刷新界面();
  }

  function 刷新界面() {
    $("keylabel").textContent = 状态.密钥;
    $("infolabel").textContent = 状态.提示;
    $("namelabel").textContent = 状态.注册人 || "—";
    $("zhuchebutton").textContent = 按钮文案();
    const 点 = $("conn-pill");
    if (状态.已连接) {
      点.textContent = "已注册";
      点.classList.add("on");
    } else {
      点.textContent = "未注册";
      点.classList.remove("on");
    }
    $("platform-badge").textContent = 状态.平台;
  }

  /** 浏览器演示：优先读 window.__APP_CONFIG__.pc_list_url；失败则用无敏感信息的示例数据 */
  function 拉取演示列表() {
    const 地址 =
      (window.__APP_CONFIG__ && window.__APP_CONFIG__.pc_list_url) ||
      "http://127.0.0.1/index.php";
    return fetch(地址, { cache: "no-store" })
      .then((r) => r.text())
      .then((html) => 解析列表HTML(html))
      .catch(() => {
        if (!状态.列表.length) {
          状态.列表 = 样本列表();
          写日志("无法读取主机列表地址，已用演示数据（请配置本地 config 后使用桌面版）");
        }
        return 状态.列表;
      });
  }

  function 样本列表() {
    return [
      {
        id: "demo-1",
        hostname: "示例主机-在线",
        lan_mac: "00:11:22:33:44:55",
        lan_ip: "10.0.0.2",
        route_ip: "0.0.0.0",
        status_online: true,
        status_text: "在线",
        wake_path: "wol.php?pcname=demo-1&lanmac=00:11:22:33:44:55",
        lan_rdp_ip: "10.0.0.2",
        lan_rdp_ping: "1",
        remote_rdp_ip: "0.0.0.0",
        remote_rdp_ping: "1",
        open_dir: "C:\\\\Users\\\\Public\\\\Documents",
      },
      {
        id: "demo-2",
        hostname: "示例主机-离线",
        lan_mac: "00:11:22:33:44:66",
        lan_ip: "0.0.0.0",
        route_ip: "0.0.0.0",
        status_online: false,
        status_text: "离线",
        wake_path: "wol.php?pcname=demo-2&lanmac=00:11:22:33:44:66",
        lan_rdp_ip: "0.0.0.0",
        lan_rdp_ping: "0",
        remote_rdp_ip: "0.0.0.0",
        remote_rdp_ping: "0",
        open_dir: "C:\\\\Users\\\\Public\\\\Documents",
      },
    ];
  }

  /** 与 Rust parse_pc_list 同构的浏览器侧解析（演示模式） */
  function 解析列表HTML(html) {
    const 行列 = html.split("<tr>").slice(1);
    const 出 = [];
    行列.forEach((chunk, idx) => {
      const tds = chunk.split("<td").slice(1);
      if (tds.length < 8) return;
      const 去标 = (s) => s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const hostname = 去标(tds[1] || "");
      if (!hostname || hostname === "主机名") return;
      const lan_mac = 去标(tds[2] || "");
      const pings = [];
      let re = /data-pingIP='([^']*)'/g;
      let m;
      while ((m = re.exec(chunk))) pings.push(m[1]);
      let 状态字 = "离线";
      tds.forEach((td) => {
        const 原 = td;
        if (原.indexOf("离线") >= 0) {
          状态字 = "离线";
        } else if (原.indexOf("在线") >= 0) {
          状态字 = "在线";
        }
      });
      // 与 data-pingstatus 交叉校验
      if (状态字 === "离线") {
        if (/data-pingstatus='1'/.test(chunk)) 状态字 = "在线";
      }
      const wake = (chunk.match(/href='(wol\.php[^']*)'/) || [])[1] || "";
      const iprdps = [];
      chunk.split("id='iprdp'").slice(1).forEach((part) => {
        const ip = (part.match(/data-ip='([^']*)'/) || [])[1] || "";
        const ping = (part.match(/data-pingstatus='([^']*)'/) || [])[1] || "";
        iprdps.push({ ip, ping });
      });
      const open_dir = (chunk.match(/data-dir='([^']*)'/) || [])[1] || "";
      出.push({
        id: "row-" + idx + "-" + hostname,
        hostname,
        lan_mac,
        lan_ip: pings[0] || "",
        route_ip: pings[1] || "",
        status_online: 状态字 === "在线",
        status_text: 状态字,
        wake_path: wake.replace(/&amp;/g, "&"),
        lan_rdp_ip: (iprdps[0] && iprdps[0].ip) || "",
        lan_rdp_ping: (iprdps[0] && iprdps[0].ping) || "",
        remote_rdp_ip: (iprdps[1] && iprdps[1].ip) || "",
        remote_rdp_ping: (iprdps[1] && iprdps[1].ping) || "",
        open_dir,
      });
    });
    状态.列表 = 出;
    return 出;
  }

  function 可见列表() {
    const 词 = 状态.筛选词.trim().toLowerCase();
    return 状态.列表.filter((项) => {
      if (状态.筛选模式 === "online" && !项.status_online) return false;
      if (状态.筛选模式 === "offline" && 项.status_online) return false;
      if (!词) return true;
      const blob = [
        项.hostname, 项.lan_mac, 项.lan_ip, 项.route_ip, 项.open_dir,
      ]
        .join(" ")
        .toLowerCase();
      return blob.indexOf(词) >= 0;
    });
  }

  function 建行(项) {
    const tr = document.createElement("tr");
    tr.className = "row";
    tr.dataset.id = 项.id;
    tr.innerHTML =
      '<td class="c-status"><span class="dot"></span><span class="badge"></span></td>' +
      '<td class="c-host"></td>' +
      '<td class="c-mac mono"></td>' +
      '<td class="c-lan mono"></td>' +
      '<td class="c-wan mono"></td>' +
      '<td class="col-act"><button type="button" class="btn-wake">唤醒</button></td>' +
      '<td class="col-act"><button type="button" class="btn-lan">本地连接</button></td>' +
      '<td class="col-act"><button type="button" class="btn-wan">远程连接</button></td>' +
      '<td class="col-act"><button type="button" class="btn-dir">网盘目录</button></td>';
    tr.querySelector(".btn-wake").addEventListener("click", () => 唤醒主机(项));
    tr.querySelector(".btn-lan").addEventListener("click", () =>
      启动远程(项.lan_rdp_ip, 项.lan_rdp_ping, "本地连接")
    );
    tr.querySelector(".btn-wan").addEventListener("click", () =>
      启动远程(项.remote_rdp_ip, 项.remote_rdp_ping, "远程连接")
    );
    tr.querySelector(".btn-dir").addEventListener("click", () => 打开盘目录(项));
    return tr;
  }

  /**
   * 静默刷新：保留 scrollTop，按 id 复用 <tr>，只写变化字段。
   */
  function 静默刷新列表(选项) {
    选项 = 选项 || {};
    const 滚动框 = $("list-scroll");
    const 表体 = $("link-list");
    const 空 = $("list-empty");
    const 原滚动 = 滚动框.scrollTop;
    const 旧行 = new Map();
    表体.querySelectorAll(":scope > tr.row").forEach((tr) => 旧行.set(tr.dataset.id, tr));

    const 项列 = 可见列表();
    空.classList.toggle("hidden", 项列.length > 0);

    const 片 = document.createDocumentFragment();
    const 有变化 = [];

    项列.forEach((项) => {
      let tr = 旧行.get(项.id);
      const 新建 = !tr;
      if (!tr) {
        tr = 建行(项);
        有变化.push(tr);
      }
      const host = tr.querySelector(".c-host");
      const mac = tr.querySelector(".c-mac");
      const lan = tr.querySelector(".c-lan");
      const wan = tr.querySelector(".c-wan");
      const badge = tr.querySelector(".badge");
      const dot = tr.querySelector(".dot");
      const btnLan = tr.querySelector(".btn-lan");
      const btnWan = tr.querySelector(".btn-wan");
      const btnDir = tr.querySelector(".btn-dir");

      if (host.textContent !== 项.hostname) {
        host.textContent = 项.hostname;
        有变化.push(tr);
      }
      mac.textContent = 项.lan_mac || "—";
      lan.textContent = 项.lan_ip || "—";
      wan.textContent = 项.route_ip || "—";
      const 态 = 项.status_text || (项.status_online ? "在线" : "离线");
      if (badge.textContent !== 态) {
        badge.textContent = 态;
        badge.classList.toggle("on", !!项.status_online);
        badge.classList.toggle("off", !项.status_online);
        有变化.push(tr);
      }
      dot.classList.toggle("on", !!项.status_online);
      dot.classList.toggle("off", !项.status_online);
      // 按钮数据绑定到最新行（闭包刷新）
      btnLan.onclick = () => 启动远程(项.lan_rdp_ip, 项.lan_rdp_ping, "本地连接");
      btnWan.onclick = () => 启动远程(项.remote_rdp_ip, 项.remote_rdp_ping, "远程连接");
      btnDir.onclick = () => 打开盘目录(项);
      tr.querySelector(".btn-wake").onclick = () => 唤醒主机(项);
      btnLan.disabled = !项.lan_rdp_ip || 项.lan_rdp_ip === "0.0.0.0";
      btnWan.disabled = !项.remote_rdp_ip || 项.remote_rdp_ip === "0.0.0.0";
      btnDir.disabled = !项.open_dir;
      if (新建) void tr.offsetWidth;

      片.appendChild(tr);
      旧行.delete(项.id);
    });

    表体.replaceChildren(片);
    滚动框.scrollTop = 原滚动;

    if (选项.flash !== false && 有变化.length) {
      有变化.forEach((tr) => {
        tr.classList.remove("flash");
        void tr.offsetWidth;
        tr.classList.add("flash");
      });
    }

    $("refresh-meta").textContent =
      "上次刷新 " + 时间戳().slice(11) + " · 滚动已保持 " + Math.round(滚动框.scrollTop) + " 像素";
    $("list-stats").textContent =
      "共 " + 状态.列表.length + " 台 · 显示 " + 项列.length + " 台";
  }

  function 唤醒主机(项) {
    调用("wake_host", { pcname: 项.hostname, lanmac: 项.lan_mac }).then((s) => {
      应用状态(s);
      if (s && s.info) 写日志(s.info);
    });
  }

  function 打开盘目录(项) {
    if (!项.open_dir) {
      写日志("该主机未配置网盘目录");
      return;
    }
    调用("open_directory", { path: 项.open_dir, dir: 项.open_dir }).then((s) => {
      应用状态(s);
      if (s && s.info) 写日志(s.info);
      else 写日志("接收地址:" + 项.open_dir);
    });
  }

  function 启动远程(ip, ping, 标签) {
    调用("open_rdp", { ip: ip, pingstatus: String(ping) }).then((s) => {
      应用状态(s);
      if (s && s.info) 写日志(s.info);
      else 写日志(标签 + " " + ip);
    });
  }

  async function 刷新(选项) {
    选项 = 选项 || {};
    if (正在刷新) return;
    正在刷新 = true;
    try {
      let 列表;
      try {
        列表 = await 调用("fetch_pc_list");
      } catch (e) {
        写日志("拉取主机列表失败: " + e);
        列表 = 状态.列表;
      }
      if (Array.isArray(列表) && 列表.length) {
        状态.列表 = 列表.map((x, i) => Object.assign({ id: "row-" + i + "-" + x.hostname }, x));
      }
      静默刷新列表({ flash: 选项.flash !== false });
      const s = await 调用("browser_ping");
      应用状态(s);
    } catch (e) {
      写日志("刷新失败: " + e);
    } finally {
      正在刷新 = false;
    }
  }

  function 启动自动刷新() {
    if (定时器) clearInterval(定时器);
    定时器 = setInterval(() => {
      if (!状态.自动刷新) return;
      刷新({ flash: true });
    }, 刷新间隔);
  }

  function 复制密钥() {
    调用("copy_key").then((s) => {
      应用状态(s);
      状态.提示 = (s && s.info) || "已复制";
      刷新界面();
    });
  }

  function 绑定() {
    $("keybutton").addEventListener("click", 复制密钥);
    $("keylabel").addEventListener("click", 复制密钥);
    $("btn-copy-hint").addEventListener("click", 复制密钥);

    $("zhuchebutton").addEventListener("click", async () => {
      $("zhuchebutton").disabled = true;
      try {
        写日志("正在请求注册");
        const s = await 调用("register_key");
        应用状态(s);
        if (s && s.info) 写日志(s.info);
        setTimeout(() => 刷新({ flash: true }), 300);
      } catch (e) {
        写日志("请求注册失败  " + e);
      } finally {
        $("zhuchebutton").disabled = false;
      }
    });

    $("button1").addEventListener("click", () => {
      调用("clear_log").then(() => {
        $("infotextBox").textContent = "";
      });
    });
    $("button2").addEventListener("click", () => 调用("quit_app"));
    $("btn-refresh-now").addEventListener("click", () => 刷新({ flash: true }));
    $("toggle-auto").addEventListener("change", (e) => {
      状态.自动刷新 = e.target.checked;
      写日志(状态.自动刷新 ? "已开启自动静默刷新（5 秒）" : "已暂停自动刷新");
    });
    $("filter").addEventListener("input", (e) => {
      状态.筛选词 = e.target.value;
      静默刷新列表({ flash: false });
    });
    document.querySelectorAll(".seg-btn").forEach((按钮) => {
      按钮.addEventListener("click", () => {
        document.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
        按钮.classList.add("active");
        状态.筛选模式 = 按钮.getAttribute("data-filter");
        静默刷新列表({ flash: false });
      });
    });

    const 帮助 = $("help-panel");
    const 开关帮助 = (开) => {
      帮助.classList.toggle("hidden", !开);
      $("btn-help").setAttribute("aria-expanded", 开 ? "true" : "false");
    };
    $("btn-help").addEventListener("click", () => 开关帮助(帮助.classList.contains("hidden")));
    $("btn-help-close").addEventListener("click", () => 开关帮助(false));
  }

  async function 启动() {
    绑定();
    try {
      const pub = await 调用("get_public_config");
      if (pub && pub.pc_list_url) {
        window.__APP_CONFIG__ = Object.assign({}, window.__APP_CONFIG__, pub);
      }
    } catch (_) {}
    try {
      const s = await 调用("browser_ping");
      应用状态(s);
      if (!状态.密钥 || 状态.密钥 === "············") {
        状态.密钥 = (await 调用("init_key")) || 状态.密钥;
      }
      if (s && s.platform) 应用状态({ platform: s.platform });
    } catch (_) {}
    刷新界面();
    await 刷新({ flash: false });
    启动自动刷新();
    写日志("界面已就绪 · 内网地址与口令请放在本地 open-local-link.config.json（勿提交仓库）");
  }

  启动();
})();
