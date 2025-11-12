'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ArrowUp, Plus, Mic, X } from 'lucide-react';
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ui/prompt-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MAX_PHOTOS = 6;

type ChatComposerProps = {
  onSend: (text: string, files?: FileList, projectType?: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
};

export function ChatComposer({
  onSend,
  disabled = false,
  placeholder = 'Type a message…',
  className,
  value: controlledValue,
  onValueChange,
}: ChatComposerProps) {
  const [internalValue, setInternalValue] = useState('');
  const value = controlledValue !== undefined ? controlledValue : internalValue;
  const setValue = onValueChange || setInternalValue;
  const [files, setFiles] = useState<File[]>([]);
  const [projectType, setProjectType] = useState<string>('fullstack');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearFiles = () => {
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const createFileList = (items: File[]) => {
    if (items.length === 0) return undefined;
    const dt = new DataTransfer();
    items.forEach(file => dt.items.add(file));
    return dt.files;
  };

  const handleSend = () => {
    const text = value.trim();
    if (disabled) return;
    if (!text && files.length === 0) return;
    onSend(text, createFileList(files), projectType);
    setValue('');
    clearFiles();
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddFiles = (list: FileList | null) => {
    if (!list) return;
    const incoming = Array.from(list);
    setFiles(prev => {
      const current = prev ?? [];
      const remaining = Math.max(0, MAX_PHOTOS - current.length);
      if (remaining === 0) return current;
      const next = current.concat(incoming.slice(0, remaining));
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={cn('w-full', className)}>
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        multiple
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {files.length > 0 && (
        <div className="mb-2 p-2 border border-border rounded-xl bg-foreground/3 flex items-center gap-2">
          <div className="flex items-center gap-2 overflow-x-auto flex-1">
            {files.map((file, idx) => (
              <div key={idx} className="relative h-16 w-16 rounded-lg overflow-hidden border border-border shrink-0">
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="h-full w-full object-cover"
                />
                <Button
                  type="button"
                  size="icon-sm"
                  variant="default"
                  onClick={() => removeFile(idx)}
                  className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black  text-white cursor-pointer"
                >
                  <X className="h-2.5 w-2.5 text-white" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFiles}
            className="shrink-0 cursor-pointer"
          >
            Clear
          </Button>
        </div>
      )}

      <PromptInput
        value={value}
        onValueChange={setValue}
        onSubmit={handleSend}
        className="w-full"
      >
        <PromptInputTextarea
          id="chat-message-input"
          placeholder={placeholder}
          className={cn(
            'min-h-[48px] max-h-[200px] overflow-hidden',
            'text-[16px] leading-7 placeholder:text-foreground/40',
            'px-1'
          )}
        />

        <PromptInputActions className="pt-2">
          <div className="flex items-center gap-1.5">
            <PromptInputAction
              tooltip={
                files.length >= MAX_PHOTOS
                  ? `Max ${MAX_PHOTOS} photos`
                  : files.length
                  ? `${files.length} selected`
                  : 'Attach photos'
              }
            >
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || files.length >= MAX_PHOTOS}
                className="h-8 w-8 rounded-full cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PromptInputAction>

            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger size="sm" className="h-8 rounded-xl border border-border bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fullstack">Full Stack App</SelectItem>
                <SelectItem value="landing">Landing Page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            {/* <PromptInputAction tooltip="Voice input">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-2xl cursor-pointer"
                disabled={disabled}
              >
                <Mic className="h-5 w-5" />
              </Button>
            </PromptInputAction> */}

            <PromptInputAction
              tooltip={disabled || (!value.trim() && !files.length) ? 'Type or attach' : 'Send'}
            >
              <Button
                type="button"
                size="icon"
                onClick={handleSend}
                disabled={disabled || (!value.trim() && !files.length)}
                className={cn(
                  'h-8 w-8 rounded-full bg-brand text-brand-foreground hover:opacity-90 shadow-sm transition-opacity',
                  disabled || (!value.trim() && !files.length)
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer'
                )}
              >
                <ArrowUp className="h-5 w-5" />
              </Button>
            </PromptInputAction>
          </div>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
}
