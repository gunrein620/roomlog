export type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

export function ensureManagerAuth(auth: AuthResult) {
  if (auth.role !== "LANDLORD") {
    throw new Error("관리자 계정으로 로그인해주세요.");
  }

  return auth;
}
