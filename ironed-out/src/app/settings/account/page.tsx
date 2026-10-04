import type { Metadata } from 'next';
import { BackLink } from '@/components/BackLink';
import { BottomNav } from '@/components/BottomNav';
import { buttonClassName, Card } from '@/components/ui';
import { requireUser } from '@/web/session';
import { DeleteAccountForm } from './DeleteAccountForm';

export const metadata: Metadata = { title: 'Your account' };

export default async function AccountPage() {
  const user = await requireUser('/settings/account');
  return (
    <>
      <main className="page">
        <div>
          <BackLink href="/settings/alerts" label="Back to alerts" />
          <h1 style={{ fontSize: 46 }}>Your account</h1>
          <p className="muted">
            {user.name} · {user.email}
          </p>
        </div>

        <Card as="section" aria-labelledby="export-heading">
          <h2 id="export-heading" style={{ fontSize: 30 }}>
            Your data
          </h2>
          <p style={{ margin: '8px 0 14px' }}>
            Download everything we keep about you: your account, outings, spots, crews, alert settings and the
            texts and emails we sent you.
          </p>
          {/* A plain link: the route sends a JSON file as a download. */}
          <a href="/settings/account/export" className={buttonClassName({})} download>
            Download my data
          </a>
        </Card>

        <Card as="section" aria-labelledby="delete-heading">
          <h2 id="delete-heading" style={{ fontSize: 30 }}>
            Delete my account
          </h2>
          <ul style={{ margin: '8px 0 14px', paddingLeft: 22 }}>
            <li>Upcoming outings you organize are deleted.</li>
            <li>Your spots in other upcoming outings open up, and the group sees you dropped out.</li>
            <li>Crews you made are deleted.</li>
            <li>Past tee sheets show “Former member” instead of your name.</li>
          </ul>
          <p className="muted" style={{ marginBottom: 12 }}>
            This can’t be undone.
          </p>
          <DeleteAccountForm />
        </Card>
      </main>
      <BottomNav current="alerts" />
    </>
  );
}
