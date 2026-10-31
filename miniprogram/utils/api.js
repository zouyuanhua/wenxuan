/*
 * 后端 API 封装。
 * 开发者工具调试:在「详情 → 本地设置」勾选“不校验合法域名”即可访问 127.0.0.1。
 * 正式发布:必须改为 HTTPS 域名,并在小程序管理后台配置 request 合法域名。
 */
var BASE_URL = "http://127.0.0.1:2468";
var TIMEOUT = 75000;

function post(path, data) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: BASE_URL + path,
      method: "POST",
      data: data,
      timeout: TIMEOUT,
      header: { "Content-Type": "application/json" },
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          resolve(res.data);
        } else {
          var message = (res.data && res.data.error && res.data.error.message) || "解卦暂未完成，请稍后重试。";
          reject(new Error(message));
        }
      },
      fail: function () {
        reject(new Error("暂时无法连接解卦服务，请确认后端已启动并配置好域名。"));
      }
    });
  });
}

function interpret(payload) {
  return post("/api/interpret", payload);
}

module.exports = { BASE_URL: BASE_URL, interpret: interpret };
