/**
 * `@hig/shared/auth` - session handling for the PLAN 3.1 access doors.
 *
 *   <AuthProvider door="public">  ...  <RequireAuth roles={['agent']} />   (patient / agent / hospital portals)
 *   <AuthProvider door="staff">   ...  <LoginPage door="staff" /> + <RequireAuth roles={STAFF_ROLES} />  (admin)
 */
export {
  AuthProvider,
  ME_QUERY_KEY,
  useAuth,
  useOptionalAuth,
  type AuthContextValue,
  type AuthProviderProps,
  type AuthStatus,
  type LogoutOptions,
} from './AuthProvider';
export { DoorRedirect, type DoorRedirectProps } from './DoorRedirect';
export { RequireAuth, WrongPortal, type RequireAuthProps, type WrongPortalProps } from './RequireAuth';
export { LoginPage, type LoginPageProps } from './LoginPage';
export { PASSWORD_POLICY_RE, RegisterForm, isStrongPassword, type RegisterFormProps } from './RegisterForm';
export {
  AUTH_DOOR_ENDPOINTS,
  DEV_URLS,
  PROD_PATHS,
  buildLoginRedirect,
  defaultPortalUrls,
  forgotPasswordUrl,
  isAbsoluteUrl,
  isMfaRequired,
  isStaffRole,
  portalUrlForRole,
  publicLoginUrl,
  publicRegisterUrl,
  routerBasename,
  safeNextPath,
  safeNextUrl,
  websiteUrl,
  type AuthDoor,
} from './doors';
export { DeleteAccountSection, type DeleteAccountAudience, type DeleteAccountSectionProps } from './DeleteAccountSection';
