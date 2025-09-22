'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from 'convex/react';
import { api, Id } from '@repo/backend';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, Code2, Clock, Activity } from 'lucide-react';
import { useAuthActions } from '@convex-dev/auth/react';

export default function DashboardPage() {
  const router = useRouter();
  const user = useQuery(api.auth.loggedInUser, {});
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const { signOut } = useAuthActions();

  // Convex data
  const projects = useQuery(api.projects.listProjects, {});
  const createProjectMutation = useMutation(api.projects.createProject);
  const newProject = useQuery(
    api.projects.getProject,
    newProjectId ? { projectId: newProjectId as Id<'projects'> } : 'skip'
  );

  const createProject = async () => {
    if (creatingProject) return;
    setCreatingProject(true);
    try {
      const id = await createProjectMutation({
        name: `Project ${new Date().toLocaleDateString()}`,
      });
      setNewProjectId(String(id));
    } catch (err) {
      console.error('Error creating project:', err);
      setCreatingProject(false);
    }
  };

  // Redirect only after the project sandbox is initialized
  useEffect(() => {
    if (!newProjectId) return;
    const isReady = (newProject as any)?.sandbox?.isInitialized === true;
    if (isReady) {
      router.push(`/project?id=${newProjectId}`);
      setNewProjectId(null);
      setCreatingProject(false);
    }
  }, [newProjectId, newProject, router]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const formatDate = (ms: number) => {
    try {
      return new Date(ms).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const loading = projects === undefined;

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-muted/30 px-8 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Skeleton className="h-8 w-32 rounded-xl" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-8 py-8 space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-5 w-96 rounded-xl" />
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl border border-border/50 bg-muted/30 p-6 space-y-4">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32 rounded-xl" />
                  <Skeleton className="h-4 w-24 rounded-xl" />
                </div>
                <Skeleton className="h-4 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-muted/30">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-medium">Surgent</h1>
            <Badge variant="secondary" className="text-xs rounded-full px-2 py-0.5">Beta</Badge>
          </div>
          
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.image} alt={user?.name || user?.email} />
                    <AvatarFallback>
                      {user?.name?.charAt(0) || user?.email?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user?.name || 'User'}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-3xl font-light mb-3">
            Welcome back{user?.name ? `, ${user.name}` : ''}
          </h2>
          <p className="text-muted-foreground text-sm">
            Create and manage your Claude-powered projects
          </p>
        </div>

        {/* Projects Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Your Projects</h3>
            <Button 
              onClick={createProject} 
              disabled={creatingProject}
              className="flex items-center gap-2 rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
            >
              {creatingProject ? (
                <>
                  <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  {newProjectId ? 'Initializing…' : 'Creating...'}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  New Project
                </>
              )}
            </Button>
          </div>

          {(projects?.length ?? 0) === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/50 bg-muted/30 p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <Code2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No projects yet</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Create your first project to get started
                </p>
                <Button 
                  onClick={createProject} 
                  disabled={creatingProject}
                  className="flex items-center gap-2 rounded-full bg-foreground text-background hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-opacity"
                >
                  {creatingProject ? (
                    <>
                      <div className="h-4 w-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                      {newProjectId ? 'Initializing…' : 'Creating...'}
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Create Project
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {projects?.map((project) => (
                <div
                  key={String((project as any)._id)}
                  className="rounded-3xl border border-border/50 bg-muted/30 p-6 hover:bg-muted/50 hover:border-border/70 transition-all cursor-pointer group"
                  onClick={() => router.push(`/project?id=${String((project as any)._id)}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="space-y-1">
                      <h4 className="text-base font-medium group-hover:text-foreground transition-colors">{project.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        Created {formatDate((project as any)._creationTime)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/project?id=${String((project as any)._id)}`);
                          }}
                        >
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement rename
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            // TODO: Implement delete
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Activity className="h-3 w-3" />
                        <span>
                          {(project as any).sandboxId ? 'Active' : 'Not initialized'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        <span>Updated recently</span>
                      </div>
                    </div>
                    {project.github?.repo && (
                      <Badge variant="secondary" className="text-xs rounded-full px-2 py-0.5">
                        {project.github.repo}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}