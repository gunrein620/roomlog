export type AuthResult = {
  accessToken: string;
  name: string;
  role: string;
  userId: string;
};

export function ensureTenantAuth(auth: AuthResult) {
  if (auth.role !== "TENANT") {
    throw new Error("세입자 계정으로 로그인해주세요.");
  }

  return auth;
}
