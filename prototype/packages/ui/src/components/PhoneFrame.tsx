import type { ReactNode } from "react";

export interface PhoneFrameProps {
  children: ReactNode;
  /** 상단 라벨(디바이스·역할 표기 등) */
  label?: ReactNode;
}

/** 임차인·업체 화면용 폰 프레임 (390×844 중앙 배치) */
export function PhoneFrame({ children, label }: PhoneFrameProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 0",
        fontFamily: "var(--font-sans)",
      }}
    >
      {label ? (
        <div
          style={{
            width: "var(--phone-w)",
            color: "var(--on-surface-variant)",
            fontSize: "var(--fs-caption)",
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          width: "var(--phone-w)",
          height: "var(--phone-h)",
          border: "1.5px solid var(--primary)",
          borderRadius: 22,
          background: "var(--surface-container-lowest)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          color: "var(--on-surface)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
