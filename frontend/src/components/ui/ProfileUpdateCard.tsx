import { useState, type FormEvent } from 'react';
import { CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { getLmsUser, lmsFetch } from '../../lmsApi';
import GlassCard from './GlassCard';
import Input from './Input';
import Button from './Button';

export default function ProfileUpdateCard() {
  const currentUser = getLmsUser();
  const [name, setName] = useState(currentUser?.name || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload: Record<string, string> = {
        name: name.trim(),
        email: email.trim(),
      };
      if (password.trim()) {
        payload.password = password.trim();
      }
      const res = await lmsFetch<{ message: string; user: Record<string, unknown> }>('/profile', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      if (res.user) {
        const serialized = JSON.stringify(res.user);
        if (localStorage.getItem('lms-user')) {
          localStorage.setItem('lms-user', serialized);
        } else {
          sessionStorage.setItem('lms-user', serialized);
        }
      }
      setPassword('');
      setNotice(res.message || 'Profile information updated successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update profile information.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'white', margin: 0 }}>
          Update Profile & Password
        </h3>
        <p style={{ color: 'var(--neutral-400)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
          Modify your account display name, institutional email address, or security password.
        </p>
      </div>

      {notice && (
        <div style={{ background: 'rgba(67, 160, 71, 0.2)', border: '1px solid var(--success)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#c8e6c9', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239, 83, 80, 0.2)', border: '1px solid var(--error)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', color: '#ffcdd2', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          <Input
            label="Full Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            label="Email Address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <Input
          label="New Password (Optional — minimum 8 characters)"
          type="password"
          placeholder="Leave blank to keep current password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="accent" isLoading={saving}>
            <Save size={16} /> Save Profile Changes
          </Button>
        </div>
      </form>
    </GlassCard>
  );
}

