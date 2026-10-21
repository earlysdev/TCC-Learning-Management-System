import Modal from '../ui/Modal';
import Button from '../ui/Button';

interface SessionTimeoutModalProps {
  isOpen: boolean;
  remainingSeconds: number;
  onStayLoggedIn: () => void;
  onSignOut: () => void;
}

export default function SessionTimeoutModal({ isOpen, remainingSeconds, onStayLoggedIn, onSignOut }: SessionTimeoutModalProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onStayLoggedIn}
      title="Session Timeout Warning"
      footer={
        <>
          <Button variant="outline" onClick={onSignOut}>Sign Out</Button>
          <Button variant="primary" onClick={onStayLoggedIn}>Stay Signed In</Button>
        </>
      }
    >
      <div style={{ textAlign: 'center', padding: '1rem 0' }}>
        <p style={{ marginBottom: '1rem', color: 'var(--neutral-200)' }}>
          Your session will expire soon due to inactivity.
        </p>
        <div style={{ fontSize: '3rem', fontWeight: 700, fontFamily: 'var(--font-display)', color: 'var(--warning)', margin: '1rem 0' }}>
          {formatTime(remainingSeconds)}
        </div>
        <p style={{ color: 'var(--neutral-400)', fontSize: '0.875rem' }}>
          Please click "Stay Signed In" to continue working.
        </p>
      </div>
    </Modal>
  );
}
