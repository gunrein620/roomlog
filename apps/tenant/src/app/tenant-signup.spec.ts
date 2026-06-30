import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildTenantSignupPayload,
  canSubmitTenantSignup,
  tenantSignupIssues
} from "./tenant-signup";

const completeForm = {
  email: " tenant-signup@roomlog.test ",
  password: "password123!",
  passwordConfirm: "password123!",
  name: " 세입자 ",
  phone: " 010-5555-7001 ",
  buildingName: " 룸로그 빌라 ",
  roomNo: " 1201호 ",
  address: " 서울시 성동구 테스트로 12 ",
  inviteToken: ""
};

describe("tenant signup preflight", () => {
  it("requires room information for direct tenant signup before calling the API", () => {
    const issues = tenantSignupIssues({
      ...completeForm,
      buildingName: "",
      roomNo: "",
      address: ""
    });

    assert.deepEqual(issues, [
      "건물명을 입력해주세요.",
      "호실을 입력해주세요.",
      "건물 주소를 입력해주세요."
    ]);
    assert.equal(canSubmitTenantSignup({ ...completeForm, roomNo: "" }), false);
  });

  it("requires a confirmed invite preview before invited tenant signup", () => {
    const invitedForm = {
      ...completeForm,
      buildingName: "",
      roomNo: "",
      address: "",
      inviteToken: " invite-token "
    };

    assert.deepEqual(tenantSignupIssues(invitedForm), [
      "초대 정보를 먼저 확인해주세요."
    ]);
    assert.deepEqual(
      tenantSignupIssues(invitedForm, {
        inviteToken: "different-token",
        emailLocked: false,
        phoneLocked: false
      }),
      ["초대 정보를 먼저 확인해주세요."]
    );
    assert.equal(
      canSubmitTenantSignup(invitedForm, {
        inviteToken: "invite-token",
        emailLocked: true,
        phoneLocked: true
      }),
      true
    );
  });

  it("rejects edited email or phone when the invite preview locks tenant contact fields", () => {
    assert.deepEqual(
      tenantSignupIssues(
        {
          ...completeForm,
          email: "other-tenant@roomlog.test",
          phone: "010-9999-7001",
          inviteToken: "invite-token"
        },
        {
          inviteToken: "invite-token",
          emailLocked: true,
          phoneLocked: true,
          email: "tenant-signup@roomlog.test",
          phone: "01055557001"
        }
      ),
      [
        "초대된 이메일과 가입 이메일이 일치하지 않습니다.",
        "초대된 휴대폰 번호와 가입 휴대폰 번호가 일치하지 않습니다."
      ]
    );
  });

  it("rejects malformed phone numbers and weak passwords before signup", () => {
    assert.deepEqual(
      tenantSignupIssues({
        ...completeForm,
        phone: "123-45",
        password: "password",
        passwordConfirm: "password"
      }),
      [
        "휴대폰 번호는 숫자 10~11자리여야 합니다.",
        "비밀번호는 영문과 숫자를 포함해야 합니다."
      ]
    );
    assert.equal(
      canSubmitTenantSignup({
        ...completeForm,
        phone: "123-45"
      }),
      false
    );
  });

  it("normalizes the tenant signup payload for direct and invited flows", () => {
    assert.deepEqual(buildTenantSignupPayload(completeForm), {
      role: "TENANT",
      email: "tenant-signup@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "세입자",
      phone: "01055557001",
      buildingName: "룸로그 빌라",
      roomNo: "1201호",
      address: "서울시 성동구 테스트로 12"
    });

    assert.deepEqual(
      buildTenantSignupPayload({
        ...completeForm,
        buildingName: "",
        roomNo: "",
        address: "",
        inviteToken: " invite-token "
      }),
      {
        role: "TENANT",
        email: "tenant-signup@roomlog.test",
        password: "password123!",
        passwordConfirm: "password123!",
        name: "세입자",
        phone: "01055557001",
        inviteToken: "invite-token"
      }
    );
  });
});
