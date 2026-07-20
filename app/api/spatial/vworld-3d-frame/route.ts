import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getVWorldApiKey, getVWorldDomain } from "@/lib/vworld/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 브이월드 WebGL 3D 지도를 담는 iframe용 HTML 페이지.
 * 브이월드 로더가 document.write로 하위 스크립트를 주입하기 때문에
 * React에서 동적 로드하면 초기화가 실패한다 — 일반 HTML 문서로 로드해야 한다.
 * 카메라 프리셋은 부모 창의 postMessage(vworld3d-preset)로 전환한다.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const key = getVWorldApiKey();
  if (!key) {
    return NextResponse.json({ error: "서버에 VWORLD_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const x = Number(request.nextUrl.searchParams.get("x"));
  const y = Number(request.nextUrl.searchParams.get("y"));
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: "x·y 좌표가 필요합니다." }, { status: 400 });
  }

  // 주의: 브이월드 로더는 domain에 'https:' 문자열이 없으면 엔진 하위 스크립트를
  // http://로 주입한다 → https 페이지에서 혼합 콘텐츠로 차단되어 초기화 실패.
  // 반드시 프로토콜을 포함해 전달한다.
  const scriptSrc = `https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${encodeURIComponent(key)}&domain=${encodeURIComponent(`https://${getVWorldDomain()}`)}`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0b1220}#vmap{width:100%;height:100%}</style>
<script type="text/javascript" src="${scriptSrc}"></script>
</head>
<body>
<div id="vmap"></div>
<script type="text/javascript">
(function () {
  var x = ${JSON.stringify(x)};
  var y = ${JSON.stringify(y)};
  var PRESETS = { birds: { h: 600, t: -45 }, persp: { h: 200, t: -15 }, top: { h: 800, t: -90 } };
  var map = null;
  var startedAt = Date.now();
  var scriptErrors = [];
  window.onerror = function (message, source) {
    scriptErrors.push(String(message) + (source ? " @" + String(source).split("/").slice(-1)[0] : ""));
    return false;
  };

  var current = { preset: "birds", heading: 0 };

  function camera() {
    var preset = PRESETS[current.preset];
    return new vw.CameraPosition(new vw.CoordZ(x, y, preset.h), new vw.Direction(current.heading, preset.t, 0));
  }

  function moveCamera() {
    if (!map) return;
    try { map.moveTo(camera()); } catch (e) {}
  }

  function notify(payload) {
    try { parent.postMessage(payload, window.location.origin); } catch (e) {}
  }

  function boot() {
    if (!(window.vw && window.vw.Map)) {
      if (Date.now() - startedAt > 40000) {
        var detail = "vw=" + (typeof window.vw) + ", host=" + window.location.hostname;
        if (scriptErrors.length > 0) detail += ", errors: " + scriptErrors.slice(0, 3).join(" | ");
        notify({
          type: "vworld3d-error",
          message: "3D 엔진 로드 실패 — 인증키 서비스 URL과 접속 도메인이 일치하는지 확인해 주세요. [" + detail + "]",
        });
        return;
      }
      return setTimeout(boot, 150);
    }

    try {
      var init = camera();
      map = new vw.Map();
      // navigation:false — 현재위치 등 기본 위젯 숨김 (회전·프리셋은 부모 UI 버튼으로 제어)
      map.setOption({ mapId: "vmap", initPosition: init, logo: false, navigation: false });
      map.setMapId("vmap");
      map.setInitPosition(init);
      map.start();
      notify({ type: "vworld3d-ready" });
    } catch (error) {
      notify({ type: "vworld3d-error", message: String(error && error.message ? error.message : error) });
    }
  }

  window.addEventListener("message", function (event) {
    var data = event.data || {};
    if (data.type === "vworld3d-preset" && PRESETS[data.preset]) {
      current.preset = data.preset;
      moveCamera();
    } else if (data.type === "vworld3d-rotate" && typeof data.delta === "number") {
      current.heading = (current.heading + data.delta + 360) % 360;
      moveCamera();
    } else if (data.type === "vworld3d-home") {
      current.preset = "birds";
      current.heading = 0;
      moveCamera();
    }
  });

  boot();
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
