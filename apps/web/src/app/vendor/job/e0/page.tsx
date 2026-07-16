import { Badge, Card } from "@roomlog/ui";
import { ROUTES } from "@/lib/vendor-nav";
import { Body, Footer, LinkButton, ScreenHeader, labelStyle, mutedStyle } from "../_components";

export default function Page() {
  return (
    <>
      <ScreenHeader title="작업에 접근할 수 없습니다" />
      <Body>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>무효 사유</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Badge>만료</Badge>
            <Badge>배정 취소</Badge>
            <Badge>관리자 철회</Badge>
            <Badge>재발급 무효화</Badge>
          </div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            이 화면에서는 하자 사진, 위치, 연락처 등 어떤 건 정보도 표시하지 않습니다.
          </p>
        </Card>
        <p style={{ ...mutedStyle, margin: 0 }}>
          현재 로그인한 업체 계정에 배정된 작업만 열 수 있습니다. 작업 목록에서 다시 확인해 주세요.
        </p>
      </Body>
      <Footer>
        <LinkButton href={ROUTES["V-JOB-00"]}>작업 목록으로 돌아가기</LinkButton>
      </Footer>
    </>
  );
}
