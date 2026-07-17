"use client";

// 3D 투어 파일(수십~수백 MB) 백그라운드 업로드의 전역 진행 상태.
// 제출 핸들러(LandlordMyPage)와 상단 진행바(HomeApp의 web-topbar 하단 배너)는
// 트리상 떨어져 있어 상태를 공유해야 한다 — realtime-client처럼 모듈 스코프 싱글턴 +
// useSyncExternalStore 구독으로 가볍게 공유한다. 업로드 프로미스는 이 모듈이 붙잡으므로
// 폼 리셋·탭 이동에도 살아남는다.

import { useSyncExternalStore } from "react";
import { intakeSplatAssetSmart, type IntakeSplatAssetInput } from "@/lib/splat-asset-api";

export type TourUploadStatus = "idle" | "uploading" | "error";

export interface TourUploadState {
  /** 배너 노출 여부 (uploading 또는 error일 때 true) */
  active: boolean;
  /** 0~100 전송 진행률 */
  percent: number;
  status: TourUploadStatus;
  /** 업로드 중인 파일명 (배너 부가 표기용) */
  fileName: string | null;
}

const IDLE_STATE: TourUploadState = { active: false, percent: 0, status: "idle", fileName: null };

let state: TourUploadState = IDLE_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<TourUploadState>) {
  const next = { ...state, ...patch };
  next.active = next.status === "uploading" || next.status === "error";
  state = next;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TourUploadState {
  return state;
}

/** SSR 스냅샷은 항상 idle (서버엔 업로드가 없다). */
function getServerSnapshot(): TourUploadState {
  return IDLE_STATE;
}

/** 배너/컴포넌트가 전역 업로드 상태를 구독한다. */
export function useTourUploadState(): TourUploadState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// 업로드 중 탭을 닫으면 전송이 유실되므로 이탈 경고를 건다.
let beforeUnloadBound = false;
function handleBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}
function bindBeforeUnload() {
  if (beforeUnloadBound || typeof window === "undefined") return;
  window.addEventListener("beforeunload", handleBeforeUnload);
  beforeUnloadBound = true;
}
function unbindBeforeUnload() {
  if (!beforeUnloadBound || typeof window === "undefined") return;
  window.removeEventListener("beforeunload", handleBeforeUnload);
  beforeUnloadBound = false;
}

let errorTimer: ReturnType<typeof setTimeout> | null = null;

/** 에러 배너를 수동으로 닫는다 (자동 타임아웃 전이라도). */
export function dismissTourUpload() {
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
  setState(IDLE_STATE);
}

/**
 * 3D 투어 파일 업로드를 백그라운드로 시작한다. 반환 프로미스를 await하지 않아도
 * 이 모듈이 프로미스를 붙잡으므로 폼 리셋·탭 이동 후에도 업로드가 계속된다.
 * 성공 시 배너는 사라지고(자산이 생겨 TourActionBell이 이어받음), 실패 시 에러 배너를 띄운다.
 */
export function startTourUpload(input: IntakeSplatAssetInput): Promise<void> {
  if (errorTimer) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
  setState({ status: "uploading", percent: 0, fileName: input.file.name });
  bindBeforeUnload();

  return intakeSplatAssetSmart(input, (percent) => {
    // 업로드 중에만 진행률을 반영(에러/취소로 상태가 넘어간 경우엔 무시).
    if (state.status === "uploading") setState({ percent });
  })
    .then(() => {
      unbindBeforeUnload();
      setState(IDLE_STATE);
    })
    .catch(() => {
      unbindBeforeUnload();
      setState({ status: "error", percent: 0, fileName: input.file.name });
      // 에러 배너는 10초 후 자동으로 닫는다(사용자가 직접 닫을 수도 있음).
      if (errorTimer) clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        errorTimer = null;
        setState(IDLE_STATE);
      }, 10000);
    });
}
