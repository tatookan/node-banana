"use client";

import { useEffect, useState } from "react";

interface Props {
  isOpen: boolean;
  imageSrc: string | null;
  alt?: string;
  onClose: () => void;
}

export function ImagePreviewModal({ isOpen, imageSrc, alt = "图片预览", onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  }, [isOpen]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.1), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    setScale((prev) => prev === 1 ? 2 : 1);
    setPosition({ x: 0, y: 0 });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !imageSrc) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 overflow-hidden"
      onClick={onClose}
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <img
          src={imageSrc}
          alt={alt}
          className="max-w-full max-h-[90vh] object-contain cursor-grab active:cursor-grabbing select-none"
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          draggable={false}
        />

        {/* Zoom indicator */}
        {scale !== 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-neutral-800/80 text-white text-xs px-3 py-1.5 rounded-full">
            {Math.round(scale * 100)}%
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 bg-neutral-800/80 hover:bg-neutral-700 rounded-full flex items-center justify-center text-white transition-colors"
          title="关闭 (ESC)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Hint */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-neutral-800/80 text-white text-xs px-3 py-1.5 rounded-full opacity-70">
          滚轮缩放 • 拖动移动 • 双击重置
        </div>
      </div>
    </div>
  );
}
