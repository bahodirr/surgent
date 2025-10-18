'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef } from 'react';
import nightOwl from '@/lib/themes/night-owl.json';
import lightOwl from '@/lib/themes/light-owl.json';

const Monaco = dynamic(() => import('@monaco-editor/react'), { ssr: false });

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  // 'system' follows the OS color scheme; 'light'/'dark' force a theme
  theme?: 'light' | 'dark' | 'system';
  height?: number | string;
  // Optional virtual path for the model; helps TS worker infer TSX
  path?: string;
  // Optionally suppress specific TS diagnostic codes for a softer UX
  suppressTsDiagnostics?: number[];
  // When true, disables editing in the Monaco editor
  readOnly?: boolean;
  // Disable Monaco TS/JS diagnostics (type checking and syntax validation)
  disableDiagnostics?: boolean;
  // Extra Monaco options to override/extend defaults
  options?: any;
};

export default function CodeEditor({
  value,
  onChange,
  language = 'typescript',
  theme = 'system',
  height = '100%',
  readOnly = false,
  disableDiagnostics = false,
  options,
}: CodeEditorProps) {
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);

  // Determine if dark mode should be used
  // const isDark = useMemo(() => {
  //   const prefersDark =
  //     typeof window !== 'undefined' &&
  //     window.matchMedia &&
  //     window.matchMedia('(prefers-color-scheme: dark)').matches;
  //   return theme === 'dark' || (theme === 'system' ? prefersDark : false);
  // }, [theme]);

  const isDark = false;
  // Define Night Owl (dark) and Light Owl themes on mount
  const onMount = async (_editor: any, monaco: any) => {
    editorRef.current = _editor;
    monacoRef.current = monaco;
    monaco.editor.defineTheme('night-owl', nightOwl as any);
    monaco.editor.defineTheme('light-owl', lightOwl as any);
    monaco.editor.setTheme(isDark ? 'night-owl' : 'light-owl');

    if (disableDiagnostics) {
      const ts = monaco.languages?.typescript;
      if (ts) {
        ts.typescriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });
        ts.javascriptDefaults.setDiagnosticsOptions({
          noSemanticValidation: true,
          noSyntaxValidation: true,
        });
      }
    }
  };

  // Keep Monaco theme in sync when system/app theme changes
  useEffect(() => {
    if (!monacoRef.current) return;
    const monaco = monacoRef.current;
    const themeName = isDark ? 'night-owl' : 'light-owl';
    monaco.editor.setTheme(themeName);
  }, [isDark]);

  // Toggle diagnostics when prop changes after mount
  useEffect(() => {
    if (!monacoRef.current) return;
    if (!disableDiagnostics) return;
    const monaco = monacoRef.current;
    const ts = monaco.languages?.typescript;
    if (ts) {
      ts.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
      ts.javascriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: true,
        noSyntaxValidation: true,
      });
    }
  }, [disableDiagnostics]);

  const initialTheme = useMemo(() => (isDark ? 'vs-dark' : 'vs'), [isDark]);

  return (
    <Monaco
      onMount={onMount}
      value={value}
      language={language}
      theme={initialTheme}
      height={height}
      options={{ minimap: { enabled: false }, fontSize: 14, wordWrap: 'on', readOnly, ...(options || {}) }}
      onChange={(v) => onChange(v ?? '')}
      loading={<div className="h-full w-full" />}
    />
  );
}


