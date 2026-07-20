import pg from "pg";

const { Client } = pg;

// "안 찍은 항목" = RoomPlan이 감지만 하고 Object Capture로 실물을 찍은 적이 아예 없는 것(meshJobState
// null) 또는 찍었지만 서버 변환이 실패한 것(meshJobState FAILED). meshUrl이 있으면 항상 DONE이라
// meshUrl IS NULL 조건 하나로 DONE은 자동 제외되고, meshJobState 조건으로 CONVERTING(진행 중)만
// 따로 빼면 된다. apps/capture-ios가 세션 종료 시 스스로 정리하도록 고친 게 kjw-capture-discard-
// uncaptured 브랜치(#144) — 이 스크립트는 그 fix 이전에 이미 쌓인 것들의 일회성 정리용이다.
const ORPHAN_WHERE_CLAUSE = `"meshUrl" IS NULL AND ("meshJobState" IS NULL OR "meshJobState" = 'FAILED')`;

const pgConnectionString = (databaseUrl) => {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const execute = process.argv.includes("--execute");

  const client = new Client({ connectionString: pgConnectionString(databaseUrl) });
  await client.connect();
  try {
    const byState = await client.query(`
      SELECT "meshJobState", COUNT(*)::int AS count
      FROM "TenantFurniture"
      WHERE ${ORPHAN_WHERE_CLAUSE}
      GROUP BY "meshJobState"
      ORDER BY "meshJobState" NULLS FIRST
    `);
    const byTenant = await client.query(`
      SELECT "ownerTenantId", COUNT(*)::int AS count
      FROM "TenantFurniture"
      WHERE ${ORPHAN_WHERE_CLAUSE}
      GROUP BY "ownerTenantId"
      ORDER BY count DESC
    `);
    const total = byState.rows.reduce((sum, row) => sum + row.count, 0);

    console.log(`대상 행: 총 ${total}건`);
    for (const row of byState.rows) {
      console.log(`  meshJobState=${row.meshJobState ?? "NULL"}: ${row.count}건`);
    }
    console.log(`영향받는 테넌트: ${byTenant.rows.length}명`);
    for (const row of byTenant.rows) {
      console.log(`  ${row.ownerTenantId}: ${row.count}건`);
    }

    if (!execute) {
      console.log("\n(카운트만 했습니다. 실제로 지우려면 --execute를 붙여 다시 실행하세요.)");
      return;
    }

    const deleted = await client.query(`
      DELETE FROM "TenantFurniture"
      WHERE ${ORPHAN_WHERE_CLAUSE}
    `);
    console.log(`\n삭제 완료: ${deleted.rowCount}건`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`cleanup-orphan-tenant-furniture failed: ${error?.message || error}`);
  process.exitCode = 1;
});
