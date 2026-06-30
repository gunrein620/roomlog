export type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

export function ensureVendorAuth(auth: AuthResult) {
  if (auth.role !== "VENDOR") {
    throw new Error("업체 계정으로 로그인해주세요.");
  }

  return auth;
}
