import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildVendorSignupPayload,
  canSubmitVendorSignup,
  vendorSignupIssues
} from "./vendor-signup";

const completeForm = {
  email: " vendor-signup@roomlog.test ",
  password: "password123!",
  passwordConfirm: "password123!",
  name: " 협력 기사 ",
  phone: " 010-5555-9001 ",
  inviteToken: " invite-token "
};

describe("vendor signup preflight", () => {
  it("requires a confirmed vendor invite before calling the API", () => {
    assert.deepEqual(vendorSignupIssues({ ...completeForm, inviteToken: "" }), [
      "초대 토큰을 입력해주세요."
    ]);
    assert.deepEqual(vendorSignupIssues(completeForm), [
      "초대 정보를 먼저 확인해주세요."
    ]);
    assert.deepEqual(
      vendorSignupIssues(completeForm, {
        inviteToken: "different-token",
        emailLocked: false,
        phoneLocked: false
      }),
      ["초대 정보를 먼저 확인해주세요."]
    );
    assert.equal(
      canSubmitVendorSignup(completeForm, {
        inviteToken: "invite-token",
        emailLocked: true,
        phoneLocked: true
      }),
      true
    );
  });

  it("rejects edited email or phone when the invite preview locks vendor contact fields", () => {
    assert.deepEqual(
      vendorSignupIssues(
        {
          ...completeForm,
          email: "other-vendor@roomlog.test",
          phone: "010-9999-9001"
        },
        {
          inviteToken: "invite-token",
          emailLocked: true,
          phoneLocked: true,
          email: "vendor-signup@roomlog.test",
          phone: "01055559001"
        }
      ),
      [
        "초대된 이메일과 가입 이메일이 일치하지 않습니다.",
        "초대된 휴대폰 번호와 가입 휴대폰 번호가 일치하지 않습니다."
      ]
    );
  });

  it("requires usable account credentials", () => {
    assert.deepEqual(
      vendorSignupIssues(
        {
          ...completeForm,
          email: "bad-email",
          password: "short",
          passwordConfirm: "different"
        },
        {
          inviteToken: "invite-token",
          emailLocked: false,
          phoneLocked: false
        }
      ),
      [
        "이메일 형식이 올바르지 않습니다.",
        "비밀번호는 8자 이상이어야 합니다.",
        "비밀번호 확인이 일치하지 않습니다."
      ]
    );
  });

  it("rejects malformed phone numbers and weak passwords before signup", () => {
    assert.deepEqual(
      vendorSignupIssues(
        {
          ...completeForm,
          phone: "123",
          password: "password",
          passwordConfirm: "password"
        },
        {
          inviteToken: "invite-token",
          emailLocked: false,
          phoneLocked: false
        }
      ),
      [
        "휴대폰 번호는 숫자 10~11자리여야 합니다.",
        "비밀번호는 영문과 숫자를 포함해야 합니다."
      ]
    );
    assert.equal(
      canSubmitVendorSignup(
        { ...completeForm, phone: "123" },
        {
          inviteToken: "invite-token",
          emailLocked: false,
          phoneLocked: false
        }
      ),
      false
    );
  });

  it("normalizes the invited vendor signup payload", () => {
    assert.deepEqual(buildVendorSignupPayload(completeForm), {
      role: "VENDOR",
      email: "vendor-signup@roomlog.test",
      password: "password123!",
      passwordConfirm: "password123!",
      name: "협력 기사",
      phone: "01055559001",
      inviteToken: "invite-token"
    });
  });
});
