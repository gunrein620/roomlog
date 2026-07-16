import { getManagerVendorDetail } from "@/lib/vendor-mgmt-api";
import { MANAGER_VENDOR_MGMT_PATHS } from "@/lib/vendor-mgmt-nav";
import { ManagerMutationForm } from "../../../_components/ManagerMutationForm";
import { archiveVendorAction, updateVendorNoteAction } from "../../actions";
import {
  ErrorState,
  JobTable,
  KeyValueGrid,
  LinkButton,
  MetricGrid,
  TagList,
  VendorPageStack,
  VendorScreenHeader,
  VendorSection,
  accountStatusLabel,
  formatDate,
  styles,
  verificationLabel,
} from "../../_components";

type Params = Promise<{ vendorId: string }>;

export default async function ManagerVendorDetailPage({ params }: { params: Params }) {
  const { vendorId } = await params;
  try {
    const result = await getManagerVendorDetail(vendorId);
    const { vendor, jobs, performance } = result.data;
    return (
      <VendorPageStack>
        <VendorScreenHeader
          eyebrow="내 업체 상세"
          title={vendor.catalog.businessName}
          description="연락처와 내부 메모는 관리자에게만 보입니다. 작업 이력은 이 관리자의 하자 건으로 제한됩니다."
          demo={result.source === "DEMO"}
          actions={
            <LinkButton href={MANAGER_VENDOR_MGMT_PATHS.performance(vendor.vendorId)} secondary>
              수치 성과 보기
            </LinkButton>
          }
        />
        <MetricGrid metrics={[
          { label: "진행 작업", value: `${vendor.activeJobCount}건` },
          { label: "결제 대기", value: `${vendor.waitingPaymentCount}건` },
          { label: "완료 작업", value: `${vendor.completedJobCount}건` },
          { label: "등록일", value: formatDate(vendor.registeredAt) },
        ]} />
        <VendorSection title="업체 정보" description="운영팀 원장에 등록된 읽기 전용 정보입니다.">
          <KeyValueGrid rows={[
            { label: "담당자", value: vendor.catalog.contactPerson },
            { label: "연락처", value: vendor.catalog.phone },
            { label: "사업자번호", value: vendor.catalog.businessNumber ?? "미등록" },
            { label: "검증", value: verificationLabel[vendor.catalog.verificationStatus] },
            { label: "계정", value: accountStatusLabel[vendor.accountStatus] },
            { label: "서비스 지역", value: vendor.catalog.serviceAreas.join(", ") },
            { label: "전문 분야", value: <TagList values={vendor.catalog.trades} /> },
            { label: "최근 성과 반영", value: formatDate(performance.updatedAt) },
          ]} />
        </VendorSection>
        <VendorSection title="관리자 메모" description="전역 업체 원장은 바꾸지 않고 이 관리자에게만 보이는 메모를 저장합니다.">
          <ManagerMutationForm action={updateVendorNoteAction} className={styles.formCard}>
            <input type="hidden" name="vendorId" value={vendor.vendorId} />
            <label className={styles.field}>
              내부 메모
              <textarea className={styles.textarea} name="managerNote" defaultValue={vendor.managerNote ?? ""} placeholder="출동 가능 시간, 정산 참고사항 등을 기록하세요." disabled={result.source === "DEMO"} />
            </label>
            <div className={styles.actions}><button className={styles.button} type="submit" disabled={result.source === "DEMO"}>메모 저장</button></div>
          </ManagerMutationForm>
        </VendorSection>
        <VendorSection title="작업 이력" description="견적·완료·결제 상태를 같은 repair 단위로 확인합니다.">
          <JobTable jobs={jobs} />
        </VendorSection>
        <VendorSection title="내 업체에서 해제" description="업체 원장과 과거 작업 이력은 유지되고 새 배정 후보에서만 제외됩니다.">
          <ManagerMutationForm action={archiveVendorAction}>
            <input type="hidden" name="vendorId" value={vendor.vendorId} />
            <button className={styles.dangerButton} type="submit" disabled={result.source === "DEMO"}>내 업체에서 해제</button>
          </ManagerMutationForm>
        </VendorSection>
      </VendorPageStack>
    );
  } catch (error) {
    return (
      <VendorPageStack>
        <VendorScreenHeader eyebrow="내 업체 상세" title="업체 상세" description="업체 정보를 확인합니다." />
        <ErrorState message={error instanceof Error ? error.message : "업체를 불러오지 못했습니다."} />
      </VendorPageStack>
    );
  }
}
