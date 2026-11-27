/* SatsGarden V28.2.1 · VHE Background Research Worker
 * 在独立后台线程执行样本外检验（OOS）、同现金流策略矩阵与全历史按月滚动回测，
 * 避免阻塞移动端首屏渲染与触控交互。纯本地计算，无网络请求，无账本访问。
 */
(function () {
  "use strict";

  var VHE = null;

  self.onmessage = function (ev) {
    var msg = ev && ev.data ? ev.data : {};
    if (msg.type === "init") {
      try {
        if (msg.engineUrl) {
          importScripts(msg.engineUrl);
        }
        VHE = self.VHEEngine || null;
        self.postMessage({
          type: "ready",
          ok: Boolean(VHE && typeof VHE.runBacktest === "function"),
          version: VHE ? VHE.VERSION : null
        });
      } catch (err) {
        self.postMessage({
          type: "ready",
          ok: false,
          error: String(err && err.message ? err.message : err)
        });
      }
      return;
    }

    if (msg.type !== "compute") return;

    if (!VHE) {
      self.postMessage({
        type: "result",
        reqId: msg.reqId,
        calcToken: msg.calcToken,
        task: msg.task,
        cacheKey: msg.cacheKey,
        ok: false,
        error: "VHE_ENGINE_NOT_READY"
      });
      return;
    }

    try {
      var out = null;
      if (msg.task === "oos") {
        out = VHE.runOutOfSampleEvaluation(msg.norm, msg.options || {});
      } else if (msg.task === "matrix") {
        out = VHE.compareStrategies(msg.norm, msg.activeBatch, msg.overrides || {});
      } else if (msg.task === "rolling") {
        out = VHE.runRollingTests(msg.norm, msg.config, msg.windows || [24, 36, 48]);
      } else {
        throw new Error("UNKNOWN_VHE_TASK:" + String(msg.task));
      }
      self.postMessage({
        type: "result",
        reqId: msg.reqId,
        calcToken: msg.calcToken,
        task: msg.task,
        cacheKey: msg.cacheKey,
        ok: true,
        data: out
      });
    } catch (err2) {
      self.postMessage({
        type: "result",
        reqId: msg.reqId,
        calcToken: msg.calcToken,
        task: msg.task,
        cacheKey: msg.cacheKey,
        ok: false,
        error: String(err2 && err2.message ? err2.message : err2)
      });
    }
  };
})();
