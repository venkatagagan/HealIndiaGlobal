/** Strings for the voice intake components (namespace `voice`, catalogs in `src/locales/<lng>/voice.json`). */
import { createTextHook } from '../docai/i18n';
import en from '../locales/en/voice.json';

export type VoiceTextKey = keyof typeof en;

export const useVoiceText = createTextHook<VoiceTextKey>(en, 'voice');
