// 매물 등록 사진(File)을 브라우저에 잠시 보관한다.
// 3D 도면 에디터는 저장 후 window.location으로 /sell을 다시 여는데(새 탭·전체 새로고침),
// File 객체는 직렬화가 안 돼 localStorage 초안엔 못 싣는다 → 같은 origin에서 공유되고
// File을 그대로 담을 수 있는 IndexedDB에 저장해 왕복 후에도 사진이 유지되게 한다.
const DB_NAME = "roomlog-owner-photos";
const STORE = "photos";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOwnerPhotos(files: File[]): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(files, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // 저장 실패해도 이번 세션 동작엔 영향 없음(왕복 후 복원만 안 될 뿐)
  }
}

export async function loadOwnerPhotos(): Promise<File[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const stored = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return Array.isArray(stored) ? stored.filter((item): item is File => item instanceof File) : [];
  } catch {
    return [];
  }
}

export async function clearOwnerPhotos(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // noop
  }
}
