import assert from "node:assert/strict";
import test from "node:test";
import { mergeAddressWithAdminRegion, resolveOrdinanceLocation } from "@/lib/address/resolve-location-label";
import { buildOrdinSearchPlans } from "@/lib/law/query-plan";
import { parseJurisdiction } from "@/lib/law/jurisdiction";
import { buildAdminRegion } from "@/lib/vworld/address-detail";

test("parseJurisdiction extracts province, county, and town for Yangpyeong", () => {
  const parsed = parseJurisdiction("경기도 양평군 양평읍 갈미길 36");
  assert.equal(parsed.province, "경기도");
  assert.equal(parsed.city, "양평군");
  assert.equal(parsed.town, "양평읍");
  assert.equal(parsed.orgCode, "6410000");
  assert.deepEqual(parsed.labels, ["양평읍", "양평군", "경기도"]);
});

test("mergeAddressWithAdminRegion prefixes road-only address", () => {
  assert.equal(
    mergeAddressWithAdminRegion("경기도 양평군 양평읍", "갈미길 36"),
    "경기도 양평군 양평읍 갈미길 36",
  );
});

test("resolveOrdinanceLocation uses adminRegion from locationPoint", () => {
  const location = resolveOrdinanceLocation({
    location: "갈미길 36",
    locationPoint: { x: 127.5, y: 37.4, source: "map", adminRegion: "경기도 양평군 양평읍" },
  });
  assert.equal(location, "경기도 양평군 양평읍 갈미길 36");
});

test("buildOrdinSearchPlans includes town and county labels", () => {
  const plans = buildOrdinSearchPlans(
    {
      id: "p1",
      name: "테스트",
      location: "경기도 양평군 양평읍 갈미길 36",
      client: "",
      designer: "",
      projectType: "",
      scale: "",
      reviewType: "경관사전심의",
      receivedAt: "2026-07-08",
      status: "접수",
      files: [],
    },
    [],
  );

  assert.ok(plans.some((plan) => plan.query === "양평읍 경관 조례"));
  assert.ok(plans.some((plan) => plan.query === "양평군 경관 조례"));
  assert.ok(plans.some((plan) => plan.query === "경기도 경관 조례"));
  assert.equal(plans[0]?.orgCode, "6410000");
});

test("buildAdminRegion composes hierarchy from structure", () => {
  assert.equal(
    buildAdminRegion({
      province: "경기도",
      city: "양평군",
      town: "양평읍",
      village: null,
      road: null,
      buildingNo: null,
    }),
    "경기도 양평군 양평읍",
  );
});
