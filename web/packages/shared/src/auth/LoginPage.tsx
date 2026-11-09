import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { errorMessage } from '../api/client';
import { authApi } from '../api/endpoints/auth';
import type { LoginIn, UserOut } from '../api/types';
import { useCommonTranslation } from '../lib/i18n';
import { AuthLayout } from '../layout/AuthLayout';
import { Button } from '../ui/Button';
import { FormField, Input } from '../ui/form';
import { useAuth } from './AuthProvider';
import { forgotPasswordUrl as defaultForgotPasswordUrl, isMfaRequired, publicRegisterUrl, safeNextPath, type AuthDoor } from './doors';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LoginPageProps {
  /** which door to sign in at (default: the AuthProvider's door) */
  door?: AuthDoor;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** in-app path after sign-in when there is no safe `?next=` (default "/") */
  onSuccessPath?: string;
  /** called after a successful sign-in, before navigating */
  onSuccess?: (user: UserOut) => void;
  /** replaces the logo */
  brand?: ReactNode;
  /** extra content under the form */
  footer?: ReactNode;
  /** "Forgot password?" link; default: website page for the public door, hidden for the staff door */
  forgotPasswordUrl?: string | null;
  /** "Create an account" link; default: website register page for the public door, hidden for the staff door */
  registerUrl?: string | null;
  /** AuthLayout side panel (false hides it) */
  aside?: ReactNode | false;
}

type Step = 'credentials' | 'mfa';

/**
 * Configurable sign-in page. Handles the TOTP step: when the API answers `mfa_required`, it asks for the
 * 6-digit code and retries with `otp_code`. Staff door (admin console): `<LoginPage door="staff" />`.
 */
export function LoginPage({
  door,
  title,
  subtitle,
  onSuccessPath = '/',
  onSuccess,
  brand,
  footer,
  forgotPasswordUrl,
  registerUrl,
  aside,
}: LoginPageProps) {
  const auth = useAuth();
  const activeDoor = door ?? auth.door;
  const { t } = useCommonTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const destination = safeNextPath(params.get('next'), onSuccessPath);

  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; otp?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (auth.status === 'authenticated' && auth.user && !submitting) {
    return <Navigate to={destination} replace />;
  }

  const forgotUrl = forgotPasswordUrl !== undefined ? forgotPasswordUrl : activeDoor === 'public' ? defaultForgotPasswordUrl() : null;
  const signUpUrl = registerUrl !== undefined ? registerUrl : activeDoor === 'public' ? publicRegisterUrl() : null;

  const signIn = async (body: LoginIn) => {
    setSubmitting(true);
    setFormError(null);
    try {
      const token = activeDoor === 'staff' ? await authApi.staffLogin(body) : await authApi.login(body);
      const user = auth.acceptToken(token);
      onSuccess?.(user);
      navigate(destination, { replace: true });
    } catch (error) {
      if (isMfaRequired(error)) {
        if (step === 'mfa') {
          setErrors({ otp: t('auth.errors.codeInvalid') });
        } else {
          setStep('mfa');
          setOtp('');
          setErrors({});
        }
      } else {
        setFormError(errorMessage(error, t('auth.errors.generic')));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitCredentials = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: typeof errors = {};
    const trimmed = email.trim();
    if (!trimmed) next.email = t('auth.errors.emailRequired');
    else if (!EMAIL_RE.test(trimmed)) next.email = t('auth.errors.emailInvalid');
    if (!password) next.password = t('auth.errors.passwordRequired');
    setErrors(next);
    if (Object.keys(next).length) return;
    void signIn({ email: trimmed, password });
  };

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = otp.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      setErrors({ otp: t('auth.errors.codeInvalid') });
      return;
    }
    setErrors({});
    void signIn({ email: email.trim(), password, otp_code: code });
  };

  const backToCredentials = () => {
    setStep('credentials');
    setPassword('');
    setOtp('');
    setErrors({});
    setFormError(null);
  };

  const heading =
    step === 'mfa'
      ? t('auth.mfaTitle')
      : (title ?? (activeDoor === 'staff' ? t('auth.staffTitle') : t('auth.signInTitle')));
  const subheading =
    step === 'mfa'
      ? t('auth.mfaPrompt')
      : (subtitle ?? (activeDoor === 'staff' ? t('auth.staffSubtitle') : t('auth.signInSubtitle')));

  return (
    <AuthLayout
      title={heading}
      subtitle={subheading}
      brand={brand}
      aside={aside}
      footer={
        <>
          {step === 'credentials' && signUpUrl && (
            <p>
              {t('auth.noAccount')}{' '}
              <a href={signUpUrl} className="font-semibold text-primary-ink hover:underline">
                {t('auth.createAccount')}
              </a>
            </p>
          )}
          {footer}
        </>
      }
    >
      {formError && (
        <div role="alert" className="mb-5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger-ink">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{formError}</span>
        </div>
      )}

      {step === 'credentials' ? (
        <form noValidate onSubmit={submitCredentials} className="flex flex-col gap-5">
          <FormField label={t('auth.email')} error={errors.email} required>
            <Input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
            />
          </FormField>
          <FormField label={t('auth.password')} error={errors.password} required>
            <Input
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              rightAddon={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              }
            />
          </FormField>
          {forgotUrl && (
            <div className="-mt-2 flex justify-end">
              <a href={forgotUrl} className="text-sm font-medium text-primary-ink hover:underline">
                {t('auth.forgotPassword')}
              </a>
            </div>
          )}
          <Button type="submit" size="lg" fullWidth loading={submitting} leftIcon={<KeyRound className="size-4" aria-hidden />}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>
      ) : (
        <form noValidate onSubmit={submitCode} className="flex flex-col gap-5">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-muted">
            <ShieldCheck className="size-5 shrink-0 text-primary-ink" aria-hidden />
            <span className="min-w-0 truncate">{email}</span>
          </div>
          <FormField label={t('auth.mfaCode')} error={errors.otp} required>
            <Input
              name="otp_code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={submitting}
              className="text-center font-mono text-lg tracking-[0.5em]"
            />
          </FormField>
          <Button type="submit" size="lg" fullWidth loading={submitting}>
            {t('auth.verify')}
          </Button>
          <Button variant="ghost" onClick={backToCredentials} disabled={submitting} leftIcon={<ArrowLeft className="size-4" aria-hidden />}>
            {t('auth.useDifferentAccount')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
