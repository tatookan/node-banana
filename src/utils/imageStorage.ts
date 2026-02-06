import { WorkflowNode, WorkflowNodeData } from "@/types";
import { WorkflowFile } from "@/store/workflowStore";

/**
 * Generate a unique image ID for external storage
 */
export function generateImageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `img-${timestamp}-${random}`;
}

/**
 * Check if a string is a base64 data URL
 */
function isBase64DataUrl(str: string | null | undefined): str is string {
  return typeof str === "string" && str.startsWith("data:");
}

/**
 * Extract and save all images from a workflow, replacing base64 data with refs
 * Returns a new workflow object with image refs instead of base64 data
 * @param saveMode - "template": skip AI results, "results": save everything, "auto": decide based on content
 */
export async function externalizeWorkflowImages(
  workflow: WorkflowFile,
  workflowPath: string,
  saveMode: "template" | "results" | "auto" = "results"
): Promise<WorkflowFile> {
  const externalizedNodes: WorkflowNode[] = [];
  const savedImageIds = new Map<string, string>(); // base64 hash -> imageId (for deduplication)

  for (const node of workflow.nodes) {
    const newNode = await externalizeNodeImages(node, workflowPath, savedImageIds, saveMode);
    externalizedNodes.push(newNode);
  }

  return {
    ...workflow,
    nodes: externalizedNodes,
  };
}

/**
 * Externalize images from a single node
 * @param saveMode - "template": skip AI results, "results": save everything, "auto": decide based on content
 */
async function externalizeNodeImages(
  node: WorkflowNode,
  workflowPath: string,
  savedImageIds: Map<string, string>,
  saveMode: "template" | "results" | "auto" = "results"
): Promise<WorkflowNode> {
  const data = node.data as WorkflowNodeData;
  let newData: WorkflowNodeData;

  switch (node.type) {
    case "imageInput": {
      const d = data as import("@/types").ImageInputNodeData;
      if (isBase64DataUrl(d.image)) {
        const imageId = await saveImageAndGetId(d.image, workflowPath, savedImageIds, "inputs");
        newData = {
          ...d,
          image: null,
          imageRef: imageId,
        };
      } else {
        newData = d;
      }
      break;
    }

    case "annotation": {
      const d = data as import("@/types").AnnotationNodeData;
      let sourceImageRef = d.sourceImageRef;
      let outputImageRef = d.outputImageRef;
      let sourceImage = d.sourceImage;
      let outputImage = d.outputImage;

      // Annotation images are user-created, save to inputs
      if (isBase64DataUrl(d.sourceImage)) {
        sourceImageRef = await saveImageAndGetId(d.sourceImage, workflowPath, savedImageIds, "inputs");
        sourceImage = null;
      }
      if (isBase64DataUrl(d.outputImage)) {
        outputImageRef = await saveImageAndGetId(d.outputImage, workflowPath, savedImageIds, "inputs");
        outputImage = null;
      }

      newData = {
        ...d,
        sourceImage,
        sourceImageRef,
        outputImage,
        outputImageRef,
      };
      break;
    }

    case "nanoBanana": {
      const d = data as import("@/types").NanoBananaNodeData;
      let outputImageRef = d.outputImageRef;
      let outputImage = d.outputImage;
      const inputImageRefs: string[] = [];
      const inputImages: string[] = [];

      // Handle output image - AI generated, save to generations (unless template mode)
      // Template mode: skip AI output; Results/Auto mode: save normally
      const shouldSaveOutput = saveMode !== "template" && isBase64DataUrl(d.outputImage);
      if (shouldSaveOutput) {
        outputImageRef = await saveImageAndGetId(d.outputImage!, workflowPath, savedImageIds, "generations");
        outputImage = null;
      } else if (saveMode === "template") {
        // Template mode: clear AI output
        outputImage = null;
        outputImageRef = undefined;
      }

      // Handle input images array (these come from connected nodes, save to inputs if present)
      for (const img of d.inputImages) {
        if (isBase64DataUrl(img)) {
          const ref = await saveImageAndGetId(img, workflowPath, savedImageIds, "inputs");
          inputImageRefs.push(ref);
          inputImages.push(""); // Empty placeholder
        } else {
          inputImages.push(img);
        }
      }

      newData = {
        ...d,
        inputImages: inputImages.length > 0 && inputImages.every(i => i === "") ? [] : inputImages,
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
        outputImage,
        outputImageRef,
      };
      break;
    }

    case "llmGenerate": {
      const d = data as import("@/types").LLMGenerateNodeData;
      const inputImageRefs: string[] = [];
      const inputImages: string[] = [];

      // Handle input images array (save to inputs)
      for (const img of d.inputImages) {
        if (isBase64DataUrl(img)) {
          const ref = await saveImageAndGetId(img, workflowPath, savedImageIds, "inputs");
          inputImageRefs.push(ref);
          inputImages.push(""); // Empty placeholder
        } else {
          inputImages.push(img);
        }
      }

      newData = {
        ...d,
        inputImages: inputImages.length > 0 && inputImages.every(i => i === "") ? [] : inputImages,
        inputImageRefs: inputImageRefs.length > 0 ? inputImageRefs : undefined,
      };
      break;
    }

    case "output": {
      const d = data as import("@/types").OutputNodeData;
      // Output displays generated content, save to generations (unless template mode)
      const shouldSaveOutput = saveMode !== "template" && isBase64DataUrl(d.image);
      if (shouldSaveOutput) {
        const imageId = await saveImageAndGetId(d.image!, workflowPath, savedImageIds, "generations");
        newData = {
          ...d,
          image: null,
          imageRef: imageId,
        };
      } else if (saveMode === "template") {
        // Template mode: clear output
        newData = {
          ...d,
          image: null,
          imageRef: undefined,
        };
      } else {
        newData = d;
      }
      break;
    }

    case "splitGrid": {
      const d = data as import("@/types").SplitGridNodeData;
      // SplitGrid source is input content, save to inputs
      if (isBase64DataUrl(d.sourceImage)) {
        const imageId = await saveImageAndGetId(d.sourceImage, workflowPath, savedImageIds, "inputs");
        newData = {
          ...d,
          sourceImage: null,
          sourceImageRef: imageId,
        };
      } else {
        newData = d;
      }
      break;
    }

    default:
      newData = data;
  }

  return {
    ...node,
    data: newData,
  } as WorkflowNode;
}

