export const ADMIN_AUTH_COOKIE = 'invoicepro-admin-auth'

export function isAdminAuthCookie(name: string) {
  return name === ADMIN_AUTH_COOKIE || name.startsWith(`${ADMIN_AUTH_COOKIE}.`)
}
