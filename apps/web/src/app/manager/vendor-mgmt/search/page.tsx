import { searchVendorCatalog } from "@/lib/vendor-mgmt-api";
import { ManagerMutationForm } from "../../_components/ManagerMutationForm";
import { registerVendorAction } from "../actions";
import {
  CatalogIdentity,
  EmptyState,
  ErrorState,
  StatusPill,
  TagList,
  VendorPageStack,
  VendorScreenHeader,
  VendorSection,
  accountStatusLabel,
  assignmentBlockLabel,
  styles,
  verificationLabel,
} from "../_components";

type SearchParams = Promise<{ query?: string; trade?: string }>;

export default async function VendorSearchPage({ searchParams }: { searchParams: SearchParams }) {
  const { query = "", trade = "" } = await searchParams;
  try {
    const result = await searchVendorCatalog({
      query,
      trade: trade || undefined,
      isActive: true,
    });
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="운영팀 업체 원장"
          title="업체 찾기"
          description="운영팀이 미리 등록한 업체를 검색해 내 업체로 연결합니다. 이 화면에서는 업체 정보를 새로 만들거나 수정할 수 없습니다."
          demo={result.source === "DEMO"}
        />
        <VendorSection title="업체 검색" description="업체명·담당자·전화번호 또는 전문 분야로 찾을 수 있습니다.">
          <form className={styles.filterForm}>
            <label className={styles.field}>
              업체 검색
              <input className={styles.input} name="query" defaultValue={query} placeholder="업체명, 담당자, 전화번호" />
            </label>
            <label className={styles.field}>
              전문 분야
              <input className={styles.input} name="trade" defaultValue={trade} placeholder="예: 배관" />
            </label>
            <button className={styles.button} type="submit">검색</button>
          </form>
        </VendorSection>
        <VendorSection title={`${result.data.length}개 검색 결과`} description="운영 검증과 계정 연결을 완료한 업체만 표시합니다.">
          {result.data.length > 0 ? (
            <div className={styles.searchResultGrid}>
              {result.data.map((candidate) => (
                <article className={styles.searchResult} key={candidate.catalog.id}>
                  <CatalogIdentity catalog={candidate.catalog} />
                  <div><TagList values={candidate.catalog.trades} /><span className={styles.subtle}>{candidate.catalog.serviceAreas.join(", ")}</span></div>
                  <div className={styles.statusStack}>
                    <span>검증 상태 <strong>{verificationLabel[candidate.catalog.verificationStatus]}</strong></span>
                    <span>계정 상태 <strong>{accountStatusLabel[candidate.accountStatus]}</strong></span>
                    <div className={styles.statusReasonList}>
                      {candidate.canAssign ? (
                        <StatusPill active>배정 가능</StatusPill>
                      ) : candidate.assignmentBlockReasons.map((reason) => (
                        <StatusPill active={false} key={reason}>{assignmentBlockLabel[reason]}</StatusPill>
                      ))}
                    </div>
                  </div>
                  {candidate.registrationStatus === "ACTIVE" ? (
                    <button className={styles.secondaryButton} type="button" disabled>내 업체 등록됨</button>
                  ) : (
                    <ManagerMutationForm action={registerVendorAction}>
                      <input type="hidden" name="vendorId" value={candidate.catalog.id} />
                      <button className={styles.button} type="submit" disabled={result.source === "DEMO"}>내 업체 등록</button>
                    </ManagerMutationForm>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="검색 결과가 없습니다" description="검색어를 줄이거나 다른 전문 분야로 다시 찾아보세요." />
          )}
        </VendorSection>
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <VendorScreenHeader eyebrow="운영팀 업체 원장" title="업체 찾기" description="등록된 업체를 검색합니다." />
        <ErrorState message={error instanceof Error ? error.message : "업체를 검색하지 못했습니다."} />
      </VendorPageStack>
    );
  }
}
