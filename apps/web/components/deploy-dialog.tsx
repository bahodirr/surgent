'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface DeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onConfirm: (sanitizedName: string) => Promise<void> | void;
  isSubmitting?: boolean;
}

export default function DeployDialog({ open, onOpenChange, defaultName, onConfirm, isSubmitting }: DeployDialogProps) {
  const [deployName, setDeployName] = useState<string>(defaultName || '');
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDeployName(defaultName || '');
    setNameError(null);
  }, [open, defaultName]);

  const sanitize = (value: string) => {
    const lower = value.toLowerCase();
    const replaced = lower.replace(/[^a-z0-9-]+/g, '-');
    const collapsed = replaced.replace(/-+/g, '-');
    const trimmed = collapsed.replace(/^-+|-+$/g, '');
    return trimmed.slice(0, 63);
  };

  const previewDomain = useMemo(() => {
    const sanitized = sanitize(deployName || '');
    return sanitized ? `${sanitized}.surgent.dev` : 'your-app.surgent.dev';
  }, [deployName]);

  const handleConfirm = async () => {
    const sanitized = sanitize(deployName);
    if (!sanitized) {
      setNameError('Please enter a valid name.');
      return;
    }
    setNameError(null);
    await onConfirm(sanitized);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish your app</DialogTitle>
          <DialogDescription>
            Choose a unique subdomain. Your app will be available at this URL.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center">
            <Input
              className="rounded-r-none"
              placeholder="my-app"
              value={deployName}
              onChange={(e) => setDeployName(e.target.value)}
              onBlur={() => setDeployName(sanitize(deployName))}
              disabled={Boolean(isSubmitting)}
            />
            <div className="h-9 px-3 flex items-center border border-input border-l-0 rounded-r-md bg-muted text-sm text-muted-foreground whitespace-nowrap">.surgent.dev</div>
          </div>
          <div className="text-xs text-muted-foreground">Will be published as: {previewDomain}</div>
          {nameError ? <div className="text-xs text-red-500">{nameError}</div> : null}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={Boolean(isSubmitting)}>Cancel</Button>
          <Button className="cursor-pointer" onClick={handleConfirm} disabled={Boolean(isSubmitting)}>
            {isSubmitting ? 'Deploying…' : 'Deploy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


