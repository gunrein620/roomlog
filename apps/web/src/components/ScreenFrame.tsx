import { FRAMES } from "@/app/tenant/defect/_frames";
import FrameNav from "@/components/FrameNav";
import ScreenNav from "@/components/ScreenNav";

// 프레임 HTML을 와이어 그대로 렌더(inline style 보존)하고, 그 아래에
// nav-manifest 전이를 next/link 네비(ScreenNav)로 노출한다.
// 프레임 내부 CTA도 FrameNav의 data-nav 위임으로 동작한다(보너스).
// support.js 의존 동작(sc-if 조건분기)은 셸에선 무시된다.
export default function ScreenFrame({ id }: { id: string }) {
  const html = FRAMES[id];
  if (!html) {
    return (
      <div style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
        알 수 없는 화면: {id}
      </div>
    );
  }
  return (
    <>
      <FrameNav html={html} />
      <ScreenNav id={id} />
    </>
  );
}
