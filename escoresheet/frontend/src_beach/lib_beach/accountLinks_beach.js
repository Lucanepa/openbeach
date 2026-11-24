/**
 * Where OpenBeach accounts are made and recovered: the OpenBeach manager
 * (manager-beach.openvolley.app). Sign-up, the confirmation mail and the
 * password reset live there (decision D4 of the OpenBeach separation plan:
 * no in-app sign-up, as OpenVolley does with its manager). Sign-in stays in
 * the app.
 */
export const MANAGER_BEACH_URL = 'https://manager-beach.openvolley.app'

/** "Create account" */
export const SIGNUP_URL = `${MANAGER_BEACH_URL}/#signup`

/** "Forgot password?" */
export const RESET_PASSWORD_URL = `${MANAGER_BEACH_URL}/#reset`
