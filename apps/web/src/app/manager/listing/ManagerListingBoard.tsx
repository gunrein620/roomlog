"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { type ChangeEvent, type FormEvent, type MouseEvent, useEffect, useRef, useState } from "react";
import { Badge, Card } from "@roomlog/ui";
import { isDialogBackdropPoint } from "@/lib/manager-assistant";
import {
  removeManagerListing,
  terminateManagerListingContract,
  updateManagerListing,
  uploadManagerListingPhotos,
  type ManagerListingUpdateInput,
} from "./manager-listing-api";
import {
  MAX_MANAGER_LISTING_PHOTOS,
  mergeManagerListingPhotos,
  parseManagerListingFloorPlan,
  readManagerListingFloorPlanSnapshot,
  type ManagerListingFloorPlan,
} from "./manager-listing-media";
import { groupListingsByBuilding, toManagerListingRow, type ManagerListingRow } from "./manager-listing-model";
import styles from "./ManagerListingBoard.module.css";

type DialogMode = "view" | "edit" | "remove" | "terminate";
type ListingStatusTab = "contracted" | "available";
type ListingViewMode = "all" | "building";

const STATUS_TAB_LABELS: Record<ListingStatusTab, string> = {
  contracted: "계약완료",
  available: "미계약",
};

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
            {listing.buildingName ? <Badge>{listing.buildingName}</Badge> : null}
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

