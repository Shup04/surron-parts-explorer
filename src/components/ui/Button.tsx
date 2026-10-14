import type { ComponentPropsWithRef, ReactNode } from 'react';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
};

/** Native button behavior with shared visual states; callers retain all ARIA and event props. */
export function Button({
  variant = 'secondary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={`ui-button ui-button--${variant} ${className}`} {...props} />
  );
}

export function IconButton({
  label,
  children,
  className = '',
  ...props
}: ButtonProps & {
  label: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      className={`ui-icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}
