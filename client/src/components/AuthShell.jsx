import { TitleBar } from './ui.jsx';
import PixelIcon from './PixelIcon.jsx';
import { Clock } from './Desktop.jsx';

// Desktop with a single centred window - used by the login / register / start-up screens.
export default function AuthShell({ title, icon = 'lock', width = 460, children }) {
  return (
    <div className="desktop">
      <div className="desktop-area items-center justify-center overflow-auto p-2">
        <div className="win my-auto" style={{ width: `min(${width}px, 100%)`, boxShadow: '4px 4px 0 rgba(0,0,0,.35)' }}>
          <TitleBar title={title} icon={icon} />
          <div className="win-body p-3">{children}</div>
        </div>
      </div>
      <div className="taskbar">
        <span className="task-btn">
          <PixelIcon name="computer" size={16} /> Start
        </span>
        <div className="tray">
          <Clock />
        </div>
      </div>
    </div>
  );
}
