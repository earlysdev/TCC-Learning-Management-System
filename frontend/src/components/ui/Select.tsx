import React, { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  badge?: string;
  count?: number;
  icon?: ReactNode;
  description?: string;
}

export interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: (SelectOption | string)[];
  placeholder?: string;
  error?: string;
  helpText?: string;
  disabled?: boolean;
  className?: string;
  searchable?: boolean;
  style?: React.CSSProperties;
}

export default function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  error,
  helpText,
  disabled = false,
  className = '',
  searchable = false,
  style,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openUpward, setOpenUpward] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Normalize options to SelectOption objects
  const normalizedOptions: SelectOption[] = options.map((opt) => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  });

  const selectedOption = normalizedOptions.find((opt) => opt.value === value);

  // Filter options if searchable
  const filteredOptions = normalizedOptions.filter((opt) => {
    if (!searchQuery) return true;
    return (
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opt.badge && opt.badge.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Smart placement calculation (auto dropup when space below is tight)
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      // If space below is less than 280px and there's more space above, open upward
      setOpenUpward(spaceBelow < 280 && spaceAbove > spaceBelow);
      // If close to the right edge of the screen, align right
      setAlignRight(window.innerWidth - rect.left < 260);
    }
  }, [isOpen]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
    setSearchQuery('');
  };

  const shouldShowSearch = searchable || normalizedOptions.length > 7;

  return (
    <div
      className={`form-group custom-select-wrapper ${className}`}
      style={{ position: 'relative', zIndex: isOpen ? 50 : undefined, ...style }}
      ref={containerRef}
    >
      {label && <label className="form-label">{label}</label>}

      {/* Select Trigger Box */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`custom-select-trigger ${isOpen ? 'active' : ''} ${error ? 'error' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0, overflow: 'hidden' }}>
          {selectedOption?.icon && (
            <span style={{ display: 'inline-flex', color: 'var(--accent-purple-light)' }}>
              {selectedOption.icon}
            </span>
          )}
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: selectedOption ? 'white' : 'rgba(255, 255, 255, 0.45)',
              fontWeight: selectedOption ? 500 : 400,
            }}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          {selectedOption?.badge && (
            <span
              style={{
                fontSize: '0.7rem',
                background: 'rgba(124, 58, 237, 0.35)',
                color: '#c4b5fd',
                padding: '0.15rem 0.45rem',
                borderRadius: '999px',
                fontWeight: 600,
              }}
            >
              {selectedOption.badge}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--neutral-400)' }}>
          {selectedOption?.count !== undefined && (
            <span style={{ fontSize: '0.75rem', color: 'var(--neutral-300)' }}>
              ({selectedOption.count})
            </span>
          )}
          <ChevronDown
            size={16}
            style={{
              transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              color: isOpen ? 'var(--accent-purple-light, #a78bfa)' : 'rgba(255, 255, 255, 0.6)',
            }}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className={`custom-select-dropdown fade-in ${openUpward ? 'open-upward' : ''} ${alignRight ? 'align-right' : ''}`}>
          {shouldShowSearch && (
            <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'rgba(255, 255, 255, 0.06)',
                  padding: '0.35rem 0.6rem',
                  borderRadius: 'var(--radius-sm, 6px)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                <Search size={14} style={{ color: 'rgba(255, 255, 255, 0.5)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Filter options..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'white',
                    fontSize: '0.85rem',
                    width: '100%',
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div
            className="custom-select-options-list"
            role="listbox"
            style={{
              maxHeight: '230px',
              overflowY: 'auto',
              padding: '0.35rem',
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '1rem',
                  textAlign: 'center',
                  color: 'var(--neutral-400)',
                  fontSize: '0.85rem',
                }}
              >
                No options match your search.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelect(opt.value)}
                    className={`custom-select-option ${isSelected ? 'selected' : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      {opt.icon && <span>{opt.icon}</span>}
                      <div>
                        <div style={{ fontWeight: isSelected ? 600 : 400, color: isSelected ? 'white' : '#f1f5f9' }}>
                          {opt.label}
                        </div>
                        {opt.description && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: '0.1rem' }}>
                            {opt.description}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {opt.badge && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            background: 'rgba(124, 58, 237, 0.3)',
                            color: '#c4b5fd',
                            padding: '0.15rem 0.45rem',
                            borderRadius: '999px',
                            fontWeight: 600,
                          }}
                        >
                          {opt.badge}
                        </span>
                      )}
                      {opt.count !== undefined && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)' }}>
                          {opt.count}
                        </span>
                      )}
                      {isSelected && (
                        <Check size={15} style={{ color: 'var(--accent-purple-light, #c4b5fd)' }} />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {error && <span className="form-error-text">{error}</span>}
      {!error && helpText && (
        <span style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', marginTop: '0.25rem' }}>
          {helpText}
        </span>
      )}
    </div>
  );
}
