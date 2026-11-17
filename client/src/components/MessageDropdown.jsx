import { Dropdown } from './ui.jsx';

// Per-message menu. Order follows the spec: Decrypt, Copy Encrypted Text, View Encryption Details, Report.
export default function MessageDropdown({ decrypted, busy, canReport, onDecrypt, onHide, onCopy, onDetails, onReport }) {
  const items = [
    decrypted
      ? { label: 'Hide Plain Text', icon: 'lock', onSelect: onHide }
      : { label: 'Decrypt Message', icon: 'unlock', disabled: busy, onSelect: onDecrypt },
    { label: 'Copy Encrypted Text', onSelect: onCopy },
    { label: 'View Encryption Details', icon: 'info', onSelect: onDetails },
    ...(canReport ? [{ sep: true }, { label: 'Report Message', icon: 'warn', onSelect: onReport }] : []),
  ];
  return (
    <Dropdown
      align="right"
      menuLabel="Message options"
      items={items}
      renderTrigger={({ open, ...p }) => (
        <button type="button" className="msg-btn" {...p} aria-label="Message options">
          MENU ▾
        </button>
      )}
    />
  );
}
