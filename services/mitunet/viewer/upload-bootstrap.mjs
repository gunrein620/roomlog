export const MITUNET_UPLOAD_FAILED_EVENT = "mitunet-upload-failed";
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
  clearTimer = clearTimeout,
  initializationTimeoutMs = 20_000,
  setTimer = setTimeout,
}) {
  let analysisReady = false;
  let initializationFailed = false;
  let pendingFile = null;
  let timeoutId = null;

  function showLoadFailure() {
    if (statusElement) {
      statusElement.textContent = "3D 모듈을 불러오지 못했습니다. 네트워크를 확인한 뒤 새로고침해 주세요.";
    }
    uploadButton.setAttribute?.("aria-busy", "false");
  }

  function clearInitializationTimeout() {
    if (timeoutId === null) return;
    clearTimer(timeoutId);
    timeoutId = null;
  }

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
      statusElement.textContent = initializationFailed
        ? "3D 모듈을 불러오지 못했습니다. 선택한 도면은 유지되며 새로고침 후 다시 시도할 수 있습니다."
        : "분석 서버 준비 중… 선택한 도면은 준비되면 자동으로 시작합니다.";
    }
  }

  function markReady() {
    clearInitializationTimeout();
    analysisReady = true;
    initializationFailed = false;
    if (!pendingFile) return;
    const file = pendingFile;
    pendingFile = null;
    deliver(file);
  }

  function markFailed() {
    if (analysisReady) return;
    clearInitializationTimeout();
    initializationFailed = true;
    showLoadFailure();
  }

  function handleModuleError() {
    markFailed();
  }

  uploadButton.addEventListener("click", openFilePicker);
  fileInput.addEventListener("change", selectCurrentFile);
  windowTarget.addEventListener(MITUNET_UPLOAD_READY_EVENT, markReady);
  windowTarget.addEventListener(MITUNET_UPLOAD_FAILED_EVENT, markFailed);
  windowTarget.addEventListener("error", handleModuleError, true);
  windowTarget.addEventListener("unhandledrejection", handleModuleError);
  timeoutId = setTimer(markFailed, initializationTimeoutMs);

  return {
    dispose() {
      pendingFile = null;
      clearInitializationTimeout();
      uploadButton.removeEventListener("click", openFilePicker);
      fileInput.removeEventListener("change", selectCurrentFile);
      windowTarget.removeEventListener(MITUNET_UPLOAD_READY_EVENT, markReady);
      windowTarget.removeEventListener(MITUNET_UPLOAD_FAILED_EVENT, markFailed);
      windowTarget.removeEventListener("error", handleModuleError, true);
      windowTarget.removeEventListener("unhandledrejection", handleModuleError);
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
