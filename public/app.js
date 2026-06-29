const els = {
  errorBox: document.querySelector("#errorBox"),
  connectionState: document.querySelector("#connectionState"),
  iceState: document.querySelector("#iceState"),
  micState: document.querySelector("#micState"),
  dataState: document.querySelector("#dataState"),
  connectLatency: document.querySelector("#connectLatency"),
  turnLatency: document.querySelector("#turnLatency"),
  startBtn: document.querySelector("#startBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  micBtn: document.querySelector("#micBtn"),
  textForm: document.querySelector("#textForm"),
  textInput: document.querySelector("#textInput"),
  photoInput: document.querySelector("#photoInput"),
  quoteBtn: document.querySelector("#quoteBtn"),
  transcript: document.querySelector("#transcript"),
  eventLog: document.querySelector("#eventLog"),
  remoteAudio: document.querySelector("#remoteAudio"),
};

let pc;
let dc;
let localStream;
let localAudioTrack;
let connectStartedAt = 0;
let speechStoppedAt = 0;
let sawFirstDeltaAfterSpeech = false;
let eventCounter = 0;
const handledCallIds = new Set();

function setError(message) {
  if (!message) {
    els.errorBox.hidden = true;
    els.errorBox.textContent = "";
    return;
  }

  els.errorBox.hidden = false;
  els.errorBox.textContent = message;
}

function logEvent(label, data = "") {
  const stamp = new Date().toLocaleTimeString();
  const payload = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  els.eventLog.textContent += `[${stamp}] ${label}${payload ? `\n${payload}` : ""}\n\n`;
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
  console.log(label, data);
}

function updateConnectionUi() {
  els.connectionState.textContent = pc?.connectionState || "대기 중";
  els.iceState.textContent = pc?.iceConnectionState || "대기 중";
  els.dataState.textContent = dc?.readyState || "닫힘";
  els.micState.textContent = localAudioTrack?.enabled ? "켜짐" : "꺼짐";
  els.micBtn.textContent = localAudioTrack?.enabled ? "마이크 끄기" : "마이크 켜기";
}

function setButtons(connected) {
  els.startBtn.disabled = connected;
  els.stopBtn.disabled = !connected;
  els.micBtn.disabled = !connected || !localAudioTrack;
}

function clientEvent(type, body) {
  eventCounter += 1;
  return {
    event_id: `client_${Date.now()}_${eventCounter}`,
    type,
    ...body,
  };
}

function sendEvent(event) {
  if (!dc || dc.readyState !== "open") {
    setError("Data channel이 아직 열리지 않았습니다. 상담 시작 후 다시 시도하세요.");
    return false;
  }

  dc.send(JSON.stringify(event));
  logEvent(`client.${event.type}`, event);
  return true;
}

function createResponse() {
  sendEvent(clientEvent("response.create", {}));
}

function sendUserContent(content, logLabel) {
  const ok = sendEvent(
    clientEvent("conversation.item.create", {
      item: {
        type: "message",
        role: "user",
        content,
      },
    }),
  );

  if (ok) {
    logEvent(logLabel, content);
    createResponse();
  }
}

function sendUserText(text, logLabel = "사용자 텍스트") {
  const trimmed = text.trim();
  if (!trimmed) return;
  sendUserContent([{ type: "input_text", text: trimmed }], logLabel);
}

function appendTranscript(text) {
  if (!text) return;

  if (speechStoppedAt && !sawFirstDeltaAfterSpeech) {
    sawFirstDeltaAfterSpeech = true;
    els.turnLatency.textContent = `${Math.round(performance.now() - speechStoppedAt)} ms`;
  }

  els.transcript.textContent += text;
  els.transcript.scrollTop = els.transcript.scrollHeight;
}

function setupPeerConnection() {
  pc = new RTCPeerConnection();

  pc.ontrack = (event) => {
    els.remoteAudio.srcObject = event.streams[0];
    els.remoteAudio.play().catch((error) => {
      logEvent("audio.play blocked", error.message);
    });
  };

  pc.onconnectionstatechange = updateConnectionUi;
  pc.oniceconnectionstatechange = updateConnectionUi;

  for (const track of localStream.getTracks()) {
    pc.addTrack(track, localStream);
  }

  dc = pc.createDataChannel("oai-events");
  dc.onopen = () => {
    els.connectLatency.textContent = `${Math.round(performance.now() - connectStartedAt)} ms`;
    updateConnectionUi();
    setButtons(true);
    sendUserText(
      '상담을 시작하세요. 입주민에게 다음 문장만 자연스럽게 말하세요: "안녕하세요. 입주 관리 AI 상담원입니다. 어떤 하자나 불편사항이 있으신가요?"',
      "초기 인사 요청",
    );
  };
  dc.onclose = updateConnectionUi;
  dc.onerror = () => setError("Data channel 오류가 발생했습니다. 브라우저 콘솔과 이벤트 로그를 확인하세요.");
  dc.onmessage = handleDataMessage;
}

async function startConsultation() {
  try {
    setError("");
    els.transcript.textContent = "";
    els.eventLog.textContent = "";
    els.connectLatency.textContent = "연결 중";
    els.turnLatency.textContent = "-";
    connectStartedAt = performance.now();
    speechStoppedAt = 0;
    sawFirstDeltaAfterSpeech = false;
    handledCallIds.clear();
    setButtons(false);
    els.startBtn.disabled = true;

    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    localAudioTrack = localStream.getAudioTracks()[0];

    setupPeerConnection();
    updateConnectionUi();

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const answerText = await createRealtimeAnswer(offer.sdp);
    await pc.setRemoteDescription({ type: "answer", sdp: answerText });
    logEvent("WebRTC answer applied");
  } catch (error) {
    setError(error.message);
    logEvent("startConsultation error", error.message);
    stopConsultation();
  }
}

async function createRealtimeAnswer(offerSdp) {
  const sessionResponse = await fetch("/session", {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offerSdp,
  });

  const answerText = await sessionResponse.text();
  if (sessionResponse.ok) {
    logEvent("session.unified.success");
    return answerText;
  }

  if (!isTransientStatus(sessionResponse.status)) {
    throw new Error(answerText || `/session failed with ${sessionResponse.status}`);
  }

  logEvent("session.unified.transient_failure", answerText);
  setError("서버 경유 연결이 일시 실패했습니다. 임시 토큰 방식으로 한 번 더 연결합니다.");
  return createRealtimeAnswerWithEphemeralToken(offerSdp);
}

async function createRealtimeAnswerWithEphemeralToken(offerSdp) {
  const tokenResponse = await fetch("/token");
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    throw new Error(tokenBody.error || `/token failed with ${tokenResponse.status}`);
  }

  const ephemeralKey = tokenBody.value;
  if (!ephemeralKey) {
    throw new Error("OpenAI client secret response did not include a value.");
  }

  logEvent("session.ephemeral.token_created");
  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
    headers: {
      Authorization: `Bearer ${ephemeralKey}`,
      "Content-Type": "application/sdp",
    },
    body: offerSdp,
    });

  const answerText = await realtimeResponse.text();
  if (!realtimeResponse.ok) {
    throw new Error(answerText || `OpenAI direct WebRTC failed with ${realtimeResponse.status}`);
  }

  logEvent("session.ephemeral.direct_success");
  return answerText;
}

