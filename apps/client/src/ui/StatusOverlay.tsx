import type { ReactNode } from 'react'

type StatusOverlayProps = {
  title: string
  subtitle?: ReactNode
  badge?: string
  pulse?: boolean
  accent?: boolean
  children?: ReactNode
}

const StatusOverlay = ({
  title,
  subtitle,
  badge,
  pulse = false,
  accent = false,
  children,
}: StatusOverlayProps) => {
  return (
    <section className={`status-overlay${accent ? ' status-overlay--accent' : ''}`}>
      {pulse && <div className="status-overlay__pulse" aria-hidden="true" />}
      {badge && <div className="status-overlay__badge">{badge}</div>}
      <h2 className="status-overlay__title display-font">{title}</h2>
      {subtitle && <p className="status-overlay__subtitle">{subtitle}</p>}
      {children && <div className="status-overlay__actions">{children}</div>}
    </section>
  )
}

export default StatusOverlay
