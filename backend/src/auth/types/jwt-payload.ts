export interface JwtPayload {
  sub: string; // user id
  email: string;
  tokenVersion?: number;
}
