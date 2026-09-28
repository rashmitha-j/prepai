import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, usersApi } from '../../api';
import Alert from '../../components/ui/Alert';
import Button from '../../components/ui/Button';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Field from '../../components/ui/Field';
import PageHeader from '../../components/ui/PageHeader';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getErrorMessage, getFieldErrors } from '../../utils/errors';
import { formatDate } from '../../utils/format';

export default function Profile() {
  useDocumentTitle('Profile');
  const { user, setUser, acceptSession, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({ name: user.name, bio: user.bio || '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileErrors, setProfileErrors] = useState({});

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState({});
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileErrors({});
    try {
      const { user: updated } = await usersApi.update({ name: profile.name.trim(), bio: profile.bio.trim() });
      setUser(updated);
      toast.success('Profile saved');
    } catch (err) {
      setProfileErrors(getFieldErrors(err));
      toast.error(getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    const errors = {};
    if (pw.newPassword.length < 8) errors.newPassword = 'Use at least 8 characters.';
    else if (!/[A-Za-z]/.test(pw.newPassword) || !/\d/.test(pw.newPassword)) errors.newPassword = 'Include a letter and a number.';
    if (pw.newPassword !== pw.confirm) errors.confirm = 'Passwords do not match.';
    setPwErrors(errors);
    if (Object.keys(errors).length) return;
    setSavingPw(true);
    try {
      const session = await authApi.changePassword({ currentPassword: pw.currentPassword, newPassword: pw.newPassword });
      acceptSession(session);
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed. Other sessions have been signed out.');
    } catch (err) {
      setPwErrors(getFieldErrors(err));
      setPwError(getErrorMessage(err));
    } finally {
      setSavingPw(false);
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      await usersApi.remove(deletePassword);
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <div className="container-narrow stack-lg">
      <PageHeader title="Profile" description={`Signed in as ${user.email}. Member since ${formatDate(user.createdAt)}.`} />

      <form className="card stack" onSubmit={saveProfile}>
        <h2 className="section-title">Your details</h2>
        <Field label="Name" value={profile.name} maxLength={80} onChange={(e) => setProfile({ ...profile, name: e.target.value })} error={profileErrors.name} />
        <Field
          as="textarea"
          label="Bio"
          rows={3}
          maxLength={500}
          value={profile.bio}
          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
          hint="Optional. For example, the roles you are targeting."
          error={profileErrors.bio}
        />
        <div>
          <Button type="submit" loading={savingProfile} disabled={profile.name.trim().length < 2}>
            Save profile
          </Button>
        </div>
      </form>

      <form className="card stack" onSubmit={changePassword}>
        <h2 className="section-title">Change password</h2>
        {pwError ? <Alert variant="error">{pwError}</Alert> : null}
        <Field label="Current password" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
        <div className="grid-2">
          <Field label="New password" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} error={pwErrors.newPassword} />
          <Field label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwErrors.confirm} />
        </div>
        <div>
          <Button type="submit" loading={savingPw} disabled={!pw.currentPassword || !pw.newPassword}>
            Change password
          </Button>
        </div>
      </form>

      <section className="card stack" style={{ borderColor: '#efc2c2' }}>
        <h2 className="section-title" style={{ color: 'var(--bad)' }}>Delete account</h2>
        <p className="small muted">Permanently deletes your account, resumes, job descriptions, interviews, reports and coding submissions.</p>
        <div>
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            Delete my account
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete your account permanently?"
        confirmLabel="Delete account"
        danger
        loading={deleting}
        onConfirm={deleteAccount}
        onCancel={() => {
          setDeleteOpen(false);
          setDeletePassword('');
          setDeleteError('');
        }}
      >
        <div className="stack-sm">
          <span>This cannot be undone. Enter your password to confirm.</span>
          {deleteError ? <Alert variant="error">{deleteError}</Alert> : null}
          <input
            className="input"
            type="password"
            aria-label="Password"
            autoComplete="current-password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
