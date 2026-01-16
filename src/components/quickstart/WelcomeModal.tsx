"use client";

import { useState, useCallback, useRef } from "react";
import { WorkflowFile } from "@/store/workflowStore";
import { QuickstartView } from "@/types/quickstart";
import { QuickstartInitialView } from "./QuickstartInitialView";
import { QuickstartTemplatesView } from "./QuickstartTemplatesView";
import { PromptWorkflowView } from "./PromptWorkflowView";

interface WelcomeModalProps {
  onWorkflowGenerated: (workflow: WorkflowFile) => void;
  onClose: () => void;
}

export function WelcomeModal({
  onWorkflowGenerated,
  onClose,
}: WelcomeModalProps) {
  const [currentView, setCurrentView] = useState<QuickstartView>("initial");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectBlankCanvas = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleSelectTemplates = useCallback(() => {
    setCurrentView("templates");
  }, []);

  const handleSelectVibe = useCallback(() => {
    setCurrentView("vibe");
  }, []);

  const handleSelectLoad = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const workflow = JSON.parse(
            event.target?.result as string
          ) as WorkflowFile;
          if (workflow.version && workflow.nodes && workflow.edges) {
            onWorkflowGenerated(workflow);
          } else {
            alert("无效的工作流文件格式");
          }
        } catch {
          alert("解析工作流文件失败");
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be loaded again
      e.target.value = "";
    },
    [onWorkflowGenerated]
  );

  const handleBack = useCallback(() => {
    setCurrentView("initial");
  }, []);

  const handleWorkflowSelected = useCallback(
    (workflow: WorkflowFile) => {
      onWorkflowGenerated(workflow);
    },
    [onWorkflowGenerated]
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl mx-4 bg-neutral-800 rounded-xl border border-neutral-700 shadow-2xl overflow-hidden">
        {currentView === "initial" && (
          <QuickstartInitialView
            onSelectBlankCanvas={handleSelectBlankCanvas}
            onSelectTemplates={handleSelectTemplates}
            onSelectVibe={handleSelectVibe}
            onSelectLoad={handleSelectLoad}
          />
        )}
        {currentView === "templates" && (
          <QuickstartTemplatesView
            onBack={handleBack}
            onWorkflowSelected={handleWorkflowSelected}
          />
        )}
        {currentView === "vibe" && (
          <PromptWorkflowView
            onBack={handleBack}
            onWorkflowGenerated={handleWorkflowSelected}
          />
        )}
      </div>

      {/* Hidden file input for loading workflows */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />
    </div>
  );
}
