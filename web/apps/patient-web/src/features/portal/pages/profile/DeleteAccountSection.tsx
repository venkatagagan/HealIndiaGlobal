/** In-app account deletion - the shared @hig/shared/auth section, fed with the patient's session. */
import { DeleteAccountSection as SharedDeleteAccountSection } from '@hig/shared/auth';
import { useMe } from '../../lib/session';

export function DeleteAccountSection() {
  const me = useMe();
  return <SharedDeleteAccountSection user={me.data} audience="patient" />;
}
