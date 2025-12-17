"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import { ArrowLeft, Users, Rocket, CreditCard, Pencil, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth-client";
import { useDeployProject, useRenameProject } from "@/queries/projects";
import DeployDialog from "@/components/deploy-dialog";
import PaywallDialog from "@/components/autumn/paywall-dialog";
import { useCustomer } from "autumn-js/react";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface ProjectHeaderProps {
  projectId?: string;
  project?: {
    name?: string;
    deployment?: {
      name?: string;
      status?: string;
      error?: string;
    };
  };
}

export default function ProjectHeader({ projectId, project }: ProjectHeaderProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const deployProject = useDeployProject();
  const renameProject = useRenameProject();
  const { customer, check } = useCustomer();
  const [isCheckingAccess, setIsCheckingAccess] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) setUser(data.user as User);
    });
  }, []);

  const handleStartEdit = () => {
    setEditName(project?.name || "");
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    const trimmed = editName.trim();
    if (!projectId || !trimmed || trimmed === project?.name) {
      setIsEditing(false);
      return;
    }
    renameProject.mutate(
      { id: projectId, name: trimmed },
      {
        onSuccess: () => setIsEditing(false),
        onError: () => toast.error("Failed to rename"),
      }
    );
  };

  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard?.writeText(url).then(() => {
      toast.success("Link copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy link");
    });
  };

  const handleConfirmDeploy = useCallback(async (name: string) => {
    if (!projectId || isDeploying) return;
    setIsDeploying(true);
    try {
      await deployProject.mutateAsync({ id: projectId, deployName: name });
      setIsDialogOpen(false);
      toast.success("Deployment started!");
    } catch {
      toast.error("Failed to start deployment");
    }
    setIsDeploying(false);
  }, [deployProject, isDeploying, projectId]);

  const handlePublishClick = useCallback(async () => {
    if (!projectId || isCheckingAccess) return;
    
    setIsCheckingAccess(true);
    try {
      const { data } = check({ featureId: "publish_your_app" });
      
      if (data?.allowed) {
        setIsDialogOpen(true);
      } else {
        setIsPaywallOpen(true);
      }
    } catch {
      // If check fails, allow user to proceed (fail open)
      setIsDialogOpen(true);
    }
    setIsCheckingAccess(false);
  }, [projectId, isCheckingAccess, check]);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/login");
  };

  const deployment = project?.deployment;
  const deploymentName = deployment?.name;
  const status = deployment?.status ?? "";
  const isInProgress = ["queued", "starting", "building", "uploading"].includes(status);
  const isFailed = status.includes("failed");
  const errorMsg = isFailed ? (deployment?.error || status) : null;

  return (
    <>
      <header className="h-12 flex items-center justify-between px-4 bg-background border-b shrink-0">
        {/* Left side */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/dashboard")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          {isEditing ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setIsEditing(false);
              }}
              className="h-7 px-2 text-sm font-medium rounded-md border border-input bg-background shadow-xs outline-none focus:border-ring focus:ring-ring/50 focus:ring-[3px] w-44 transition-shadow"
              autoFocus
            />
          ) : (
            <button
              onClick={handleStartEdit}
              className="group flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-md text-sm font-medium hover:bg-muted transition-colors"
            >
              {project?.name || "Untitled Project"}
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {status && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${status === "deployed" ? "bg-green-500" : isFailed ? "bg-red-500" : "bg-yellow-500 animate-pulse"}`} />
              {status === "deployed" ? "Live" : isFailed ? "Failed" : isInProgress ? "Deploying" : null}
            </div>
          )}
          {status === "deployed" && deploymentName && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => window.open(`https://${deploymentName}.surgent.dev`, "_blank")}
            >
              <ExternalLink className="h-4 w-4" />
              Open
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="bg-brand hover:bg-brand/90 text-brand-foreground"
                onClick={handlePublishClick}
                disabled={!projectId || isDeploying || isInProgress || isCheckingAccess}
              >
                <Rocket className="h-4 w-4" />
                {isCheckingAccess ? "Checking..." : isInProgress ? "Publishing..." : status === "deployed" ? "Republish" : "Publish"}
              </Button>
            </TooltipTrigger>
            {errorMsg && <TooltipContent>{errorMsg}</TooltipContent>}
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 rounded-full p-0"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user?.image} alt={user?.name || user?.email} />
                  <AvatarFallback className="bg-brand text-brand-foreground text-sm font-medium">
                    {user?.name?.charAt(0) || user?.email?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="py-3">
                <div className="flex flex-col space-y-1">
                  <span className="font-medium text-base">
                    {user?.name || user?.email}
                  </span>
                  {customer && (
                    <span className="text-xs rounded-full bg-muted px-2 py-0.5 w-fit text-brand font-semibold mt-1">
                      {customer.products[0]?.name || "Free"} Plan
                    </span>
                  )}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/pricing")}>
                <CreditCard className="mr-2 h-4 w-4" />
                Billing & Plans
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <DeployDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        defaultName={deploymentName}
        onConfirm={handleConfirmDeploy}
        isSubmitting={isDeploying}
      />

      <PaywallDialog
        open={isPaywallOpen}
        setOpen={setIsPaywallOpen}
        featureId="publish_your_app"
      />
    </>
  );
}

