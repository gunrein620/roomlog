import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { strict as assert } from "node:assert";

const composeSource = readFileSync("../../docker-compose.yml", "utf8");
const envExampleSource = readFileSync("../../.env.example", "utf8");
const readmeSource = readFileSync("../../README.md", "utf8");
const rootPackageSource = readFileSync("../../package.json", "utf8");

describe("Docker Postgres local database wiring", () => {
  it("uses PostgreSQL 18.3 and creates a local test database in Compose", () => {
    assert.match(composeSource, /image:\s*postgres:18\.3-alpine/);
    assert.match(composeSource, /POSTGRES_TEST_DB:\s*\$\{POSTGRES_TEST_DB:-roomlog_test\}/);
    assert.match(composeSource, /roomlog-postgres-data:\/var\/lib\/postgresql/);
    assert.doesNotMatch(composeSource, /roomlog-postgres-data:\/var\/lib\/postgresql\/data/);
    assert.match(composeSource, /docker\/postgres\/init:\/docker-entrypoint-initdb\.d:ro/);
    assert.match(composeSource, /pg_isready/);
  });

  it("documents localhost test database usage", () => {
    const testUrl = "postgresql://roomlog:roomlog@localhost:5433/roomlog_test?schema=public";

    assert.match(envExampleSource, new RegExp(`ROOMLOG_TEST_DATABASE_URL=${testUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    assert.match(readmeSource, /PostgreSQL 18\.3/);
    assert.match(readmeSource, new RegExp(testUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(rootPackageSource, /db:test:push/);
    assert.match(rootPackageSource, /prisma migrate diff --from-empty --to-schema prisma\/schema\.prisma --script/);
    assert.match(rootPackageSource, /docker exec -i roomlog-postgres psql/);
  });
});
