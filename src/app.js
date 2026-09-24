/**
 * 打开本地链接服务 — 现代深色 UI + Form1 同源功能
 * 静默刷新保滚动；唤醒/远程/网盘；远程桌面在 macOS 调 Windows App。
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const invoke = (cmd, args) => {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (core && typeof core.invoke === "function") return core.invoke(cmd, args);
    return mockInvoke(cmd, args);
  };

  const 状态 = {
    密钥: "············",
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

  function 时间戳() {
    const d = new Date();
    const 补 = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + 补(d.getMonth() + 1) + "/" + 补(d.getDate()) +
      " " + 补(d.getHours()) + ":" + 补(d.getMinutes()) + ":" + 补(d.getSeconds())
    );
  }

  /** 对齐 Form1：新日志插到最上方。必须用 textarea 的 value（pre 写 value 不会上屏） */
  function 写日志(文) {
    const 框 = $("infotextBox");
    const 行 = 时间戳() + "   " + 文;
    const 原 = 框.value != null && 框.value !== "" ? 框.value : (框.textContent || "");
    框.value = 行 + "\n" + 原;
  }

  /** 后端 push_log 的日志直接刷进日志区 */
  function 应用日志(s) {
    if (s && Array.isArray(s.logs) && s.logs.length) {
      $("infotextBox").value = s.logs.join("\n");
    }
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
        s.platform === "windows" ? "Windows · mstsc / 资源管理器"
          : s.platform === "darwin" ? "macOS · Windows App 远程 / 访达网盘"
            : s.platform === "browser" ? "浏览器预览" : s.platform;
    }
    应用日志(s);
    刷新界面();
  }

  function 刷新界面() {
    $("keylabel").textContent = 状态.密钥;
    $("infolabel").textContent = 状态.提示;
    $("namelabel").textContent = 状态.注册人 || "—";
    $("zhuchebutton").textContent = 按钮文案();
    const 点 = $("conn-pill");
    点.textContent = 状态.已连接 ? "已注册" : "未注册";
    点.classList.toggle("on", 状态.已连接);
    $("platform-badge").textContent = 状态.平台;
  }

  function mockInvoke(cmd, args) {
    switch (cmd) {
      case "init_key": {
        const 表 = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let k = "";
        for (let i = 0; i < 12; i++) k += 表[(Math.random() * 表.length) | 0];
        return Promise.resolve(k);
      }
      case "copy_key":
        if (navigator.clipboard) navigator.clipboard.writeText(状态.密钥).catch(() => {});
        return Promise.resolve({ info: "已复制" });
      case "register_key": {
        写日志("正在请求注册");
        写日志("（浏览器演示）模拟注册");
        状态.已连接 = !状态.已连接;
        状态.注册人 = 状态.已连接 ? "演示注册人" : "";
        写日志(状态.已连接 ? "连接成功" : "取消注册成功，已断开连接");
        return Promise.resolve({
          key: 状态.密钥,
          info: "单击密钥或按钮复制到粘贴板",
          register_name: 状态.注册人,
          register_btn: 按钮文案(),
          platform: "browser",
        });
      }
      case "toggle_connection":
        状态.已连接 = !状态.已连接;
        if (!状态.已连接) 状态.注册人 = "";
        写日志(状态.已连接 ? "连接成功" : "取消注册成功，已断开连接");
        return Promise.resolve({ register_btn: 按钮文案(), register_name: 状态.注册人 });
      case "clear_log":
        $("infotextBox").value = "";
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      case "quit_app":
        写日志("浏览器演示模式无法退出");
        return Promise.resolve({ info: "浏览器演示模式" });
      case "wake_host":
        写日志("请求唤醒: " + ((args && args.pcname) || "") + " (" + ((args && args.lanmac) || "") + ")");
        return Promise.resolve({ info: "唤醒指令已提交" });
      case "open_rdp": {
        const ip = (args && args.ip) || "";
        const st = String((args && args.pingstatus) || "");
        if (st === "0") {
          写日志(ip + "主机的IP不通，请先唤醒主机");
          return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
        }
        写日志("启动远程桌面:" + ip);
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      }
      case "open_directory":
        写日志("接收地址:" + ((args && args.path) || ""));
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      case "fetch_pc_list":
        return Promise.resolve(样本列表());
      case "browser_ping":
      case "get_public_config":
        return Promise.resolve({
          key: 状态.密钥,
          platform: "browser",
          welcome: "欢迎使用杰作科技网页弹出文件夹或文件的服务",
        });
      case "check_update":
        return Promise.resolve({ available: false, version: "本地预览", body: "浏览器演示不检查更新" });
      case "install_update":
        return Promise.resolve({ info: "浏览器演示不安装更新" });
      default:
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
    }
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

  function 可见列表() {
    const 词 = 状态.筛选词.trim().toLowerCase();
    return 状态.列表.filter((项) => {
      if (状态.筛选模式 === "online" && !项.status_online) return false;
      if (状态.筛选模式 === "offline" && 项.status_online) return false;
      if (!词) return true;
      return [项.hostname, 项.lan_mac, 项.lan_ip, 项.route_ip, 项.open_dir]
        .join(" ")
        .toLowerCase()
        .indexOf(词) >= 0;
    });
  }

  /** 源站用 0.0.0.0 表示「未探测到」——界面上显示为 —，避免看起来像解析错 */
  function 显示IP(v) {
    const s = (v || "").trim();
    if (!s || s === "0.0.0.0") return "—";
    return s;
  }

  function 建行(项) {
    const tr = document.createElement("tr");
    tr.className = "row";
    tr.dataset.id = 项.id;
    tr.innerHTML =
      '<td class="c-status"><span class="dot"></span><span class="badge"></span></td>' +
      '<td class="c-host"></td><td class="c-mac mono"></td>' +
      '<td class="c-lan mono"></td><td class="c-wan mono"></td>' +
      '<td class="col-act"><button type="button" class="btn-wake">唤醒</button></td>' +
      '<td class="col-act"><button type="button" class="btn-lan">本地连接</button></td>' +
      '<td class="col-act"><button type="button" class="btn-wan">远程连接</button></td>' +
      '<td class="col-act"><button type="button" class="btn-dir">网盘目录</button></td>';
    return tr;
  }

  /** 静默刷新：复用行节点，写回 scrollTop */
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
      let tr = 旧行.get(项.id) || 建行(项);
      if (!旧行.has(项.id)) 有变化.push(tr);
      const host = tr.querySelector(".c-host");
      const mac = tr.querySelector(".c-mac");
      const lan = tr.querySelector(".c-lan");
      const wan = tr.querySelector(".c-wan");
      const badge = tr.querySelector(".badge");
      const dot = tr.querySelector(".dot");
      if (host.textContent !== 项.hostname) {
        host.textContent = 项.hostname;
        有变化.push(tr);
      }
      mac.textContent = 项.lan_mac || "—";
      lan.textContent = 显示IP(项.lan_ip);
      lan.title = 项.lan_ip === "0.0.0.0" || !项.lan_ip ? "源站未探测到内网 IP（多为离线）" : 项.lan_ip;
      wan.textContent = 显示IP(项.route_ip);
      wan.title = 项.route_ip === "0.0.0.0" || !项.route_ip ? "源站未探测到路由 IP（多为离线）" : 项.route_ip;
      const 态 = 项.status_text || (项.status_online ? "在线" : "离线");
      badge.textContent = 态;
      badge.classList.toggle("on", !!项.status_online);
      badge.classList.toggle("off", !项.status_online);
      dot.classList.toggle("on", !!项.status_online);
      dot.classList.toggle("off", !项.status_online);
      tr.querySelector(".btn-wake").onclick = () => 唤醒(项);
      tr.querySelector(".btn-lan").onclick = () => 远程(项.lan_rdp_ip, 项.lan_rdp_ping);
      tr.querySelector(".btn-wan").onclick = () => 远程(项.remote_rdp_ip, 项.remote_rdp_ping);
      tr.querySelector(".btn-dir").onclick = () => 网盘(项);
      tr.querySelector(".btn-lan").disabled = !项.lan_rdp_ip || 项.lan_rdp_ip === "0.0.0.0";
      tr.querySelector(".btn-wan").disabled = !项.remote_rdp_ip || 项.remote_rdp_ip === "0.0.0.0";
      tr.querySelector(".btn-dir").disabled = !项.open_dir;
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
      "上次刷新 " + 时间戳().slice(11) + " · 滚动已保持 " + Math.round(滚动框.scrollTop);
    $("list-stats").textContent =
      "共 " + 状态.列表.length + " 台 · 显示 " + 项列.length + " 台";
  }

  function 唤醒(项) {
    const pcname = 项.hostname || "";
    const lanmac = 项.lan_mac || "";
    if (!lanmac || /^00:00:00:00:00:00$/i.test(lanmac)) {
      写日志("无法唤醒「" + pcname + "」：MAC 为空或全 0，源站未登记网卡地址");
      状态.提示 = "缺少 MAC，无法唤醒";
      刷新界面();
      return;
    }
    写日志("请求唤醒: " + pcname + " (" + lanmac + ")");
    invoke("wake_host", { pcname, lanmac })
      .then((s) => {
        应用状态(s);
        if (s && s.info) {
          写日志(s.info);
          状态.提示 = s.info;
          刷新界面();
        }
      })
      .catch((e) => {
        写日志("唤醒失败  " + e);
        状态.提示 = "唤醒失败";
        刷新界面();
      });
  }

  function 远程(ip, ping) {
    invoke("open_rdp", { ip: String(ip || ""), pingstatus: String(ping) }).then(应用状态);
  }

  function 网盘(项) {
    if (!项.open_dir) return;
    invoke("open_directory", { path: 项.open_dir }).then(应用状态);
  }

  async function 刷新(选项) {
    选项 = 选项 || {};
    if (正在刷新) return;
    正在刷新 = true;
    try {
      let 列表 = await invoke("fetch_pc_list");
      if (Array.isArray(列表) && 列表.length) {
        状态.列表 = 列表.map((x, i) =>
          Object.assign({ id: "row-" + i + "-" + (x.hostname || i) }, x)
        );
      }
      静默刷新列表({ flash: 选项.flash !== false });
      应用状态(await invoke("browser_ping"));
    } catch (e) {
      写日志("刷新失败: " + e);
    } finally {
      正在刷新 = false;
    }
  }

  function 复制密钥() {
    invoke("copy_key").then((s) => {
      应用状态(s);
      状态.提示 = "已复制";
      刷新界面();
    });
  }

  async function 启动注册() {
    $("zhuchebutton").disabled = true;
    写日志("点击注册：正在请求注册…");
    状态.提示 = "正在请求注册…";
    刷新界面();
    try {
      // 对齐 zhuchebutton_Click：注册 + socket_Tick
      const s = await invoke("register_key");
      应用状态(s);
      写日志(
        状态.注册人
          ? "注册完成，注册人=" + 状态.注册人 + "，" + 按钮文案()
          : "注册未取得注册人 —— 注册接口无有效返回（如 404），请修改配置里的 register_url_template；此时不会建立接收连接"
      );
    } catch (e) {
      写日志("点击注册失败  " + e);
      状态.提示 = "注册失败";
      刷新界面();
    } finally {
      $("zhuchebutton").disabled = false;
      setTimeout(() => 刷新({ flash: true }), 300);
    }
  }

  async function 检查更新() {
    const 按钮 = $("btn-check-update");
    按钮.disabled = true;
    写日志("正在检查更新…");
    try {
      const info = await invoke("check_update");
      if (info && info.available) {
        写日志("发现新版本 " + info.version + "（当前 " + (info.current || "") + "）");
        if (info.body) 写日志("更新说明: " + String(info.body).slice(0, 120));
        状态.提示 = "发现新版本 " + info.version;
        刷新界面();
        if (confirm("发现新版本 " + info.version + "，是否下载并安装？")) {
          写日志("开始下载安装更新…");
          await invoke("install_update");
        }
      } else {
        写日志("当前已是最新版本");
        状态.提示 = "已是最新版本";
        刷新界面();
      }
    } catch (e) {
      写日志("检查更新失败  " + e);
    } finally {
      按钮.disabled = false;
    }
  }

  function 绑定() {
    $("keybutton").addEventListener("click", 复制密钥);
    $("keylabel").addEventListener("click", 复制密钥);
    $("btn-copy-hint").addEventListener("click", 复制密钥);
    $("zhuchebutton").addEventListener("click", 启动注册);
    $("button1").addEventListener("click", () => {
      invoke("clear_log").then(() => { $("infotextBox").value = ""; });
    });
    $("button2").addEventListener("click", () => invoke("quit_app"));
    $("btn-refresh-now").addEventListener("click", () => 刷新({ flash: true }));
    $("btn-check-update") && $("btn-check-update").addEventListener("click", 检查更新);
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
    const 开关 = (开) => {
      帮助.classList.toggle("hidden", !开);
      $("btn-help").setAttribute("aria-expanded", 开 ? "true" : "false");
    };
    $("btn-help").addEventListener("click", () => 开关(帮助.classList.contains("hidden")));
    $("btn-help-close").addEventListener("click", () => 开关(false));
  }

  async function 启动() {
    绑定();
    $("infotextBox").value = "欢迎使用杰作科技网页弹出文件夹或文件的服务";
    try {
      const pub = await invoke("get_public_config");
      if (pub && pub.platform) 应用状态({ platform: pub.platform });
    } catch (_) {}
    try {
      const s = await invoke("browser_ping");
      应用状态(s);
    } catch (_) {}
    try {
      状态.密钥 = (await invoke("init_key")) || 状态.密钥;
    } catch (_) {}
    刷新界面();
    await 刷新({ flash: false });
    定时器 = setInterval(() => {
      if (状态.自动刷新) 刷新({ flash: true });
    }, 5000);
    写日志("界面已就绪 · macOS 远程桌面使用 Windows App");
  }

  启动();
})();
