-- 기존 청구 중 호실 번호가 전역에서 하나의 Room에만 대응하는 경우만 안전하게 연결한다.
-- 같은 호수가 여러 건물에 존재하는 모호한 행은 잘못된 임차인에게 노출하지 않도록 NULL로 남긴다.
-- 해당 행은 운영자가 건물 정보를 확인한 뒤 Bill.roomId를 명시적으로 지정해야 한다.
WITH "BillRoomCandidates" AS (
  SELECT
    bill."id" AS "billId",
    MIN(room."id") AS "roomId",
    COUNT(*)::INTEGER AS "candidateCount"
  FROM "Bill" AS bill
  JOIN "Room" AS room
    ON bill."roomId" IS NULL
    AND (
      TRIM(bill."unitId") = room."id"
      OR REGEXP_REPLACE(TRIM(bill."unitId"), '[[:space:]]*호[[:space:]]*$', '', 'g') =
         REGEXP_REPLACE(TRIM(room."roomNo"), '[[:space:]]*호[[:space:]]*$', '', 'g')
    )
  GROUP BY bill."id"
)
UPDATE "Bill" AS bill
SET "roomId" = candidate."roomId"
FROM "BillRoomCandidates" AS candidate
WHERE bill."id" = candidate."billId"
  AND candidate."candidateCount" = 1;