/**
 * Save an image and return its ID (with deduplication)
 * @param folder - "inputs" for user-uploaded images, "generations" for AI-generated images
 */
async function saveImageAndGetId(
  imageData: string,
  workflowPath: string,
  savedImageIds: Map<string, string>,
  folder: "inputs" | "generations" = "inputs"
): Promise<string> {
  // Create a hash using length + samples from different parts of the data
  // This avoids issues where all images of the same format have identical headers
  // Include folder in hash so same image in different folders gets different IDs
  const len = imageData.length;
  const mid = Math.floor(len / 2);
  const hash = `${folder}-${len}-${imageData.substring(50, 100)}-${imageData.substring(mid, mid + 50)}-${imageData.substring(Math.max(0, len - 50))}`;

  if (savedImageIds.has(hash)) {
    return savedImageIds.get(hash)!;
  }

  const imageId = generateImageId();

  const response = await fetch("/api/workflow-images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workflowPath,
      imageId,
      imageData,
      folder,
    }),
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(`Failed to save image: ${result.error}`);
  }

  savedImageIds.set(hash, imageId);
  return imageId;
}

/**
 * Load all external images into a workflow, replacing refs with base64 data
 * Returns a new workflow object with base64 data instead of refs
 */
export async function hydrateWorkflowImages(
  workflow: WorkflowFile,
  workflowPath: string
): Promise<WorkflowFile> {
  const hydratedNodes: WorkflowNode[] = [];
  const loadedImages = new Map<string, string>(); // imageId -> base64 (for caching)

  for (const node of workflow.nodes) {
    const newNode = await hydrateNodeImages(node, workflowPath, loadedImages);
    hydratedNodes.push(newNode);
  }

  return {
    ...workflow,
    nodes: hydratedNodes,
  };
}

/**
 * Hydrate images for a single node
 */
