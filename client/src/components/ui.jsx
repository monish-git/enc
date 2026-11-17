import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import PixelIcon from './PixelIcon.jsx';

const cx = (...a) => a.filter(Boolean).join(' ');

/* ------------------------------------------------------------------ title bar + window */
const Glyph = ({ kind }) => {
  const d = {
    min: <rect x="1" y="5" width="6" height="2" fill="currentColor" />,
    max: <path d="M0 0h8v8H0z M1 2h6v5H1z" fill="currentColor" fillRule="evenodd" />,
    restore: (
      <>
        <path d="M2 0h6v6H2z M3 1h4v4H3z" fill="currentColor" fillRule="evenodd" />
        <path d="M0 2h6v6H0z M1 3h4v4H1z" fill="currentColor" fillRule="evenodd" />
      </>
    ),
    close: (
      <path d="M0 0h2v1h1v1h2V1h1V0h2v1H7v1H6v1H5v1h1v1h1v1h1v1H6V6H5V5H3v1H2v1H0V6h1V5h1V4h1V3H2V2H1V1H0z" fill="currentColor" />
    ),
  }[kind];
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
      {d}
    </svg>
  );
};

export function TitleBar({ title, icon, active = true, onMinimize, onMaximize, onClose, maximized, extra, id }) {
  return (
    <div className={cx('titlebar', !active && 'inactive')}>
      {icon && <PixelIcon name={icon} size={16} />}
      <span className="ttl" id={id}>
        {title}
      </span>
      {extra}
      <div className="tbtns">
        {onMinimize && (
          <button type="button" className="tbtn" onClick={onMinimize} aria-label="Minimize" title="Minimize">
            <Glyph kind="min" />
          </button>
        )}
        {onMaximize && (
          <button type="button" className="tbtn" onClick={onMaximize} aria-label={maximized ? 'Restore' : 'Maximize'} title={maximized ? 'Restore' : 'Maximize'}>
            <Glyph kind={maximized ? 'restore' : 'max'} />
          </button>
        )}
        {onClose && (
          <button type="button" className={cx('tbtn', (onMinimize || onMaximize) && 'gap')} onClick={onClose} aria-label="Close" title="Close">
            <Glyph kind="close" />
          </button>
        )}
      </div>
    </div>
  );
}

export function Window({ title, icon, active = true, className, bodyClassName, children, ...bar }) {
  return (
    <div className={cx('win', className)}>
      <TitleBar title={title} icon={icon} active={active} {...bar} />
      <div className={cx('win-body', bodyClassName)}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ buttons + fields */
export const Btn = forwardRef(function Btn({ variant, size, icon, className, children, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cx('btn', variant === 'primary' && 'primary', variant === 'danger' && 'danger', size === 'sm' && 'sm', size === 'icon' && 'icon', className)} {...rest}>
      {icon && <PixelIcon name={icon} size={14} />}
      {children}
    </button>
  );
});

export const Field = forwardRef(function Field({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('field', className)} {...rest} />;
});

export const TextArea = forwardRef(function TextArea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('field', className)} {...rest} />;
});

export function Select({ className, children, ...rest }) {
  return (
    <select className={cx('field', className)} {...rest}>
      {children}
    </select>
  );
}

export function Check({ label, checked, onChange, disabled, id: idProp, hint }) {
  const auto = useId();
  const id = idProp || auto;
  return (
    <label className="chk" htmlFor={id}>
      <input id={id} type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="dim"> {hint}</span>}
      </span>
    </label>
  );
}

export function Label({ htmlFor, children, className }) {
  return (
    <label htmlFor={htmlFor} className={cx('block mb-0.5', className)}>
      {children}
    </label>
  );
}

export function Group({ legend, children, className }) {
  return (
    <fieldset className={cx('group', className)}>
      {legend && <legend>{legend}</legend>}
      {children}
    </fieldset>
  );
}

export function Tabs({ tabs, value, onChange, label = 'Sections' }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} className="tab" onClick={() => onChange(t.id)}>
          {t.label}
          {t.count > 0 && <span className="badge ml-1.5">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ feedback widgets */
export function PixelBar({ label, done }) {
  return (
    <div role="progressbar" aria-busy={!done} aria-label={label || 'Loading'}>
      {label && <div className="mb-1">{label}</div>}
      <div className={cx('pxbar', done && 'done')}>
        <i />
      </div>
    </div>
  );
}

const FRAMES = ['|', '/', '-', '\\'];
export function PixelSpinner({ label = 'LOADING' }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % 4), 120);
    return () => clearInterval(t);
  }, []);
  return (
    <span role="status" className="inline-flex items-center gap-1.5">
      <span className="hourglass" aria-hidden="true">
        {FRAMES[i]}
      </span>
      {label}...
    </span>
  );
}

