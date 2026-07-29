export interface JwtPayload {
  sub: string;
  email?: string;
  roles?: string[];
  tenant_id?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
}
