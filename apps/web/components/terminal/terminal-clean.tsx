'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';

export default function TerminalClean() {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  useEffect(() => {
    if (!terminalRef.current) return;

    requestAnimationFrame(() => {
      if (!terminalRef.current) return;

      const term = new XTerm({
        theme: {
          background: '#fafafa',
          foreground: '#24292e',
          cursor: '#0969da',
          cursorAccent: '#fafafa',
          selectionBackground: '#0969da',
          selectionForeground: '#ffffff',
          selectionInactiveBackground: '#e1e4e8',
          black: '#24292e',
          red: '#d73a49',
          green: '#28a745',
          yellow: '#dbab09',
          blue: '#0969da',
          magenta: '#6f42c1',
          cyan: '#0598bc',
          white: '#6a737d',
          brightBlack: '#586069',
          brightRed: '#cb2431',
          brightGreen: '#22863a',
          brightYellow: '#b08800',
          brightBlue: '#005cc5',
          brightMagenta: '#5a32a3',
          brightCyan: '#3192aa',
          brightWhite: '#959da5'
        },
        fontSize: 14,
        fontFamily: '"SF Mono", "Monaco", "Inconsolata", "Fira Code", "Fira Mono", "Source Code Pro", "Cascadia Code", "Droid Sans Mono", monospace',
        fontWeight: '400',
        fontWeightBold: '700',
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 10000,
        tabStopWidth: 4,
        letterSpacing: 0,
        lineHeight: 1.5,
        allowTransparency: false,
        drawBoldTextInBrightColors: true,
        rightClickSelectsWord: true,
        wordSeparator: ' ()[]{}\',"`',
        altClickMovesCursor: true,
        convertEol: true,
        allowProposedApi: true,
        smoothScrollDuration: 0,
        scrollOnUserInput: true,
        scrollSensitivity: 3,
        fastScrollModifier: 'shift',
        fastScrollSensitivity: 5
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const searchAddon = new SearchAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.loadAddon(searchAddon);

      term.open(terminalRef.current);
      
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
        term.loadAddon(webglAddon);
      } catch (e) {
        console.warn('WebGL addon could not be loaded:', e);
      }
      
      const dimensions = fitAddon.proposeDimensions();
      if (dimensions && dimensions.cols && dimensions.rows) {
        term.resize(dimensions.cols, dimensions.rows);
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.hostname}:4000/terminal`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        
        if (dimensions) {
          ws.send(JSON.stringify({ 
            event: 'resize', 
            data: { cols: dimensions.cols, rows: dimensions.rows } 
          }));
        }
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'output') {
          term.write(message.data);
        }
      };

      ws.onclose = (event) => {
        setConnectionStatus('disconnected');
        term.writeln('\r\n\r\nConnection to server lost. Please refresh the page.');
      };

      ws.onerror = (error) => {
        setConnectionStatus('disconnected');
        term.writeln('\r\n\r\nFailed to connect to terminal server.');
      };

      term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'input', data }));
        }
      });
      
      terminalRef.current.addEventListener('copy', (e) => {
        if (term.hasSelection()) {
          e.clipboardData?.setData('text/plain', term.getSelection());
          e.preventDefault();
        }
      });
      
      terminalRef.current.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text/plain');
        if (text && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'input', data: text }));
          e.preventDefault();
        }
      });

      const handleResize = () => {
        const dimensions = fitAddon.proposeDimensions();
        if (dimensions && dimensions.cols && dimensions.rows) {
          term.resize(dimensions.cols, dimensions.rows);
          
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ 
              event: 'resize', 
              data: { cols: dimensions.cols, rows: dimensions.rows } 
            }));
          }
        }
      };

      window.addEventListener('resize', handleResize);
      xtermRef.current = term;

      return () => {
        window.removeEventListener('resize', handleResize);
        if (wsRef.current) {
          wsRef.current.close();
        }
        term.dispose();
      };
    });
  }, []);

  return (
    <div className="h-full w-full bg-gray-50 flex flex-col">
      {connectionStatus === 'connecting' && (
        <div className="p-4 text-sm text-gray-600">
          Connecting to terminal server...
        </div>
      )}
      {connectionStatus === 'disconnected' && (
        <div className="p-4 text-sm text-red-600">
          Disconnected from server. Please refresh the page.
        </div>
      )}
      <div 
        ref={terminalRef} 
        className="flex-1 p-4"
      />
    </div>
  );
}