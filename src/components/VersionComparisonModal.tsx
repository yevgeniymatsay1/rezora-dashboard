import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import { diffLines, createTwoFilesPatch } from "diff";
import { Check, X, ArrowRight } from "@phosphor-icons/react";
import "react-diff-view/style/index.css";

interface PromptVersion {
  id: string;
  version_number: number;
  base_prompt: string;
  states: any[];
  generation_context?: any;
  created_at: string;
  markdown_source?: string;
}

interface VersionComparisonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalVersion: PromptVersion;
  comparedVersion: PromptVersion;
  onSelectVersion: (versionId: string) => void;
}

export function VersionComparisonModal({
  open,
  onOpenChange,
  originalVersion,
  comparedVersion,
  onSelectVersion,
}: VersionComparisonModalProps) {
  const [selectedTab, setSelectedTab] = useState<"markdown" | "base_prompt">("markdown");

  // Calculate quality score delta
  const originalScore = originalVersion.generation_context?.quality_validation?.score ?? null;
  const comparedScore = comparedVersion.generation_context?.quality_validation?.score ?? null;
  const scoreDelta = originalScore !== null && comparedScore !== null ? comparedScore - originalScore : null;
  const qualityRegressed = scoreDelta !== null && scoreDelta < 0;

  // Generate diff for markdown source (if available) or base_prompt
  const diff = useMemo(() => {
    const sourceField = selectedTab === "markdown" ? "markdown_source" : "base_prompt";
    const oldText = originalVersion[sourceField] || "";
    const newText = comparedVersion[sourceField] || "";

    if (!oldText || !newText) {
      return null;
    }

    // Use diff library to generate unified diff format
    const diffText = createTwoFilesPatch(
      `v${originalVersion.version_number}`,
      `v${comparedVersion.version_number}`,
      oldText,
      newText,
      "",
      "",
      { context: 3 }
    );

    // Parse diff for react-diff-view
    const files = parseDiff(diffText);
    return files[0];
  }, [originalVersion, comparedVersion, selectedTab]);

  // Render widgets for special tokens
  const renderToken = (token: any) => {
    const { type, content } = token;

    if (type === "insert") {
      return (
        <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
          {content}
        </span>
      );
    }

    if (type === "delete") {
      return (
        <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 line-through">
          {content}
        </span>
      );
    }

    return content;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span>Version Comparison</span>
              <div className="flex items-center gap-2 text-sm font-normal">
                <Badge variant="outline">
                  v{originalVersion.version_number}
                  {originalScore !== null && ` (Score: ${originalScore})`}
                </Badge>
                <ArrowRight size={16} className="text-muted-foreground" />
                <Badge variant={qualityRegressed ? "destructive" : "default"}>
                  v{comparedVersion.version_number}
                  {comparedScore !== null && ` (Score: ${comparedScore})`}
                </Badge>
              </div>
            </div>
            {scoreDelta !== null && (
              <Badge
                variant={qualityRegressed ? "destructive" : "default"}
                className="text-sm font-semibold"
              >
                {scoreDelta > 0 ? "+" : ""}
                {scoreDelta} points
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Quality regression warning */}
          {qualityRegressed && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 flex items-start gap-2">
              <X size={20} className="text-destructive mt-0.5" weight="bold" />
              <div className="flex-1 text-sm">
                <p className="font-semibold text-destructive">Quality Regression Detected</p>
                <p className="text-muted-foreground mt-1">
                  The refined version scored {Math.abs(scoreDelta!)} points lower than the original.
                  Review the changes carefully before selecting which version to use.
                </p>
              </div>
            </div>
          )}

          {/* Tabs for markdown vs compiled view */}
          <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="markdown" disabled={!originalVersion.markdown_source && !comparedVersion.markdown_source}>
                Markdown Source
              </TabsTrigger>
              <TabsTrigger value="base_prompt">
                Compiled Base Prompt
              </TabsTrigger>
            </TabsList>

            <TabsContent value={selectedTab} className="mt-4">
              <ScrollArea className="h-[500px] border rounded-lg bg-secondary/20">
                {diff ? (
                  <Diff
                    viewType="split"
                    diffType={diff.type}
                    hunks={diff.hunks}
                    tokens={diff.tokens}
                    renderToken={renderToken}
                  >
                    {(hunks) =>
                      hunks.map((hunk) => (
                        <Hunk key={hunk.content} hunk={hunk} />
                      ))
                    }
                  </Diff>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm text-muted-foreground">
                      {selectedTab === "markdown" && !originalVersion.markdown_source
                        ? "Legacy version - markdown source not available"
                        : "No differences to show"}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              Select which version to use
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onSelectVersion(originalVersion.id);
                  onOpenChange(false);
                }}
              >
                <Check size={16} className="mr-2" />
                Use Version {originalVersion.version_number}
              </Button>
              <Button
                onClick={() => {
                  onSelectVersion(comparedVersion.id);
                  onOpenChange(false);
                }}
              >
                <Check size={16} className="mr-2" />
                Use Version {comparedVersion.version_number}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
