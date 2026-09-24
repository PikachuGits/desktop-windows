/**
 * 打开本地链接服务 — 对齐 Form1.cs / Form1.Designer.cs
 * 左侧控件行为 + 右侧 webBrowser1 内嵌列表页，并挂钩 id=iprdp（link_Click）。
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const invoke = (cmd, args) => {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (core && typeof core.invoke === "function") return core.invoke(cmd, args);
    return mockInvoke(cmd, args);
  };

  let key = "这里显示KEY";
  let registerName = "";
  let connected = false;
  let platform = "browser";
  let listUrl = "";
  let refreshTimer = null;
  let booted = false;
  let msgSeq = 0;

  function nowLabel() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
      d.getFullYear() + "/" + p(d.getMonth() + 1) + "/" + p(d.getDate()) +
      " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
    );
  }

  /** 对齐 infotextBox.Text = time + msg + "\\r\\n" + 原文 */
  function log(msg) {
    const box = $("infotextBox");
    const line = nowLabel() + "   " + msg;
    box.value = line + "\r\n" + (box.value || "");
  }

  function setInfo(text) {
    $("infolabel").textContent = text;
  }

  function registerBtnText() {
    return connected ? "点击断开(已注册)" : "点击注册(未注册)";
  }

  function apply(s) {
    if (!s) return;
    if (s.key) {
      key = s.key;
      $("keylabel").textContent = key;
    }
    if (s.info) setInfo(s.info);
    if (typeof s.register_name === "string") {
      registerName = s.register_name;
      $("namelabel").textContent = registerName;
    }
    if (s.register_btn) {
      connected = s.register_btn.indexOf("断开") >= 0;
      $("zhuchebutton").textContent = s.register_btn;
    } else {
      $("zhuchebutton").textContent = registerBtnText();
    }
    if (s.platform) platform = s.platform;
    if (s.logs && s.logs.length && $("infotextBox").dataset.sync === "1") {
      $("infotextBox").value = s.logs.join("\r\n");
    }
    if (s.browser_url && !listUrl) listUrl = s.browser_url;
    if (s.welcome && !$("infotextBox").value) $("infotextBox").value = s.welcome;
  }

  function mockInvoke(cmd, args) {
    switch (cmd) {
      case "init_key":
        return Promise.resolve(randKey(12));
      case "copy_key":
        if (navigator.clipboard) navigator.clipboard.writeText(key).catch(() => {});
        return Promise.resolve({ info: "已复制", key });
      case "register_key": {
        log("正在请求注册");
        if (!registerName) registerName = "演示注册人";
        log("（浏览器演示）注册完成");
        connected = !connected;
        log(connected ? "连接成功" : "取消注册成功，已断开连接");
        if (!connected) registerName = "";
        return Promise.resolve({
          key,
          info: "单击密钥或按钮复制到粘贴板",
          register_name: registerName,
          register_btn: registerBtnText(),
          platform: "browser",
          welcome: "欢迎使用杰作科技网页弹出文件夹或文件的服务",
        });
      }
      case "toggle_connection": {
        connected = !connected;
        log(connected ? "连接成功" : "取消注册成功，已断开连接");
        if (!connected) registerName = "";
        return Promise.resolve({
          register_name: registerName,
          register_btn: registerBtnText(),
          info: "单击密钥或按钮复制到粘贴板",
        });
      }
      case "clear_log":
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      case "quit_app":
        log("浏览器演示模式无法退出");
        return Promise.resolve({ info: "浏览器演示模式" });
      case "open_rdp": {
        const ip = (args && args.ip) || "";
        const st = String((args && args.pingstatus) || "");
        if (st === "0") {
          log(ip + "主机的IP不通，请先唤醒主机");
          return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
        }
        log("启动远程桌面:" + ip + "  administrator  （口令来自本地配置）");
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      }
      case "open_directory":
        log("接收地址:" + ((args && args.path) || ""));
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
      case "browser_ping":
      case "get_public_config":
        return Promise.resolve({ key, platform: "browser", welcome: "欢迎使用杰作科技网页弹出文件夹或文件的服务" });
      case "fetch_page_html":
        return Promise.resolve("");
      default:
        return Promise.resolve({ info: "单击密钥或按钮复制到粘贴板" });
    }
  }

  function randKey(len) {
    const s = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let o = "";
    for (let i = 0; i < len; i++) o += s[(Math.random() * s.length) | 0];
    return o;
  }

  /* 对齐 CopyToClipboard + infolabel = "已复制" */
  function copyKey() {
    invoke("copy_key").then((s) => {
      apply(s);
      setInfo("已复制");
    });
  }

  /* 对齐 zhuchebutton_Click：注册 + socket_Tick */
  function onRegister() {
    $("zhuchebutton").disabled = true;
    invoke("register_key")
      .then((s) => {
        apply(s);
        $("zhuchebutton").textContent = registerBtnText();
      })
      .catch((e) => log("请求注册失败  " + e))
      .finally(() => {
        $("zhuchebutton").disabled = false;
        setTimeout(pull, 400);
      });
  }

  function onClearLog() {
    invoke("clear_log").then(() => {
      $("infotextBox").value = "";
    });
  }

  function onQuit() {
    invoke("quit_app");
  }

  function pull() {
    return invoke("browser_ping").then(apply).catch(() => {});
  }

  /**
   * 右侧 webBrowser1：拉取列表页 HTML，改写为同源后注入 iframe，
   * 等价 DocumentCompleted 后挂钩 id=iprdp（Form1.link_Click）。
   */
  function injectPage(html) {
    const frame = $("webBrowser1");
    const fallback = $("web-fallback");
    try {
      const base = listUrl.replace(/\/[^/]*$/, "/");
      // 去掉页面自带 meta 刷新，改由本窗 5 秒静默刷新（避免卷回顶部）
      let doc = html.replace(
        /<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi,
        ""
      );
      // 相对地址改写，保证 wol.php / 样式可加载
      doc = doc.replace(/<head([^>]*)>/i, (m, a) => {
        return m + "\n<base href=\"" + base + "\">";
      });
      const hook =
        "<script>(function(){\n" +
        "var __seq=0;\n" +
        "function post(msg){ try { msg.__seq = Date.now(); window.parent.postMessage(msg,'*'); } catch(e){} }\n" +
        "document.addEventListener('click', function(e){\n" +
        "  var a = e.target && e.target.closest ? e.target.closest('a') : null;\n" +
        "  if(!a) return;\n" +
        "  var id = a.id || a.getAttribute('id') || '';\n" +
        "  if(id === 'iprdp' || id === 'opendir') e.preventDefault();\n" +
        "  if(id === 'iprdp'){\n" +
        "    e.stopPropagation();\n" +
        "    post({type:'iprdp', ip:a.getAttribute('data-ip')||'', pingstatus:a.getAttribute('data-pingstatus')||''});\n" +
        "  } else if(id === 'opendir'){\n" +
        "    e.stopPropagation();\n" +
        "    post({type:'opendir', dir:a.getAttribute('data-dir')||''});\n" +
        "  }\n" +
        "}, true);\n" +
        "})();<\/script>";
      if (/<\/body>/i.test(doc)) {
        doc = doc.replace(/<\/body>/i, hook + "</body>");
      } else {
        doc += hook;
      }
      frame.srcdoc = doc;
      fallback.classList.add("hidden");
    } catch (e) {
      fallback.classList.remove("hidden");
      log("内嵌页面加载失败: " + e);
    }
  }

  function loadBrowser() {
    if (!listUrl) {
      $("web-fallback").classList.remove("hidden");
      return Promise.resolve();
    }
    // 优先后端拉取（跨域不拦），失败则前端 fetch
    return invoke("fetch_page_html")
      .then((html) => {
        if (html && html.length > 20) return html;
        return fetch(listUrl, { cache: "no-store" }).then((r) => r.text());
      })
      .then(injectPage)
      .catch((e) => {
        $("web-fallback").classList.remove("hidden");
        log("无法加载右侧页面: " + e);
      });
  }

  /** 对齐 label3「右侧5秒自动刷新」：静默刷新，尽量保留 iframe 内滚动 */
  function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      const frame = $("webBrowser1");
      let scrollTop = 0;
      try {
        const d = frame.contentDocument;
        if (d && d.scrollingElement) scrollTop = d.scrollingElement.scrollTop;
      } catch (_) {}
      loadBrowser().then(() => {
        const restore = () => {
          try {
            const d = $("webBrowser1").contentDocument;
            if (d && d.scrollingElement) d.scrollingElement.scrollTop = scrollTop;
          } catch (_) {}
          $("webBrowser1").removeEventListener("load", restore);
        };
        $("webBrowser1").addEventListener("load", restore);
      });
    }, 5000);
  }

  function onWindowMessage(ev) {
    const d = ev.data;
    if (!d || typeof d !== "object") return;
    // 同一点击只处理一次，防止 message 重复导致开两个资源管理器
    if (d.__seq && d.__seq <= msgSeq) return;
    if (d.__seq) msgSeq = d.__seq;
    if (d.type === "iprdp") {
      invoke("open_rdp", { ip: d.ip, pingstatus: String(d.pingstatus) })
        .then(apply)
        .catch((e) => log(String(e)));
    } else if (d.type === "opendir") {
      invoke("open_directory", { path: d.dir })
        .then(apply)
        .catch((e) => log(String(e)));
    }
  }

  function bind() {
    $("keybutton").addEventListener("click", copyKey);
    $("keylabel").addEventListener("click", copyKey);
    $("zhuchebutton").addEventListener("click", onRegister);
    $("button1").addEventListener("click", onClearLog);
    $("button2").addEventListener("click", onQuit);
    window.addEventListener("message", onWindowMessage);
  }

  async function boot() {
    if (booted) return;
    booted = true;
    bind();
    $("infotextBox").value = "欢迎使用杰作科技网页弹出文件夹或文件的服务";
    setInfo("单击密钥或按钮复制到粘贴板");
    $("keylabel").textContent = "这里显示KEY";

    try {
      const pub = await invoke("get_public_config");
      if (pub && pub.pc_list_url) listUrl = pub.pc_list_url;
    } catch (_) {}
    try {
      const s = await invoke("browser_ping");
      apply(s);
    } catch (_) {}
    try {
      const k = await invoke("init_key");
      if (k) {
        key = k;
        $("keylabel").textContent = key;
      }
    } catch (_) {}

    $("zhuchebutton").textContent = registerBtnText();
    await loadBrowser();
    startAutoRefresh();
  }

  boot();
})();
