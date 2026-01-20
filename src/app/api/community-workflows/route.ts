import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export interface CommunityWorkflowMeta {
  id: string;
  name: string;
  filename: string;
  author: string;
  size: number;
}

/**
 * Derive a readable name from a workflow filename
 * Examples:
 * - contact-sheet-billsSupra.json → "Bills Supra"
 * - contact-sheet-ChrisWalkman.json → "Chris Walkman"
 * - workflow-2025-12-07.json → "Workflow 2025-12-07"
 */
function deriveNameFromFilename(filename: string): string {
  // Remove .json extension
  const nameWithoutExt = filename.replace(/\.json$/, "");

  // Handle contact-sheet- prefix
  if (nameWithoutExt.startsWith("contact-sheet-")) {
    const namePart = nameWithoutExt.replace("contact-sheet-", "");
    // Split camelCase and capitalize
    return namePart
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (s) => s.toUpperCase());
  }

  // Handle workflow- prefix
  if (nameWithoutExt.startsWith("workflow-")) {
    return nameWithoutExt
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Default: capitalize words
  return nameWithoutExt
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get Chinese name for community workflows
 */
function getChineseName(filename: string): string {
  const nameMap: Record<string, string> = {
    "contact-sheet-ChrisWalkman.json": "克里斯·沃克曼",
    "contact-sheet-billsSupra.json": "比尔 supra",
    "contact-sheet-jpow.json": "鲍威尔",
    "contact-sheet-tim.json": "蒂姆",
  };
  return nameMap[filename] || deriveNameFromFilename(filename);
}

/**
 * GET: List all community workflows from the examples directory
 */
export async function GET() {
  try {
    const examplesDir = path.join(process.cwd(), "examples");

    // Check if examples directory exists
    try {
      await fs.access(examplesDir);
    } catch {
      return NextResponse.json({
        success: true,
        workflows: [],
      });
    }

    // Read directory contents
    const files = await fs.readdir(examplesDir);

    // Filter for JSON files (exclude directories like sample-images)
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    // Get metadata for each workflow
    const workflows: CommunityWorkflowMeta[] = await Promise.all(
      jsonFiles.map(async (filename) => {
        const filePath = path.join(examplesDir, filename);
        const stats = await fs.stat(filePath);

        return {
          id: filename.replace(/\.json$/, ""),
          name: getChineseName(filename),
          filename,
          author: "心视觉",
          size: stats.size,
        };
      })
    );

    return NextResponse.json({
      success: true,
      workflows,
    });
  } catch (error) {
    console.error("Error listing community workflows:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to list community workflows",
      },
      { status: 500 }
    );
  }
}