function isTransientStatus(status) {
  return status === 502 || status === 503 || status === 504;
}

function stopConsultation() {
  if (dc) {
    dc.close();
    dc = undefined;
  }

  if (pc) {
    pc.close();
    pc = undefined;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = undefined;
  }

  localAudioTrack = undefined;
  els.remoteAudio.srcObject = null;
  els.connectLatency.textContent = els.connectLatency.textContent === "연결 중" ? "-" : els.connectLatency.textContent;
  setButtons(false);
  updateConnectionUi();
}

function toggleMic() {
  if (!localAudioTrack) return;
  localAudioTrack.enabled = !localAudioTrack.enabled;
  updateConnectionUi();
}

function handleDataMessage(message) {
  let event;
  try {
    event = JSON.parse(message.data);
  } catch (error) {
    logEvent("server.unparseable", message.data);
    return;
  }

  logEvent(`server.${event.type}`, event);

  if (event.type === "error") {
    setError(event.error?.message || "Realtime API 오류가 발생했습니다.");
    return;
  }

  if (event.type === "input_audio_buffer.speech_stopped") {
    speechStoppedAt = performance.now();
    sawFirstDeltaAfterSpeech = false;
    els.turnLatency.textContent = "응답 대기";
    return;
  }

  if (event.type === "response.output_audio_transcript.delta" || event.type === "response.output_text.delta") {
    appendTranscript(event.delta || "");
    return;
  }

  if (event.type === "response.output_audio_transcript.done") {
    appendTranscript("\n");
    return;
  }

  if (event.type === "response.output_text.done") {
    appendTranscript("\n");
    return;
  }

  if (event.type === "conversation.item.done" || event.type === "response.output_item.done") {
    maybeHandleFunctionCall(event.item);
    return;
  }

  if (event.type === "response.done") {
    for (const item of event.response?.output || []) {
      maybeHandleFunctionCall(item);
    }
  }
}

