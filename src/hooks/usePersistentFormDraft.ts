import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

type DraftControl = {
  value: string;
  checked?: boolean;
  type: string;
};

const getDraftKey = (formKey: string) => `erp_form_draft:${formKey}`;
const getControlType = (control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) =>
  control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase();

export const usePersistentFormDraft = <T extends HTMLElement = HTMLFormElement>(formKey: string) => {
  const formRef = useRef<T | null>(null);
  const submitLocked = useRef(false);
  const submitTimer = useRef<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveDraft = useCallback((event: ChangeEvent<T>) => {
    const controls = Array.from(event.currentTarget.querySelectorAll('input, textarea, select'))
      .filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
      .filter(element => !['file', 'password', 'submit', 'button', 'reset'].includes(
        element instanceof HTMLInputElement ? element.type : ''
      ))
      .slice(0, 200);
    const draft: DraftControl[] = controls.map(control => ({
      value: control.value.slice(0, 20000),
      type: getControlType(control),
      ...(control instanceof HTMLInputElement &&
        ['checkbox', 'radio'].includes(control.type)
        ? { checked: control.checked }
        : {})
    }));
    try {
      window.localStorage.setItem(getDraftKey(formKey), JSON.stringify(draft));
    } catch (error) {
      console.error(`Không thể lưu bản nháp biểu mẫu (${formKey}):`, error);
    }
  }, [formKey]);

  useEffect(() => {
    let draft: DraftControl[] | null = null;
    try {
      const saved = window.localStorage.getItem(getDraftKey(formKey));
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.every(item =>
          item &&
          typeof item === 'object' &&
          typeof item.value === 'string' &&
          typeof item.type === 'string' &&
          (item.checked === undefined || typeof item.checked === 'boolean')
        )) {
          draft = parsed as DraftControl[];
        }
      }
    } catch (error) {
      console.error(`Không thể đọc bản nháp biểu mẫu (${formKey}):`, error);
    }
    if (!draft) return;

    const timeoutId = window.setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const controls = Array.from(form.querySelectorAll('input, textarea, select'))
        .filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLSelectElement
        )
        .filter(element => !['file', 'password', 'submit', 'button', 'reset'].includes(
          element instanceof HTMLInputElement ? element.type : ''
        ));

      controls.forEach((control, index) => {
        const savedControl = draft?.[index];
        if (!savedControl || savedControl.type !== getControlType(control)) return;
        if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;
          setter?.call(control, Boolean(savedControl.checked));
        } else {
          const prototype = control instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : control instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : HTMLSelectElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          setter?.call(control, savedControl.value);
        }
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [formKey]);

  const guardSubmit = useCallback((event: FormEvent<T>) => {
    if (submitLocked.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    submitLocked.current = true;
    setIsSubmitting(true);
    submitTimer.current = window.setTimeout(() => {
      submitLocked.current = false;
      submitTimer.current = undefined;
      setIsSubmitting(false);
    }, 700);
  }, []);

  useEffect(() => () => {
    if (submitTimer.current !== undefined) window.clearTimeout(submitTimer.current);
  }, []);

  const clearDraft = useCallback(() => {
    try {
      window.localStorage.removeItem(getDraftKey(formKey));
    } catch (error) {
      console.error(`Không thể xóa bản nháp biểu mẫu (${formKey}):`, error);
    }
  }, [formKey]);

  const formDraftProps = {
    ref: formRef,
    'data-erp-draft': formKey,
    onChangeCapture: saveDraft,
    onSubmitCapture: guardSubmit
  };

  return { formDraftProps, clearDraft, isSubmitting };
};
