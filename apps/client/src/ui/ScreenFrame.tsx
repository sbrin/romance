import type { ReactNode } from 'react'

const ScreenFrame = ({ children }: { children: ReactNode }) => {
  return <main className="screen-frame">{children}</main>
}

export default ScreenFrame
