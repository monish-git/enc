import SecurityDashboard from '../components/SecurityDashboard.jsx';
import PixelIcon from '../components/PixelIcon.jsx';

export default function SecurityCenter() {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 p-1.5" style={{ boxShadow: '0 1px 0 var(--lo), 0 2px 0 var(--hi)' }}>
        <PixelIcon name="shield" size={24} />
        <div>
          <div className="font-bold text-[13px]">SECURITY CENTER</div>
          <div className="dim">Encryption status, sessions, login activity and the security log.</div>
        </div>
      </div>
      <SecurityDashboard />
    </div>
  );
}
