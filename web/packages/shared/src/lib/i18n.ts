/**
 * English UI strings shared by every web app (the product is English only).
 *
 * i18next + react-i18next are kept purely as a string table so call sites stay tidy: `t('actions.save')`.
 * Importing this module initialises the default i18next instance synchronously with the English "common"
 * namespace (the package declares this file as a side effect, so the init also runs when only
 * `@hig/shared/lib` is imported). Apps may add their own English namespaces with `addTranslations(ns, strings)`.
 * There is no language switching and no RTL handling.
 */
import i18next, { type i18n as I18nInstance, type Resource } from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

export const COMMON_NS = 'common';

// -----------------------------------------------------------------------------------------------------------
// "common" namespace (strings used by the shared UI kit, layouts and auth screens)
// -----------------------------------------------------------------------------------------------------------
const en = {
  brand: { name: 'Heal India Global', tagline: 'Your Gateway to Indian Medical Excellence' },
  actions: {
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    retry: 'Try again',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    submit: 'Submit',
    search: 'Search',
    clear: 'Clear',
    upload: 'Upload',
    download: 'Download',
    remove: 'Remove',
    view: 'View',
    continue: 'Continue',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signUp: 'Sign up',
    more: 'More',
  },
  states: {
    loading: 'Loading…',
    empty: 'Nothing here yet',
    noResults: 'No results found',
    error: 'Something went wrong',
    errorDescription: 'Please try again in a moment.',
    notAvailable: 'Not available',
  },
  pagination: {
    label: 'Pagination',
    previous: 'Previous page',
    next: 'Next page',
    page: 'Page {{page}} of {{pages}}',
    summary: '{{from}}–{{to}} of {{total}}',
    goTo: 'Go to page {{page}}',
  },
  table: {
    sortAscending: 'Sorted ascending',
    sortDescending: 'Sorted descending',
    sortBy: 'Sort by {{column}}',
    actions: 'Actions',
  },
  upload: {
    drop: 'Drag and drop files here, or',
    browse: 'browse',
    hint: 'PDF, JPG, PNG, WEBP, HEIC or DICOM · up to {{size}} MB',
    tooLarge: '“{{name}}” is larger than {{size}} MB',
    badType: '“{{name}}” is not a supported file type',
    tooMany: 'You can upload up to {{max}} files',
    remove: 'Remove {{name}}',
    uploading: 'Uploading…',
  },
  theme: { label: 'Theme', light: 'Light', dark: 'Dark', system: 'System', toggle: 'Toggle dark mode' },
  layout: {
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    collapseSidebar: 'Collapse sidebar',
    expandSidebar: 'Expand sidebar',
    skipToContent: 'Skip to content',
    mainNavigation: 'Main navigation',
    userMenu: 'Account menu',
    allRightsReserved: 'All rights reserved.',
    asideTitle: 'World-class treatment, coordinated for you',
    asidePoint1: 'Accredited partner hospitals and specialists',
    asidePoint2: 'Transparent, itemised treatment quotes',
    asidePoint3: 'Visa, travel and stay coordinated end to end',
  },
  dialog: { confirmTitle: 'Are you sure?', confirmDescription: 'This action cannot be undone.' },
  stepper: { progress: 'Step {{current}} of {{total}}', completed: 'Completed', current: 'Current step' },
  form: { optional: 'Optional', required: 'Required' },
  roles: {
    patient: 'Patient',
    agent: 'Agent',
    hospital: 'Hospital',
    admin: 'Operations admin',
    finance: 'Finance',
    support: 'Support',
    super_admin: 'Super admin',
  },
  auth: {
    email: 'Email',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    signInTitle: 'Sign in to your account',
    signInSubtitle: 'Welcome back! Enter your details to continue.',
    staffTitle: 'Staff sign in',
    staffSubtitle: 'Operations console — authorised personnel only.',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    mfaTitle: 'Two-step verification',
    mfaPrompt: 'Enter the 6-digit code from your authenticator app.',
    mfaCode: 'Verification code',
    verify: 'Verify and sign in',
    useDifferentAccount: 'Use a different account',
    forgotPassword: 'Forgot password?',
    noAccount: "Don't have an account?",
    createAccount: 'Create an account',
    haveAccount: 'Already have an account?',
    checkingSession: 'Checking your session…',
    redirecting: 'Redirecting you to sign in…',
    wrongPortalTitle: 'This portal is not for your account',
    wrongPortalBody: 'You are signed in as {{name}} ({{role}}). This area is for: {{roles}}.',
    goToMyPortal: 'Go to my portal',
    guest: 'Continue as guest',
    errors: {
      emailRequired: 'Enter your email address',
      emailInvalid: 'Enter a valid email address',
      passwordRequired: 'Enter your password',
      codeInvalid: 'Enter the 6-digit code',
      generic: 'Sign-in failed. Please try again.',
    },
  },
  register: {
    title: 'Create your account',
    subtitle: 'Join Heal India Global in a minute.',
    accountType: 'Account type',
    fullName: 'Full name',
    phone: 'Phone',
    country: 'Country (2-letter code)',
    referralCode: 'Referral code',
    agencyName: 'Agency name',
    hospitalName: 'Hospital name',
    city: 'City',
    passwordHint: 'At least 10 characters, including a letter and a number.',
    acceptTerms: 'I agree to the Terms of Service and the Privacy Policy.',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    submit: 'Create account',
    submitting: 'Creating account…',
    roleHints: {
      patient: 'Find treatment in India and manage your medical trip.',
      agent: 'Refer and manage patients as a facilitator.',
      hospital: 'List your hospital and receive international patients.',
    },
    errors: {
      fullNameRequired: 'Enter your full name',
      passwordWeak: 'Use at least 10 characters with a letter and a number',
      termsRequired: 'You must accept the terms to continue',
      agencyRequired: 'Enter your agency name',
      hospitalRequired: 'Enter the hospital name',
      cityRequired: 'Enter the city',
      countryInvalid: 'Use a 2-letter country code, e.g. US',
    },
  },
  realtime: { connected: 'Live', reconnecting: 'Reconnecting…' },
};

/** Shape of the "common" namespace. */
export type CommonTranslations = typeof en;

/** Shared resources: `{ en: { common } }`. */
export const commonResources = {
  en: { [COMMON_NS]: en },
} satisfies Resource;

/** The i18next instance bound to react-i18next (the default instance). */
export const i18n: I18nInstance = i18next;

/** Initialise (once) the shared English string table. Safe to call many times. */
export function initI18n(): I18nInstance {
  if (!i18next.isInitialized && !i18next.isInitializing) {
    void i18next.use(initReactI18next).init({
      resources: structuredClone(commonResources) as Resource,
      lng: 'en',
      fallbackLng: 'en',
      defaultNS: COMMON_NS,
      ns: [COMMON_NS],
      interpolation: { escapeValue: false },
      initAsync: false,
    });
  } else if (!i18next.hasResourceBundle('en', COMMON_NS)) {
    i18next.addResourceBundle('en', COMMON_NS, en, true, false);
  }
  return i18next;
}

/** Add or extend one English namespace (deep merge, overwriting existing keys). */
export function addTranslations(ns: string, resources: Record<string, unknown>): void {
  i18next.addResourceBundle('en', ns, resources, true, true);
}

/** `useTranslation('common')` - the namespace used by the shared components. */
export function useCommonTranslation() {
  return useTranslation(COMMON_NS);
}

// Side effect (declared in package.json "sideEffects"): initialise on first import.
initI18n();
