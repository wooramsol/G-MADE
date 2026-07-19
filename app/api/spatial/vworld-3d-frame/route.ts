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

  const scriptSrc = `https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${encodeURIComponent(key)}&domain=${encodeURIComponent(getVWorldDomain())}`;

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

  function camera(preset) {
    return new vw.CameraPosition(new vw.CoordZ(x, y, preset.h), new vw.Direction(0, preset.t, 0));
  }

  function notify(payload) {
    try { parent.postMessage(payload, window.location.origin); } catch (e) {}
  }

  function boot() {
    if (!(window.vw && window.vw.Map)) {
      if (Date.now() - startedAt > 25000) {
        notify({ type: "vworld3d-error", message: "3D 엔진 로드 실패 (인증키·서비스 URL 등록 또는 네트워크 확인 필요)" });
        return;
      }
      return setTimeout(boot, 150);
    }

    try {
      var init = camera(PRESETS.birds);
      map = new vw.Map();
      map.setOption({ mapId: "vmap", initPosition: init, logo: false, navigation: true });
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
    if (data.type === "vworld3d-preset" && map && PRESETS[data.preset]) {
      try { map.moveTo(camera(PRESETS[data.preset])); } catch (e) {}
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