function maybeHandleFunctionCall(item) {
  if (!item || item.type !== "function_call" || !item.call_id || handledCallIds.has(item.call_id)) {
    return;
  }

  handledCallIds.add(item.call_id);

  const args = safeJsonParse(item.arguments);
  const output = runMockTool(item.name, args);

  sendEvent(
    clientEvent("conversation.item.create", {
      item: {
        type: "function_call_output",
        call_id: item.call_id,
        output: JSON.stringify(output),
      },
    }),
  );
  createResponse();
}

function safeJsonParse(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (error) {
    logEvent("tool.arguments.parse_failed", { value, error: error.message });
    return { parse_error: error.message };
  }
}

function runMockTool(name, args) {
  logEvent(`mock.${name}`, args);

  if (name === "check_contract_clause") {
    return {
      unit_id: "A-302",
      category: "air_conditioner_cleaning",
      clause: "특약 4조: 에어컨은 파손이 아닌 통상 유지보수 및 기본 청소 필요 시 임대인 유지보수 항목으로 처리한다.",
      liability_precheck: "LANDLORD_MAINTENANCE_LIKELY",
      final_decision_required: true,
      message:
        "파손이 아닌 통상 유지보수 가능성이 있어 임대인 처리 항목으로 접수 가능합니다. 최종 책임소재는 관리자 확인 후 확정됩니다.",
    };
  }

  if (name === "create_defect_ticket") {
    return {
      ticket_id: "TICKET-AC-0001",
      status: "CREATED",
      dashboard_url: "/mock-dashboard/tickets/TICKET-AC-0001",
      message: "하자 티켓이 생성되었습니다.",
    };
  }

  if (name === "request_vendor_quote") {
    return {
      ticket_id: "TICKET-AC-0001",
      vendor_type: "aircon_cleaning_partner",
      status: "QUOTE_REQUESTED",
      message: "청소 제휴업체 대시보드로 견적 요청이 전송되었습니다.",
    };
  }

  return {
    error: "UNKNOWN_TOOL",
    message: `${name} mock tool is not implemented.`,
  };
}

async function resizeImageToDataUrl(file) {
  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(sourceDataUrl);
  const maxSide = 1024;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.75);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = src;
  });
}

async function handlePhotoUpload() {
  const file = els.photoInput.files?.[0];
  if (!file) return;

  try {
    setError("");
    const dataUrl = await resizeImageToDataUrl(file);
    sendUserContent(
      [
        {
          type: "input_text",
          text: "이 사진은 입주민이 제공한 에어컨 필터 또는 송풍구 사진입니다. 사진을 보고 하자 상담을 이어가주세요.",
        },
        {
          type: "input_image",
          image_url: dataUrl,
        },
      ],
      `사진 업로드: ${file.name}`,
    );
  } catch (error) {
    setError(error.message);
    logEvent("photo upload error", error.message);
  } finally {
    els.photoInput.value = "";
  }
}

function simulateVendorQuote() {
  sendUserText(
    "[시스템 이벤트] 제휴 청소업체가 티켓 TICKET-AC-0001에 대해 견적 45,000원, 방문 예정 2026-01-10 14:00, 작업 내용 '벽걸이 에어컨 필터 및 송풍구 기본 청소'로 응답했습니다. 관리자 자동결제 조건은 50,000원 이하이고 현재 견적은 조건을 충족해 크레딧 자동결제가 완료되었습니다. 입주민에게 처리 결과를 짧게 안내하세요.",
    "업체 견적 도착 시뮬레이션",
  );
}

els.startBtn.addEventListener("click", startConsultation);
els.stopBtn.addEventListener("click", stopConsultation);
els.micBtn.addEventListener("click", toggleMic);
els.photoInput.addEventListener("change", handlePhotoUpload);
els.quoteBtn.addEventListener("click", simulateVendorQuote);
els.textForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendUserText(els.textInput.value);
  els.textInput.value = "";
});

updateConnectionUi();
setButtons(false);
