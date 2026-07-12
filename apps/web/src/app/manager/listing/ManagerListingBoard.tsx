"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { type FormEvent, type MouseEvent, useRef, useState } from "react";
import { Badge, Card } from "@roomlog/ui";
import { isDialogBackdropPoint } from "@/lib/manager-assistant";
import {
  removeManagerListing,
  updateManagerListing,
  type ManagerListingUpdateInput,
} from "./manager-listing-api";
import { toManagerListingRow, type ManagerListingRow } from "./manager-listing-model";
import styles from "./ManagerListingBoard.module.css";

type DialogMode = "view" | "edit" | "remove";

const registrationLinkStyle = {
  minHeight: "var(--touch-target)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 var(--space-lg)",
  borderRadius: "var(--radius-btn)",
  background: "var(--primary)",
  color: "var(--on-primary)",
  textDecoration: "none",
  fontWeight: 800,
} as const;

function ListingCard({ listing, onOpen }: { listing: ManagerListingRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={styles.cardButton}
      aria-label={`${listing.title} 상세정보 보기`}
      onClick={onOpen}
    >
      <Card className={styles.cardLayout}>
        <div className={styles.cardMedia}>
          {listing.coverImage ? <img src={listing.coverImage} alt="" /> : null}
        </div>
        <div className={styles.cardContent}>
          <div className={styles.badges}>
            <Badge emphasis={listing.statusLabel === "노출중"}>{listing.statusLabel}</Badge>
            <Badge>사진 {listing.photoCount}장</Badge>
            <Badge>{listing.has3D ? "3D 연결" : "3D 미연결"}</Badge>
          </div>
          <strong style={{ fontSize: "var(--fs-subtitle)" }}>{listing.title}</strong>
          <span style={{ color: "var(--on-surface-variant)" }}>{listing.address}</span>
          <span style={{ fontWeight: 800 }}>{listing.priceLabel}</span>
        </div>
      </Card>
    </button>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.detailItem}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ManagerListingBoard({ initialListings }: { initialListings: ManagerListingRow[] }) {
  const [listings, setListings] = useState(initialListings);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DialogMode>("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = listings.find((listing) => listing.id === selectedId) ?? null;

  function openListing(listingId: string) {
    setSelectedId(listingId);
    setMode("view");
    setError(null);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }

  function resetDialog() {
    setSelectedId(null);
    setMode("view");
    setPending(false);
    setError(null);
  }

  function closeDialog() {
    dialogRef.current?.close();
    resetDialog();
  }

  function closeOnBackdrop(event: MouseEvent<HTMLDialogElement>) {
    if (!isDialogBackdropPoint(event, event.currentTarget.getBoundingClientRect())) return;
    closeDialog();
  }

  async function saveListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || pending) return;

    const data = new FormData(event.currentTarget);
    const payload: ManagerListingUpdateInput = {
      title: String(data.get("title") ?? ""),
      roomType: String(data.get("roomType") ?? ""),
      tradeType: String(data.get("tradeType") ?? "월세") as ManagerListingUpdateInput["tradeType"],
      depositManwon: Number(data.get("depositManwon")) || 0,
      monthlyRentManwon: Number(data.get("monthlyRentManwon")) || 0,
      location: String(data.get("location") ?? ""),
      detailAddress: String(data.get("detailAddress") ?? ""),
      description: String(data.get("description") ?? ""),
    };

    setPending(true);
    setError(null);
    try {
      const updatedRow = toManagerListingRow(await updateManagerListing(selected.id, payload));
      setListings((current) => current.map((item) => item.id === updatedRow.id ? updatedRow : item));
      setMode("view");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "매물 수정에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function confirmRemoval() {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      await removeManagerListing(selected.id);
      setListings((current) => current.filter((item) => item.id !== selected.id));
      closeDialog();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "매물 내리기에 실패했습니다.");
      setPending(false);
    }
  }

  return (
    <>
      {listings.length === 0 ? (
        <Card className={styles.empty}>
          <strong>등록된 매물이 없습니다</strong>
          <p>새 매물을 등록하면 이곳에서 관리할 수 있습니다.</p>
          <Link href="/sell" style={registrationLinkStyle}>새 매물 등록</Link>
        </Card>
      ) : (
        <section className={styles.list} aria-label="등록한 매물 목록">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} onOpen={() => openListing(listing.id)} />
          ))}
        </section>
      )}

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="manager-listing-dialog-title"
        onClick={closeOnBackdrop}
        onClose={resetDialog}
      >
        {selected ? (
          <>
            <header className={styles.dialogHeader}>
              <h2 id="manager-listing-dialog-title">
                {mode === "edit" ? "매물 정보 수정" : mode === "remove" ? "매물 내리기 확인" : "매물 상세정보"}
              </h2>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="매물 상세정보 닫기"
                onClick={closeDialog}
                disabled={pending}
              >
                <X aria-hidden="true" />
              </button>
            </header>

            <div className={styles.dialogBody}>
              {mode === "view" ? (
                <>
                  <div className={styles.dialogMedia}>
                    {selected.coverImage ? (
                      <img src={selected.coverImage} alt={`${selected.title} 대표 사진`} />
                    ) : (
                      <div className={styles.mediaEmpty}>등록된 사진이 없습니다.</div>
                    )}
                  </div>
                  <div className={styles.badges}>
                    <Badge emphasis>{selected.statusLabel}</Badge>
                    <Badge>사진 {selected.photoCount}장</Badge>
                    <Badge>{selected.has3D ? "3D 연결" : "3D 미연결"}</Badge>
                  </div>
                  <h3>{selected.title}</h3>
                  <dl className={styles.detailGrid}>
                    <DetailItem label="주소" value={selected.address} />
                    <DetailItem label="방 유형" value={selected.roomType} />
                    <DetailItem label="거래 유형" value={selected.tradeType} />
                    <DetailItem label="가격" value={selected.priceLabel} />
                  </dl>
                  <p>{selected.description || "등록된 설명이 없습니다."}</p>
                  <div className={styles.actions}>
                    <button type="button" className={styles.dangerButton} onClick={() => { setMode("remove"); setError(null); }}>
                      매물 내리기
                    </button>
                    <button type="button" className={styles.actionButton} data-primary="true" onClick={() => { setMode("edit"); setError(null); }}>
                      수정
                    </button>
                  </div>
                </>
              ) : mode === "edit" ? (
                <form className={styles.form} onSubmit={saveListing}>
                  <div className={styles.formGrid}>
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      <span>매물명</span>
                      <input name="title" defaultValue={selected.title} required />
                    </label>
                    <label className={styles.field}>
                      <span>방 유형</span>
                      <input name="roomType" defaultValue={selected.roomType} required />
                    </label>
                    <label className={styles.field}>
                      <span>거래 유형</span>
                      <select name="tradeType" defaultValue={selected.tradeType}>
                        <option value="월세">월세</option>
                        <option value="전세">전세</option>
                        <option value="매매">매매</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>보증금(만원)</span>
                      <input name="depositManwon" type="number" min="0" defaultValue={selected.depositManwon} required />
                    </label>
                    <label className={styles.field}>
                      <span>월세(만원)</span>
                      <input name="monthlyRentManwon" type="number" min="0" defaultValue={selected.monthlyRentManwon} required />
                    </label>
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      <span>기본 주소</span>
                      <input name="location" defaultValue={selected.location} required />
                    </label>
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      <span>상세 주소</span>
                      <input name="detailAddress" defaultValue={selected.detailAddress} />
                    </label>
                    <label className={`${styles.field} ${styles.fullWidth}`}>
                      <span>설명</span>
                      <textarea name="description" defaultValue={selected.description} />
                    </label>
                  </div>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.actions}>
                    <button type="button" className={styles.actionButton} onClick={() => { setMode("view"); setError(null); }} disabled={pending}>
                      수정 취소
                    </button>
                    <button type="submit" className={styles.actionButton} data-primary="true" disabled={pending}>
                      {pending ? "저장 중…" : "변경사항 저장"}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.removeConfirm}>
                  <strong>{selected.title} 매물을 내릴까요?</strong>
                  <p>매물이 목록과 공개 노출에서 제거되며 되돌릴 수 없습니다.</p>
                  <p>기존 문의 대화 기록은 그대로 유지됩니다.</p>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.actions}>
                    <button type="button" className={styles.actionButton} onClick={() => { setMode("view"); setError(null); }} disabled={pending}>
                      취소
                    </button>
                    <button type="button" className={styles.dangerButton} onClick={confirmRemoval} disabled={pending}>
                      {pending ? "내리는 중…" : "정말 매물 내리기"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </dialog>
    </>
  );
}
