/// <reference types="vite/client" />

// A locale's Scene Studio strings, which load with the Studio's chunk (tools/viteI18nStudioCatalog.ts).
declare module 'virtual:cot-i18n-studio/*' {
  const strings: Readonly<Record<string, string>>;
  export default strings;
}
