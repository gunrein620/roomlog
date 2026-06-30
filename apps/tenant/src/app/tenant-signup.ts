export type TenantSignupForm = {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  buildingName: string;
  roomNo: string;
  address: string;
  inviteToken: string;
};

export type TenantInvitePreviewForSignup = {
  inviteToken: string;
  emailLocked: boolean;
  phoneLocked: boolean;
  email?: string;
  phone?: string;
};

function normalized(form: TenantSignupForm) {
  return {
    email: form.email.trim().toLowerCase(),
    password: form.password,
    passwordConfirm: form.passwordConfirm,
    name: form.name.trim(),
    phone: form.phone.replace(/\D+/g, ""),
    buildingName: form.buildingName.trim(),
    roomNo: form.roomNo.trim(),
    address: form.address.trim(),
    inviteToken: form.inviteToken.trim()
  };
}

function hasValidPhoneLength(phone: string) {
  return /^\d{10,11}$/.test(phone);
}

function hasRequiredPasswordMix(password: string) {
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

export function tenantSignupIssues(
  form: TenantSignupForm,
  invitePreview?: TenantInvitePreviewForSignup | null
) {
  const input = normalized(form);
  const issues: string[] = [];

  if (!input.name) {
    issues.push("이름을 입력해주세요.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    issues.push("이메일 형식이 올바르지 않습니다.");
  }

  if (!input.phone) {
    issues.push("휴대폰 번호를 입력해주세요.");
  } else if (!hasValidPhoneLength(input.phone)) {
    issues.push("휴대폰 번호는 숫자 10~11자리여야 합니다.");
  }

  if (!input.password || input.password.length < 8) {
    issues.push("비밀번호는 8자 이상이어야 합니다.");
  } else if (!hasRequiredPasswordMix(input.password)) {
    issues.push("비밀번호는 영문과 숫자를 포함해야 합니다.");
  }

  if (input.password !== input.passwordConfirm) {
    issues.push("비밀번호 확인이 일치하지 않습니다.");
  }

  if (input.inviteToken) {
    if (invitePreview?.inviteToken !== input.inviteToken) {
      issues.push("초대 정보를 먼저 확인해주세요.");
    }

    if (
      invitePreview?.emailLocked &&
      invitePreview.email?.trim().toLowerCase() &&
      invitePreview.email.trim().toLowerCase() !== input.email
    ) {
      issues.push("초대된 이메일과 가입 이메일이 일치하지 않습니다.");
    }

    if (
      invitePreview?.phoneLocked &&
      invitePreview.phone?.replace(/\D+/g, "") &&
      invitePreview.phone.replace(/\D+/g, "") !== input.phone
    ) {
      issues.push("초대된 휴대폰 번호와 가입 휴대폰 번호가 일치하지 않습니다.");
    }

    return issues;
  }

  if (!input.buildingName) {
    issues.push("건물명을 입력해주세요.");
  }

  if (!input.roomNo) {
    issues.push("호실을 입력해주세요.");
  }

  if (!input.address) {
    issues.push("건물 주소를 입력해주세요.");
  }

  return issues;
}

export function canSubmitTenantSignup(
  form: TenantSignupForm,
  invitePreview?: TenantInvitePreviewForSignup | null
) {
  return tenantSignupIssues(form, invitePreview).length === 0;
}

export function visibleTenantSignupIssues(
  form: TenantSignupForm,
  invitePreview?: TenantInvitePreviewForSignup | null
) {
  return tenantSignupIssues(form, invitePreview).slice(0, 5);
}

export function buildTenantSignupPayload(form: TenantSignupForm) {
  const input = normalized(form);
  const base = {
    role: "TENANT" as const,
    email: input.email,
    password: input.password,
    passwordConfirm: input.passwordConfirm,
    name: input.name,
    phone: input.phone
  };

  if (input.inviteToken) {
    return {
      ...base,
      inviteToken: input.inviteToken
    };
  }

  return {
    ...base,
    buildingName: input.buildingName,
    roomNo: input.roomNo,
    address: input.address
  };
}
