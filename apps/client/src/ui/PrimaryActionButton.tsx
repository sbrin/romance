import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost'

type PrimaryActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
}

const PrimaryActionButton = ({
  variant = 'primary',
  className,
  ...props
}: PrimaryActionButtonProps) => {
  const classes = ['action-button', `action-button--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return <button className={classes} type="button" {...props} />
}

export default PrimaryActionButton
