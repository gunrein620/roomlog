export type VendorSignupForm = {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  inviteToken: string;
};

export type VendorInvitePreviewForSignup = {
  inviteToken: string;
  emailLocked: boolean;
  phoneLocked: boolean;
};

function normalized(form: VendorSignupForm) {
  return {
    email: form.email.trim().toLowerCase(),
    password: form.password,
    passwordConfirm: form.passwordConfirm,
    name: form.name.trim(),
    phone: form.phone.replace(/\D+/g, ""),
    inviteToken: form.inviteToken.trim()
  };
}

function hasValidPhoneLength(phone: string) {
  return /^\d{10,11}$/.test(phone);
}

function hasRequiredPasswordMix(password: string) {
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function vendorSignupIssues(
  form: VendorSignupForm,
  invitePreview?: VendorInvitePreviewForSignup | null
) {
  const input = normalized(form);
  const issues: string[] = [];

  if (!input.name) {
    issues.push("담당자명을 입력해주세요.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    issues.push("이메일 형식이 올바르지 않습니다.");
  }

  if (!input.phone) {
    issues.push("휴대폰 번호를 입력해주세요.");
  } else if (!hasValidPhoneLength(input.phone)) {
    issues.push("휴대폰 번호는 숫자 10~11자리여야 합니다.");
  }

  if (!input.inviteToken) {
    issues.push("초대 토큰을 입력해주세요.");
  } else if (invitePreview?.inviteToken !== input.inviteToken) {
    issues.push("초대 정보를 먼저 확인해주세요.");
  }

  if (!input.password || input.password.length < 8) {
    issues.push("비밀번호는 8자 이상이어야 합니다.");
  } else if (!hasRequiredPasswordMix(input.password)) {
    issues.push("비밀번호는 영문과 숫자를 포함해야 합니다.");
  }

  if (input.password !== input.passwordConfirm) {
    issues.push("비밀번호 확인이 일치하지 않습니다.");
  }

  return issues;
}

export function canSubmitVendorSignup(
  form: VendorSignupForm,
  invitePreview?: VendorInvitePreviewForSignup | null
) {
  return vendorSignupIssues(form, invitePreview).length === 0;
}

export function buildVendorSignupPayload(form: VendorSignupForm) {
  const input = normalized(form);

  return {
    role: "VENDOR" as const,
    email: input.email,
    password: input.password,
    passwordConfirm: input.passwordConfirm,
    name: input.name,
    phone: input.phone,
    inviteToken: input.inviteToken
  };
}