export function ManagerListingBoard({
  initialListings,
  activeStatus,
}: {
  initialListings: ManagerListingRow[];
  activeStatus: ListingStatusTab;
}) {
  const [listings, setListings] = useState(initialListings);
  const [viewMode, setViewMode] = useState<ListingViewMode>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<DialogMode>("view");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviewUrls, setNewPhotoPreviewUrls] = useState<string[]>([]);
  const [floorPlanDraft, setFloorPlanDraft] = useState<ManagerListingFloorPlan | null>(null);
  const [mediaMessage, setMediaMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selected = listings.find((listing) => listing.id === selectedId) ?? null;

  useEffect(() => {
    const urls = newPhotoFiles.map((file) => URL.createObjectURL(file));
    setNewPhotoPreviewUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [newPhotoFiles]);

  useEffect(() => {
    if (mode !== "edit") return;
    const syncFloorPlan = () => {
      if (document.visibilityState !== "visible") return;
      const snapshot = readManagerListingFloorPlanSnapshot();
      if (!snapshot) return;
      setFloorPlanDraft(snapshot);
      setMediaMessage(`3D 도면 ${snapshot.walls3D.length}개 벽을 연결했습니다.`);
      setError(null);
    };
    window.addEventListener("focus", syncFloorPlan);
    document.addEventListener("visibilitychange", syncFloorPlan);
    return () => {
      window.removeEventListener("focus", syncFloorPlan);
      document.removeEventListener("visibilitychange", syncFloorPlan);
    };
  }, [mode]);

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
    setExistingImages([]);
    setNewPhotoFiles([]);
    setFloorPlanDraft(null);
    setMediaMessage(null);
  }

  function beginEdit() {
    if (!selected) return;
    setExistingImages([...selected.images]);
    setNewPhotoFiles([]);
    setFloorPlanDraft(selected.floorPlan);
    setMediaMessage(null);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setError(null);
    setMediaMessage(null);
  }

  function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selectedFiles.length === 0) return;
    try {
      const merged = mergeManagerListingPhotos(existingImages, [...newPhotoFiles, ...selectedFiles]);
      setNewPhotoFiles(merged.newFiles);
      setError(null);
      setMediaMessage(`사진 ${merged.existingUrls.length + merged.newFiles.length}장을 저장할 예정입니다.`);
    } catch (photoError) {
      setError(photoError instanceof Error ? photoError.message : "사진을 추가하지 못했습니다.");
    }
  }

  function removePhoto(index: number) {
    if (index < existingImages.length) {
      setExistingImages((current) => current.filter((_, photoIndex) => photoIndex !== index));
    } else {
      const newPhotoIndex = index - existingImages.length;
      setNewPhotoFiles((current) => current.filter((_, photoIndex) => photoIndex !== newPhotoIndex));
    }
    setError(null);
    setMediaMessage("사진 변경사항은 저장 버튼을 눌러야 반영됩니다.");
  }

  async function replaceFloorPlanFromJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const floorPlan = parseManagerListingFloorPlan(await file.text());
    if (!floorPlan) {
      setError("도면 JSON에서 유효한 3D 벽을 찾지 못했습니다.");
      return;
    }
    setFloorPlanDraft(floorPlan);
    setError(null);
    setMediaMessage(`3D 도면 ${floorPlan.walls3D.length}개 벽을 연결했습니다.`);
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
    setPending(true);
    setError(null);
    try {
      const uploadedImages = await uploadManagerListingPhotos(newPhotoFiles);
      const payload: ManagerListingUpdateInput = {
        title: String(data.get("title") ?? ""),
        roomType: String(data.get("roomType") ?? ""),
        tradeType: String(data.get("tradeType") ?? "월세") as ManagerListingUpdateInput["tradeType"],
        depositManwon: Number(data.get("depositManwon")) || 0,
        monthlyRentManwon: Number(data.get("monthlyRentManwon")) || 0,
        location: String(data.get("location") ?? ""),
        detailAddress: String(data.get("detailAddress") ?? ""),
        buildingName: String(data.get("buildingName") ?? ""),
        description: String(data.get("description") ?? ""),
        images: [...existingImages, ...uploadedImages],
        floorPlan: floorPlanDraft,
      };
      const updatedRow = toManagerListingRow(await updateManagerListing(selected.id, payload));
      setListings((current) => current.map((item) => item.id === updatedRow.id ? updatedRow : item));
      setMode("view");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "매물 수정에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  async function confirmTermination() {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const updatedRow = toManagerListingRow(await terminateManagerListingContract(selected.id));
      setListings((current) => current.map((item) => (item.id === updatedRow.id ? updatedRow : item)));
      setMode("view");
      setMediaMessage("계약이 해지되었습니다. 매물이 다시 노출 상태로 전환되고 세입자 연결이 해제됐어요.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "계약 해지에 실패했습니다.");
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

  const visibleListings = listings.filter((listing) =>
    activeStatus === "contracted" ? listing.statusLabel === "계약완료" : listing.statusLabel === "노출중",
  );
  const activeStatusLabel = STATUS_TAB_LABELS[activeStatus];

  return (
    <>
      {listings.length === 0 ? (
        <Card className={styles.empty}>
          <strong>등록된 매물이 없습니다</strong>
          <p>새 매물을 등록하면 이곳에서 관리할 수 있습니다.</p>
        </Card>
      ) : visibleListings.length === 0 ? (
        <Card className={styles.empty}>
          <strong>{activeStatusLabel} 매물이 없습니다</strong>
          <p>다른 탭에서 등록한 매물을 확인할 수 있습니다.</p>
        </Card>
      ) : (
        <>
          <div className={styles.viewToggle} role="group" aria-label="매물 보기 방식">
            <button
              type="button"
              data-active={viewMode === "all"}
              onClick={() => setViewMode("all")}
            >
              전체 보기
            </button>
            <button
              type="button"
              data-active={viewMode === "building"}
              onClick={() => setViewMode("building")}
            >
              건물별 보기
            </button>
          </div>

          {viewMode === "all" ? (
            <section className={styles.list} aria-label={`${activeStatusLabel} 매물 목록`}>
              {visibleListings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} onOpen={() => openListing(listing.id)} />
              ))}
            </section>
          ) : (
            groupListingsByBuilding(visibleListings).map((group) => (
              <section
                key={group.buildingName}
                className={styles.buildingGroup}
                aria-label={`${group.buildingName} 매물 목록`}
              >
                <h2 className={styles.buildingGroupTitle}>
                  {group.buildingName}
                  <span>{group.listings.length}개</span>
                </h2>
                <div className={styles.list}>
                  {group.listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} onOpen={() => openListing(listing.id)} />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
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
                {mode === "edit"
                  ? "매물 정보 수정"
                  : mode === "remove"
                    ? "매물 내리기 확인"
                    : mode === "terminate"
                      ? "계약 해지 확인"
                      : "매물 상세정보"}
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
                    <DetailItem label="건물명" value={selected.buildingName || "미지정"} />
                    <DetailItem label="방 유형" value={selected.roomType} />
                    <DetailItem label="거래 유형" value={selected.tradeType} />
                    <DetailItem label="가격" value={selected.priceLabel} />
                  </dl>
                  <p>{selected.description || "등록된 설명이 없습니다."}</p>
                  {mediaMessage ? <p className={styles.mediaNotice} role="status">{mediaMessage}</p> : null}
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.actions}>
                    {selected.statusLabel === "계약완료" ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => { setMode("terminate"); setError(null); setMediaMessage(null); }}
                      >
                        계약해지
                      </button>
                    ) : null}
                    <button type="button" className={styles.dangerButton} onClick={() => { setMode("remove"); setError(null); }}>
                      매물 내리기
                    </button>
                    <button type="button" className={styles.actionButton} data-primary="true" onClick={beginEdit}>
                      수정
                    </button>
                  </div>
                </>
              ) : mode === "edit" ? (
                <form className={styles.form} onSubmit={saveListing}>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>매물명</span>
                      <input name="title" defaultValue={selected.title} required />
                    </label>
                    <label className={styles.field}>
                      <span>건물명</span>
                      <input name="buildingName" defaultValue={selected.buildingName} placeholder="건물별 보기 기준 (선택)" />
                    </label>
                    <label className={styles.field}>
                      <span>방 유형</span>
                      <input name="roomType" defaultValue={selected.roomType} required />
                    </label>
                    <label className={styles.field}>
                      <span>거래 유형</span>
                      <select name="tradeType" defaultValue={selected.tradeType}>
                        <option value="월세">월세</option>
                        <option value="반전세">반전세</option>
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
                  <section className={styles.mediaEditor} aria-labelledby="manager-listing-photo-title">
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 id="manager-listing-photo-title">사진</h3>
                        <p>첫 번째 사진이 대표 사진입니다. 최대 {MAX_MANAGER_LISTING_PHOTOS}장까지 등록할 수 있습니다.</p>
                      </div>
                      <label className={styles.fileButton}>
                        사진 추가
                        <input type="file" accept="image/*" multiple onChange={addPhotos} disabled={pending} />
                      </label>
                    </div>
                    {existingImages.length + newPhotoPreviewUrls.length > 0 ? (
                      <div className={styles.photoGrid} aria-label="수정할 매물 사진">
                        {[...existingImages, ...newPhotoPreviewUrls].map((url, index) => (
                          <figure className={styles.photoItem} key={`${url}-${index}`}>
                            <img src={url} alt={`매물 사진 ${index + 1}`} />
                            {index === 0 ? <figcaption>대표 사진</figcaption> : null}
                            <button
                              type="button"
                              aria-label={`사진 ${index + 1} 삭제`}
                              onClick={() => removePhoto(index)}
                              disabled={pending}
                            >
                              삭제
                            </button>
                          </figure>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.mediaNotice}>저장하면 사진 없는 매물로 변경됩니다.</p>
                    )}
                  </section>

                  <section className={styles.mediaEditor} aria-labelledby="manager-listing-floor-plan-title">
                    <div className={styles.sectionHeader}>
                      <div>
                        <h3 id="manager-listing-floor-plan-title">3D 도면</h3>
                        <p>{floorPlanDraft ? `${floorPlanDraft.walls3D.length}개 벽 연결됨` : "연결된 3D 도면이 없습니다."}</p>
                      </div>
                    </div>
                    <div className={styles.mediaActions}>
                      <Link href="/floor-plan-3d" target="_blank" rel="noopener" className={styles.mediaLink}>
                        3D 도면 다시 열기
                      </Link>
                      <label className={styles.fileButton}>
                        도면 JSON 업로드
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={(event) => void replaceFloorPlanFromJson(event)}
                          disabled={pending}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => {
                          setFloorPlanDraft(null);
                          setError(null);
                          setMediaMessage("저장하면 3D 도면 연결이 해제됩니다.");
                        }}
                        disabled={pending || !floorPlanDraft}
                      >
                        3D 연결 해제
                      </button>
                    </div>
                  </section>
                  {mediaMessage ? <p className={styles.mediaNotice} role="status">{mediaMessage}</p> : null}
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.actions}>
                    <button type="button" className={styles.actionButton} onClick={cancelEdit} disabled={pending}>
                      수정 취소
                    </button>
                    <button type="submit" className={styles.actionButton} data-primary="true" disabled={pending}>
                      {pending ? "저장 중…" : "변경사항 저장"}
                    </button>
                  </div>
                </form>
              ) : mode === "terminate" ? (
                <div className={styles.removeConfirm}>
                  <strong>{selected.title} 계약을 해지할까요?</strong>
                  <p>세입자와 이 매물의 연결이 해제되고, 매물이 다시 노출 상태로 전환됩니다.</p>
                  <p>문의 대화에 해지 안내 메시지가 남습니다. 계약·청구 이력은 삭제되지 않습니다.</p>
                  {error ? <p className={styles.error} role="alert">{error}</p> : null}
                  <div className={styles.actions}>
                    <button type="button" className={styles.actionButton} onClick={() => { setMode("view"); setError(null); }} disabled={pending}>
                      취소
                    </button>
                    <button type="button" className={styles.dangerButton} onClick={confirmTermination} disabled={pending}>
                      {pending ? "해지하는 중…" : "정말 계약 해지"}
                    </button>
                  </div>
                </div>
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
