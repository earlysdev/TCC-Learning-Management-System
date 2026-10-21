import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helpText?: string;
  glass?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helpText, className = '', glass = false, ...props }, ref) => {
    return (
      <div className="form-group">
        {label && <label className="form-label">{label}</label>}
        <input
          ref={ref}
          className={`form-input ${error ? 'error' : ''} ${className}`}
          style={glass ? { background: 'transparent' } : {}}
          {...props}
        />
        {error && <span className="form-error-text">{error}</span>}
        {!error && helpText && <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>{helpText}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
