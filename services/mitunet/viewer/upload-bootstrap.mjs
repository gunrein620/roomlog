export const MITUNET_UPLOAD_READY_EVENT = "mitunet-upload-ready";
export const MITUNET_UPLOAD_SELECTED_EVENT = "mitunet-upload-selected";

export function createUploadBridge({
  createSelectedEvent = file => new CustomEvent(MITUNET_UPLOAD_SELECTED_EVENT, {
    detail: { file },
  }),
  fileInput,
  statusElement,
  uploadButton,
  windowTarget,
}) {
  let analysisReady = false;
  let pendingFile = null;

  function deliver(file) {
    windowTarget.dispatchEvent(createSelectedEvent(file));
  }

  function openFilePicker() {
    fileInput.click();
  }

  function selectCurrentFile() {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (analysisReady) {
      deliver(file);
      return;
    }
    pendingFile = file;
    if (statusElement) {
      statusElement.textContent = "분석 서버 준비 중… 선택한 도면은 준비되면 자동으로 시작합니다.";
    }
  }

  function markReady() {
    analysisReady = true;
    if (!pendingFile) return;
    const file = pendingFile;
    pendingFile = null;
    deliver(file);
  }

  uploadButton.addEventListener("click", openFilePicker);
  fileInput.addEventListener("change", selectCurrentFile);
  windowTarget.addEventListener(MITUNET_UPLOAD_READY_EVENT, markReady);

  return {
    dispose() {
      pendingFile = null;
      uploadButton.removeEventListener("click", openFilePicker);
      fileInput.removeEventListener("change", selectCurrentFile);
      windowTarget.removeEventListener(MITUNET_UPLOAD_READY_EVENT, markReady);
    },
  };
}

if (globalThis.document && globalThis.window) {
  const uploadButton = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  if (uploadButton && fileInput) {
    createUploadBridge({
      fileInput,
      statusElement: document.getElementById("status"),
      uploadButton,
      windowTarget: window,
    });
  }
}
