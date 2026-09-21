import { z } from 'zod';
import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { readResult } from '@/lib/data';
import { InviteUserForm } from './settings-forms';

export default async function UserInvitationPanel() {
  const { db, profile } = await requireAdminShell();
  const allowed = await hasPermission(db, 'access.manage');
  if (!allowed) return null;
  const [facilities, accessProfiles] = await Promise.all([
    db.from('facilities').select('id,name').eq('active', true).order('name'),
    db.from('access_profiles').select('id,name,base_role').eq('active', true).order('name'),
  ]);
  const facilityRows = readResult(
    facilities,
    z.array(z.object({ id: z.uuid(), name: z.string() })),
    'invite_facilities',
  );
  const profileRows = readResult(
    accessProfiles,
    rowSchemas.access_profiles.pick({ id: true, name: true, base_role: true }).array(),
    'invite_access_profiles',
  );
  const isSpanish = profile.preferred_locale === 'es';
  return (
    <section className="panel">
      <h2>{isSpanish ? 'Invitar a un nuevo usuario' : 'Invite a new user'}</h2>
      <p>
        {isSpanish
          ? 'Cree una cuenta, elija su instalación y perfil de acceso, y envíe un enlace de configuración de un solo uso por correo electrónico.'
          : 'Create an account, choose its facility and access profile, then send a one-time setup link by email.'}
      </p>
      <InviteUserForm facilities={facilityRows} profiles={profileRows} />
    </section>
  );
}
