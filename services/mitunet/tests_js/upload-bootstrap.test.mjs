import assert from "node:assert/strict";
import test from "node:test";

import {
  MITUNET_UPLOAD_READY_EVENT,
  MITUNET_UPLOAD_SELECTED_EVENT,
  createUploadBridge,
} from "../viewer/upload-bootstrap.mjs";

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter(candidate => candidate !== listener));
  }

  dispatchEvent(event) {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

function fixture() {
  const windowTarget = new FakeTarget();
  const uploadButton = new FakeTarget();
  const fileInput = new FakeTarget();
  const statusElement = { textContent: "" };
  const selected = [];
  let pickerClicks = 0;
  fileInput.files = [];
  fileInput.value = "unchanged";
  fileInput.click = () => { pickerClicks += 1; };
  windowTarget.addEventListener(MITUNET_UPLOAD_SELECTED_EVENT, event => {
    selected.push(event.detail.file);
  });

  const bridge = createUploadBridge({
    createSelectedEvent: file => ({
      detail: { file },
      type: MITUNET_UPLOAD_SELECTED_EVENT,
    }),
    fileInput,
    statusElement,
    uploadButton,
    windowTarget,
  });

  return {
    bridge,
    fileInput,
    pickerClicks: () => pickerClicks,
    selected,
    statusElement,
    uploadButton,
    windowTarget,
  };
}

test("opens the file picker before the 3D viewer is ready", () => {
  const { pickerClicks, uploadButton } = fixture();

  uploadButton.dispatchEvent({ type: "click" });

  assert.equal(pickerClicks(), 1);
});

test("queues only the latest file and delivers it once when analysis is ready", () => {
  const { fileInput, selected, statusElement, windowTarget } = fixture();
  const first = { name: "first.png" };
  const second = { name: "second.png" };

  fileInput.files = [first];
  fileInput.dispatchEvent({ type: "change" });
  fileInput.files = [second];
  fileInput.dispatchEvent({ type: "change" });

  assert.deepEqual(selected, []);
  assert.match(statusElement.textContent, /준비되면 자동으로 시작/);
  assert.equal(fileInput.value, "");

  windowTarget.dispatchEvent({ type: MITUNET_UPLOAD_READY_EVENT });
  windowTarget.dispatchEvent({ type: MITUNET_UPLOAD_READY_EVENT });

  assert.deepEqual(selected, [second]);
});

test("delivers later selections immediately and stops after disposal", () => {
  const { bridge, fileInput, selected, uploadButton, windowTarget } = fixture();
  const readyFile = { name: "ready.png" };
  const disposedFile = { name: "disposed.png" };

  windowTarget.dispatchEvent({ type: MITUNET_UPLOAD_READY_EVENT });
  fileInput.files = [readyFile];
  fileInput.dispatchEvent({ type: "change" });
  bridge.dispose();
  fileInput.files = [disposedFile];
  fileInput.dispatchEvent({ type: "change" });
  uploadButton.dispatchEvent({ type: "click" });

  assert.deepEqual(selected, [readyFile]);
});
