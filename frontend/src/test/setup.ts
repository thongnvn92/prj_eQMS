// Setup chung cho Vitest – @testing-library/react tự dọn DOM sau mỗi test.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

const fakeGetComputedStyle = (_elt: Element, _pseudoElt?: string | null) => ({
  getPropertyValue: () => '',
  setProperty: () => undefined,
  removeProperty: () => undefined,
  length: 0,
  parentRule: null,
}) as unknown as CSSStyleDeclaration;

Object.defineProperty(window, 'getComputedStyle', {
  writable: true,
  configurable: true,
  value: fakeGetComputedStyle,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