async function hydrateNodeImages(
  node: WorkflowNode,
  workflowPath: string,
  loadedImages: Map<string, string>
): Promise<WorkflowNode> {
  const data = node.data as WorkflowNodeData;
  let newData: WorkflowNodeData;

  switch (node.type) {
    case "imageInput": {
      const d = data as import("@/types").ImageInputNodeData;
      if (d.imageRef && !d.image) {
        const image = await loadImageById(d.imageRef, workflowPath, loadedImages, "inputs");
        newData = {
          ...d,
          image,
        };
      } else {
        newData = d;
      }
      break;
    }

    case "annotation": {
      const d = data as import("@/types").AnnotationNodeData;
      let sourceImage = d.sourceImage;
      let outputImage = d.outputImage;

      if (d.sourceImageRef && !d.sourceImage) {
        sourceImage = await loadImageById(d.sourceImageRef, workflowPath, loadedImages, "inputs");
      }
      if (d.outputImageRef && !d.outputImage) {
        outputImage = await loadImageById(d.outputImageRef, workflowPath, loadedImages, "inputs");
      }

      newData = {
        ...d,
        sourceImage,
        outputImage,
      };
      break;
    }

    case "nanoBanana": {
      const d = data as import("@/types").NanoBananaNodeData;
      let outputImage = d.outputImage;
      const inputImages = [...d.inputImages];

      if (d.outputImageRef && !d.outputImage) {
        outputImage = await loadImageById(d.outputImageRef, workflowPath, loadedImages, "generations");
      }

      // Hydrate input images from refs
      if (d.inputImageRefs && d.inputImageRefs.length > 0) {
        for (let i = 0; i < d.inputImageRefs.length; i++) {
          const ref = d.inputImageRefs[i];
          if (ref) {
            inputImages[i] = await loadImageById(ref, workflowPath, loadedImages, "inputs");
          }
        }
      }

      newData = {
        ...d,
        inputImages,
        outputImage,
      };
      break;
    }

    case "llmGenerate": {
      const d = data as import("@/types").LLMGenerateNodeData;
      const inputImages = [...d.inputImages];

      // Hydrate input images from refs
      if (d.inputImageRefs && d.inputImageRefs.length > 0) {
        for (let i = 0; i < d.inputImageRefs.length; i++) {
          const ref = d.inputImageRefs[i];
          if (ref) {
            inputImages[i] = await loadImageById(ref, workflowPath, loadedImages, "inputs");
          }
        }
      }

      newData = {
        ...d,
        inputImages,
      };
      break;
    }

    case "output": {
      const d = data as import("@/types").OutputNodeData;
      if (d.imageRef && !d.image) {
        const image = await loadImageById(d.imageRef, workflowPath, loadedImages, "generations");
        newData = {
          ...d,
          image,
        };
      } else {
        newData = d;
      }
      break;
    }

    case "splitGrid": {
      const d = data as import("@/types").SplitGridNodeData;
      if (d.sourceImageRef && !d.sourceImage) {
        const sourceImage = await loadImageById(d.sourceImageRef, workflowPath, loadedImages, "inputs");
        newData = {
          ...d,
          sourceImage,
        };
      } else {
        newData = d;
      }
      break;
    }

    default:
      newData = data;
  }

  return {
    ...node,
    data: newData,
  } as WorkflowNode;
}

/**
 * Load an image by ID (with caching)
 * @param folder - Optional hint for which folder to check first
 */
async function loadImageById(
  imageId: string,
  workflowPath: string,
  loadedImages: Map<string, string>,
  folder?: "inputs" | "generations"
): Promise<string> {
  if (loadedImages.has(imageId)) {
    return loadedImages.get(imageId)!;
  }

  const params = new URLSearchParams({
    workflowPath,
    imageId,
  });
  if (folder) {
    params.set("folder", folder);
  }

  const response = await fetch(`/api/workflow-images?${params.toString()}`);

  const result = await response.json();

  if (!result.success) {
    console.error(`Failed to load image ${imageId}: ${result.error}`);
    return ""; // Return empty string on error to avoid breaking the workflow
  }

  loadedImages.set(imageId, result.image);
  return result.image;
}
