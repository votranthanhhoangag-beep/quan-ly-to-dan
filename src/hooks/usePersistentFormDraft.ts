import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

export const usePersistentFormDraft = <T extends HTMLElement = HTMLFormElement>(formKey: string) => {
  const submitLocked = useRef(false);
  const submitTimer = useRef<number | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const clearDraft = useCallback(() => undefined, []);
  const formDraftProps = {
    'data-erp-draft': formKey,
    onSubmitCapture: guardSubmit
  };

  return { formDraftProps, clearDraft, isSubmitting };
};
