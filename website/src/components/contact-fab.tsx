import type { Dictionary } from '@/i18n';
import { getSiteConfig } from '@/lib/site-config';
import { FloatingContact } from './floating-contact';

/**
 * Server wrapper for the floating WhatsApp / Call buttons. Numbers, the prefilled message and the per-button switches
 * come from the site settings (System -> Website & contact), with the environment as fallback. A button whose number
 * is unset (or switched off) is not rendered.
 */
export async function ContactFab({ t }: { t: Dictionary }) {
  const { contact } = await getSiteConfig();
  const whatsapp = contact.showWhatsappButton ? contact.whatsapp : '';
  const phone = contact.showCallButton ? contact.phone : '';
  if (!whatsapp && !phone) return null;
  const f = t.footer;
  return (
    <FloatingContact
      whatsapp={whatsapp}
      phone={phone}
      labels={{
        whatsapp: f.fabWhatsapp,
        call: f.fabCall,
        toggle: f.fabToggle,
        close: f.fabClose,
        message: contact.whatsappMessage || f.fabMessage,
      }}
    />
  );
}
