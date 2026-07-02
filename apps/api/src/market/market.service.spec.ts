import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { fetchMonth, parseMolitXml, recentDealMonths, summarize } from "./market.service";

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
  <body>
    <items>
      <item>
        <aptNm>방배 루미에르</aptNm>
        <deposit>1,000</deposit>
        <monthlyRent>130</monthlyRent>
        <excluUseAr>24.5</excluUseAr>
        <floor>4</floor>
        <buildYear>2021</buildYear>
        <umdNm>방배동</umdNm>
        <sggCd>11650</sggCd>
        <dealYear>2026</dealYear>
        <dealMonth>5</dealMonth>
        <dealDay>7</dealDay>
      </item>
      <item>
        <aptNm>방배 명지 해든터</aptNm>
        <deposit>46,000</deposit>
        <monthlyRent>0</monthlyRent>
        <excluUseAr>84.97</excluUseAr>
        <floor>12</floor>
        <buildYear>2018</buildYear>
        <umdNm>방배동</umdNm>
        <sggCd>11650</sggCd>
        <dealYear>2026</dealYear>
        <dealMonth>6</dealMonth>
        <dealDay>2</dealDay>
      </item>
    </items>
  </body>
</response>`;

describe("MarketService helpers", () => {
  it("parses MOLIT rent XML into normalized transactions", () => {
    const rows = parseMolitXml(SAMPLE_XML, "apt");

    assert.equal(rows.length, 2);
    assert.equal(rows[0].complexName, "방배 루미에르");
    assert.equal(rows[0].tradeType, "월세");
    assert.equal(rows[0].depositManwon, 1000);
    assert.equal(rows[0].monthlyRentManwon, 130);
    assert.equal(rows[0].areaM2, 24.5);
    assert.equal(rows[0].floor, 4);
    assert.equal(rows[0].dealDate, "2026-05-07");
    assert.equal(rows[1].tradeType, "전세");
    assert.equal(rows[1].depositManwon, 46000);
  });

  it("summarizes monthly and jeonse averages separately", () => {
    const summary = summarize(parseMolitXml(SAMPLE_XML, "apt"), "11650", "apt");

    assert.equal(summary.count, 2);
    assert.equal(summary.monthlyCount, 1);
    assert.equal(summary.jeonseCount, 1);
    assert.equal(summary.avgDepositManwon, 1000);
    assert.equal(summary.avgMonthlyRentManwon, 130);
    assert.equal(summary.avgJeonseDepositManwon, 46000);
    // recent is sorted by dealDate desc → 6월 거래가 먼저
    assert.equal(summary.recent[0].dealDate, "2026-06-02");
  });

  it("builds the request without double-encoding the service key and skips the current month", async () => {
    const requested: string[] = [];
    const rows = await fetchMonth({
      serviceKey: "raw+key/with=chars",
      lawdCd: "11650",
      dealYmd: "202605",
      propertyType: "apt",
      fetchImpl: async (url) => {
        requested.push(String(url));
        return { ok: true, text: async () => SAMPLE_XML } as Response;
      }
    });

    assert.equal(rows.length, 2);
    assert.ok(requested[0].includes("serviceKey=raw+key/with=chars"));
    assert.ok(requested[0].includes("LAWD_CD=11650"));
    assert.ok(requested[0].includes("DEAL_YMD=202605"));

    const months = recentDealMonths(3, new Date(2026, 6, 15)); // 2026-07
    assert.deepEqual(months, ["202606", "202605", "202604"]);
  });

  it("returns an empty array for MOLIT error result codes", async () => {
    await assert.rejects(
      fetchMonth({
        serviceKey: "k",
        lawdCd: "11650",
        dealYmd: "202605",
        propertyType: "apt",
        fetchImpl: async () =>
          ({
            ok: true,
            text: async () =>
              "<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR</resultMsg></header></response>"
          }) as Response
      })
    );
  });
});