export function Loading({ label = 'LOADING DATA' }) {
  return (
    <div className="p-4 flex flex-col gap-2 max-w-sm mx-auto w-full">
      <PixelSpinner label={label} />
      <PixelBar />
    </div>
  );
}

export function Empty({ icon = 'folder', title, children }) {
  return (
    <div className="p-6 text-center flex flex-col items-center gap-2" role="status">
      <PixelIcon name={icon} size={32} />
      <div className="font-bold">{title}</div>
      {children && <div className="dim max-w-xs">{children}</div>}
    </div>
  );
}

export function ErrorBox({ children, onRetry, title = 'ERROR' }) {
  return (
    <div className="p-3 flex items-start gap-3 m-2 raised" role="alert">
      <PixelIcon name="warn" size={24} />
      <div className="flex-1 min-w-0">
        <div className="font-bold">{title}</div>
        <div className="break-words">{children}</div>
        {onRetry && (
          <Btn size="sm" className="mt-2" onClick={onRetry}>
            RETRY
          </Btn>
        )}
      </div>
    </div>
  );
}

export function Lamp({ state = 'off', label }) {
  return <span className={cx('lamp', state === 'on' && 'on', state === 'warn' && 'warn', state === 'bad' && 'bad')} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}

/* ------------------------------------------------------------------ dialog */
const focusable = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, icon = 'info', onClose, children, footer, width = 440, dismissable = true, className }) {
  const titleId = useId();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const first = el?.querySelector('[data-autofocus]') || el?.querySelector('input:not(:disabled), textarea:not(:disabled), select:not(:disabled)') || el?.querySelector('.dlg-body button:not(:disabled)') || el?.querySelector(focusable);
    first?.focus();
    return () => {
      if (prev && document.contains(prev)) prev.focus?.();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && dismissable) {
      e.stopPropagation();
      closeRef.current?.();
    }
    if (e.key === 'Tab') {
      const items = [...ref.current.querySelectorAll(focusable)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && dismissable && onClose?.()}>
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.1, ease: 'linear' }}
        className={cx('win', className)}
        style={{ width: `min(${width}px, 100%)`, maxHeight: '100%', boxShadow: undefined }}
      >
        <TitleBar title={title} icon={icon} id={titleId} onClose={dismissable ? onClose : undefined} />
        <div className="dlg-body p-3 overflow-auto min-h-0 flex-1">{children}</div>
        {footer && <div className="px-3 pb-3 pt-1 flex gap-2 justify-end flex-wrap">{footer}</div>}
      </motion.div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ dropdown menu */
export function Dropdown({ renderTrigger, items, align = 'left', menuLabel = 'Menu' }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const id = useId();

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!t || !m) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = align === 'right' ? t.right - m.width : t.left;
    left = Math.max(4, Math.min(left, vw - m.width - 4));
    let top = t.bottom + 1;
    if (top + m.height > vh - 4) top = Math.max(4, t.top - m.height - 1);
    setPos({ top, left, visible: true });
  }, [open, align, items.length]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    const away = (e) => {
      if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) close();
    };
    const dismiss = () => close();
    document.addEventListener('mousedown', away);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [open, close]);

  const onKey = (e) => {
    const els = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    const i = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const trigger = renderTrigger({
    ref: triggerRef,
    onClick: () => {
      setPos((p) => ({ ...p, visible: false }));
      setOpen((o) => !o);
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    open,
  });

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div ref={menuRef} id={id} role="menu" aria-label={menuLabel} className="menu" style={{ top: pos.top, left: pos.left, visibility: pos.visible ? 'visible' : 'hidden' }} onKeyDown={onKey}>
            {items.map((it, i) =>
              it.sep ? (
                <div key={`s${i}`} className="menu-sep" role="separator" />
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  disabled={it.disabled}
                  onClick={() => {
                    close(true);
                    it.onSelect?.();
                  }}
                >
                  <span className="mi-icon">{it.icon ? <PixelIcon name={it.icon} size={14} /> : it.check ? '✓' : null}</span>
                  <span>{it.label}</span>
                  {it.hint && <span className="mi-hint">{it.hint}</span>}
                </button>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
