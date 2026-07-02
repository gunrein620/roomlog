import { Badge, Button, Card } from "@roomlog/ui";
import { Body, Footer, REQUESTER, ScreenHeader, labelStyle, mutedStyle } from "../_components";

export default function Page() {
  return (
    <>
      <ScreenHeader title="링크를 사용할 수 없습니다" />
      <Body>
        <Card style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={labelStyle}>무효 사유</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <Badge>만료</Badge>
            <Badge>일회성 소진</Badge>
            <Badge>관리자 철회</Badge>
            <Badge>재발급 무효화</Badge>
          </div>
          <p style={{ ...mutedStyle, margin: 0 }}>
            이 화면에서는 하자 사진, 위치, 연락처 등 어떤 건 정보도 표시하지 않습니다.
          </p>
        </Card>
        <Card style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={labelStyle}>재요청</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{REQUESTER}</div>
          <p style={{ ...mutedStyle, margin: 0 }}>새 링크 요청은 토큰 없이 건 ID 기반 관리자 알림으로 전달됩니다.</p>
        </Card>
      </Body>
      <Footer>
        <Button fullWidth>관리자에게 새 링크 요청</Button>
        <Button fullWidth variant="secondary">발주처 연락 수단 보기</Button>
      </Footer>
    </>
  );
}
