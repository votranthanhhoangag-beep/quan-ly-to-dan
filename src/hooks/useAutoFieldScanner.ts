import { useEffect, useState } from 'react';
import { scanVisibleVoiceFields, type AutoVoiceField } from '../utils/autoFieldScanner';

const sameFields = (first: AutoVoiceField[], second: AutoVoiceField[]) =>
  first.length === second.length && first.every((field, index) =>
    field.element === second[index].element &&
    field.label === second[index].label &&
    field.kind === second[index].kind);

export function useAutoFieldScanner() {
  const [fields, setFields] = useState<AutoVoiceField[]>([]);

  useEffect(() => {
    let frame = 0;
    const refresh = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const nextFields = scanVisibleVoiceFields();
        setFields(current => sameFields(current, nextFields) ? current : nextFields);
      });
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'aria-label', 'aria-hidden', 'aria-disabled', 'aria-autocomplete',
        'class', 'data-voice-label', 'data-voice-search-dropdown', 'disabled',
        'hidden', 'list', 'placeholder', 'readonly', 'role', 'style', 'type'
      ]
    });
    window.addEventListener('resize', refresh);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('popstate', refresh);
    window.addEventListener('hashchange', refresh);

    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('popstate', refresh);
      window.removeEventListener('hashchange', refresh);
    };
  }, []);

  return fields;
}
