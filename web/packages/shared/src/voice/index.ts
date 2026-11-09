/**
 * `@hig/shared/voice` - voice intake (PLAN 7.2): record (English) -> transcript ->
 * AI-suggested answers -> mandatory review -> edit -> confirm. See ./README.md for mounting instructions.
 */
export * from './types';
export { voiceApi, voiceKeys } from './api';
export { useVoiceText, type VoiceTextKey } from './i18n';
export { VoiceRecorder, VOICE_MAX_SECONDS, pickAudioMimeType, type RecordedAudio, type VoiceRecorderProps } from './VoiceRecorder';
export { IntakeReviewForm, emptyIntake, normalizeIntake, type IntakeReviewFormProps } from './IntakeReviewForm';
export { VoiceIntakeFlow, toScreeningPatch, type VoiceIntakeFlowProps } from './VoiceIntakeFlow';
export { VoiceIntakeButton, type VoiceIntakeButtonProps } from './VoiceIntakeButton';
