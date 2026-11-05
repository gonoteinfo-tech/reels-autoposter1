"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  disabled?: boolean;
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
let openDialogs = 0;
let previousBodyOverflow = "";

export default function Modal({ title, description, children, onClose, disabled = false }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    closeRef.current = onClose;
    disabledRef.current = disabled;
  }, [onClose, disabled]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs++ === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    const focusable = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (element) => element.getClientRects().length > 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'),
    );
    const focusFirst = () => {
      const preferred = panel.querySelector<HTMLElement>("[data-modal-autofocus]");
      (preferred && !preferred.matches(":disabled") ? preferred : focusable()[0] || panel).focus({ preventScroll: true });
    };
    focusFirst();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!disabledRef.current) closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) {
        event.preventDefault();
        panel.focus();
      } else if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusFirst();
    };
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocus);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocus);
      if (--openDialogs === 0) document.body.style.overflow = previousBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/35 p-4 backdrop-blur-[3px]"
      onClick={(event) => {
        if (event.target === event.currentTarget && !disabled) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={disabled || undefined}
        tabIndex={-1}
        className="card relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto p-6 shadow-[0_24px_80px_rgba(25,31,38,0.18)] sm:p-7"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 text-xl font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p id={descriptionId} className="mb-0 mt-2 text-sm leading-relaxed text-muted">{description}</p>}
          </div>
          <button type="button" className="btn btn-icon -mr-2 -mt-2 shrink-0" onClick={onClose} disabled={disabled} aria-label="Fechar">
            <X aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
