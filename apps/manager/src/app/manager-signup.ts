export type ManagerSignupForm = {
  email: string;
  password: string;
  passwordConfirm: string;
  name: string;
  phone: string;
  buildingName: string;
  roomNo: string;
  address: string;
};

function normalized(form: ManagerSignupForm) {
  return {
    email: form.email.trim().toLowerCase(),
    password: form.password,
    passwordConfirm: form.passwordConfirm,
    name: form.name.trim(),
    phone: form.phone.trim(),
    buildingName: form.buildingName.trim(),
    roomNo: form.roomNo.trim(),
    address: form.address.trim()
  };
}

export function managerSignupIssues(form: ManagerSignupForm) {
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
  }

  if (!input.buildingName) {
    issues.push("관리 건물명을 입력해주세요.");
  }

  if (!input.roomNo) {
    issues.push("첫 관리 호실을 입력해주세요.");
  }

  if (!input.address) {
    issues.push("건물 주소를 입력해주세요.");
  }

  if (!input.password || input.password.length < 8) {
    issues.push("비밀번호는 8자 이상이어야 합니다.");
  }

  if (input.password !== input.passwordConfirm) {
    issues.push("비밀번호 확인이 일치하지 않습니다.");
  }

  return issues;
}

export function canSubmitManagerSignup(form: ManagerSignupForm) {
  return managerSignupIssues(form).length === 0;
}

export function buildManagerSignupPayload(form: ManagerSignupForm) {
  const input = normalized(form);

  return {
    role: "LANDLORD" as const,
    email: input.email,
    password: input.password,
    passwordConfirm: input.passwordConfirm,
    name: input.name,
    phone: input.phone,
    buildingName: input.buildingName,
    roomNo: input.roomNo,
    address: input.address
  };
}
