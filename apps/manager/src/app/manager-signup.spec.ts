import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildManagerSignupPayload,
  canSubmitManagerSignup,
  managerSignupIssues
} from "./manager-signup";

const completeForm = {
  email: " manager-signup@roomlog.test ",
  password: "password123!",
  passwordConfirm: "password123!",
  name: " 관리자 ",
  phone: " 010-5555-1001 ",
  buildingName: " 성수 관리 빌딩 ",
  roomNo: " 301호 ",
  address: " 서울시 성동구 관리로 3 "
};

describe("manager signup preflight", () => {
  it("requires the first managed room before calling the API", () => {
    const issues = managerSignupIssues({
      ...completeForm,
      buildingName: "",
      roomNo: "",
      address: ""
    });

    assert.deepEqual(issues, [
      "관리 건물명을 입력해주세요.",
      "첫 관리 호실을 입력해주세요.",
      "건물 주소를 입력해주세요."
    ]);
    assert.equal(canSubmitManagerSignup({ ...completeForm, roomNo: "" }), false);
  });

  it("requires usable account credentials", () => {
    assert.deepEqual(
      managerSignupIssues({
        ...completeForm,
        email: "bad-email",
        password: "short",
        passwordConfirm: "different"
      }),
      [
        "이메일 형식이 올바르지 않습니다.",
        "비밀번호는 8자 이상이어야 합니다.",
        "비밀번호 확인이 일치하지 않습니다."
      ]
    );
  });

  it("normalizes the manager signup payload", () => {
    assert.deepEqual(buildManagerSignupPayload(completeForm), {
      role: "LANDLORD",
      email: "manager-signup@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "관리자",
      phone: "010-5555-1001",
      buildingName: "성수 관리 빌딩",
      roomNo: "301호",
      address: "서울시 성동구 관리로 3"
    });
  });
});
